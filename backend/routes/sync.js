const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
const Category = require('../models/Category');
const Budget = require('../models/Budget');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');

// Get sync status
router.get('/status', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { deviceId } = req.query;

        // Get last sync timestamp for device
        const user = await User.findById(userId);
        const device = user.devices.find(d => d.deviceId === deviceId);
        
        if (!device) {
            return res.status(404).json({ message: 'Device not found' });
        }

        // Get counts of items since last sync
        const lastSync = device.lastSyncAt;
        const expenseCount = await Expense.countDocuments({
            userId: userId,
            updatedAt: { $gt: lastSync },
            isDeleted: false
        });

        const categoryCount = await Category.countDocuments({
            userId: userId,
            updatedAt: { $gt: lastSync },
            isActive: true
        });

        const budgetCount = await Budget.countDocuments({
            userId: userId,
            updatedAt: { $gt: lastSync },
            isActive: true
        });

        res.json({
            deviceId,
            lastSyncAt: lastSync,
            pendingChanges: {
                expenses: expenseCount,
                categories: categoryCount,
                budgets: budgetCount
            },
            needsSync: expenseCount > 0 || categoryCount > 0 || budgetCount > 0
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get changes since last sync
router.get('/changes', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { deviceId, since } = req.query;

        const sinceDate = since ? new Date(since) : new Date(0);

        // Get changed expenses
        const expenses = await Expense.find({
            userId: userId,
            updatedAt: { $gt: sinceDate }
        }).sort({ updatedAt: 1 });

        // Get changed categories
        const categories = await Category.find({
            userId: userId,
            updatedAt: { $gt: sinceDate }
        }).sort({ updatedAt: 1 });

        // Get changed budgets
        const budgets = await Budget.find({
            userId: userId,
            updatedAt: { $gt: sinceDate }
        }).sort({ updatedAt: 1 });

        res.json({
            timestamp: new Date(),
            changes: {
                expenses: expenses.map(exp => ({
                    id: exp._id,
                    action: exp.isDeleted ? 'delete' : 'upsert',
                    data: exp.isDeleted ? null : exp,
                    updatedAt: exp.updatedAt
                })),
                categories: categories.map(cat => ({
                    id: cat._id,
                    action: cat.isActive ? 'upsert' : 'delete',
                    data: cat.isActive ? cat : null,
                    updatedAt: cat.updatedAt
                })),
                budgets: budgets.map(budget => ({
                    id: budget._id,
                    action: budget.isActive ? 'upsert' : 'delete',
                    data: budget.isActive ? budget : null,
                    updatedAt: budget.updatedAt
                }))
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Push changes to server
router.post('/push', auth, [
    body('deviceId').notEmpty().withMessage('Device ID is required'),
    body('changes').isObject().withMessage('Changes must be an object'),
    body('changes.expenses').optional().isArray().withMessage('Expenses must be an array'),
    body('changes.categories').optional().isArray().withMessage('Categories must be an array'),
    body('changes.budgets').optional().isArray().withMessage('Budgets must be an array')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const userId = req.user.id;
        const { deviceId, changes } = req.body;
        const conflicts = [];
        const processed = {
            expenses: [],
            categories: [],
            budgets: []
        };

        // Process expenses
        if (changes.expenses && changes.expenses.length > 0) {
            for (const change of changes.expenses) {
                const result = await processSyncChange(
                    Expense, 
                    change, 
                    userId, 
                    deviceId,
                    session
                );
                
                if (result.conflict) {
                    conflicts.push(result.conflict);
                } else {
                    processed.expenses.push(result.item);
                }
            }
        }

        // Process categories
        if (changes.categories && changes.categories.length > 0) {
            for (const change of changes.categories) {
                const result = await processSyncChange(
                    Category, 
                    change, 
                    userId, 
                    deviceId,
                    session
                );
                
                if (result.conflict) {
                    conflicts.push(result.conflict);
                } else {
                    processed.categories.push(result.item);
                }
            }
        }

        // Process budgets
        if (changes.budgets && changes.budgets.length > 0) {
            for (const change of changes.budgets) {
                const result = await processSyncChange(
                    Budget, 
                    change, 
                    userId, 
                    deviceId,
                    session
                );
                
                if (result.conflict) {
                    conflicts.push(result.conflict);
                } else {
                    processed.budgets.push(result.item);
                }
            }
        }

        // Update device sync timestamp
        await User.findByIdAndUpdate(userId, {
            $set: {
                'devices.$.lastSyncAt': new Date()
            }
        }, {
            arrayFilters: [{ 'device.deviceId': deviceId }],
            session
        });

        await session.commitTransaction();

        // Notify other devices via WebSocket
        const io = req.app.get('io');
        io.to(`user-${userId}`).emit('sync-update', {
            deviceId,
            changes: processed,
            timestamp: new Date()
        });

        res.json({
            success: true,
            conflicts,
            processed,
            timestamp: new Date()
        });

    } catch (error) {
        await session.abortTransaction();
        res.status(500).json({ message: error.message });
    } finally {
        session.endSession();
    }
});

// Resolve conflicts
router.post('/resolve-conflicts', auth, [
    body('conflicts').isArray().withMessage('Conflicts must be an array'),
    body('conflicts.*.id').notEmpty().withMessage('Conflict ID is required'),
    body('conflicts.*.resolution').isIn(['local', 'remote', 'merge']).withMessage('Invalid resolution strategy')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const userId = req.user.id;
        const { conflicts } = req.body;
        const resolved = [];

        for (const conflict of conflicts) {
            const { id, type, resolution, localData, remoteData } = conflict;
            
            let Model;
            switch (type) {
                case 'expense':
                    Model = Expense;
                    break;
                case 'category':
                    Model = Category;
                    break;
                case 'budget':
                    Model = Budget;
                    break;
                default:
                    continue;
            }

            let finalData;
            switch (resolution) {
                case 'local':
                    finalData = localData;
                    break;
                case 'remote':
                    finalData = remoteData;
                    break;
                case 'merge':
                    finalData = mergeConflictData(localData, remoteData);
                    break;
                default:
                    continue;
            }

            // Update the document
            const updated = await Model.findByIdAndUpdate(
                id,
                {
                    ...finalData,
                    'sync.conflictResolution.hasConflict': false,
                    'sync.conflictResolution.resolvedAt': new Date()
                },
                { 
                    new: true, 
                    session,
                    upsert: true
                }
            );

            resolved.push({
                id,
                type,
                resolution,
                data: updated
            });
        }

        await session.commitTransaction();

        res.json({
            success: true,
            resolved
        });

    } catch (error) {
        await session.abortTransaction();
        res.status(500).json({ message: error.message });
    } finally {
        session.endSession();
    }
});

// Register device
router.post('/register-device', auth, [
    body('deviceId').notEmpty().withMessage('Device ID is required'),
    body('deviceName').notEmpty().withMessage('Device name is required'),
    body('platform').isIn(['web', 'android', 'ios', 'windows', 'linux', 'macos']).withMessage('Invalid platform')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const userId = req.user.id;
        const { deviceId, deviceName, platform } = req.body;

        const user = await User.findById(userId);
        await user.addDevice({ deviceId, deviceName, platform });

        res.json({
            success: true,
            message: 'Device registered successfully',
            deviceId
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get device list
router.get('/devices', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId);
        
        const devices = user.devices.map(device => ({
            deviceId: device.deviceId,
            deviceName: device.deviceName,
            platform: device.platform,
            lastSyncAt: device.lastSyncAt,
            isActive: device.isActive
        }));

        res.json({ devices });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Helper function to process sync changes
async function processSyncChange(Model, change, userId, deviceId, session) {
    const { id, action, data, clientTimestamp } = change;

    try {
        if (action === 'delete') {
            const existing = await Model.findById(id).session(session);
            if (existing) {
                if (existing.updatedAt > new Date(clientTimestamp)) {
                    // Server version is newer, conflict
                    return {
                        conflict: {
                            id,
                            type: Model.modelName.toLowerCase(),
                            localData: data,
                            remoteData: existing,
                            reason: 'newer_version_exists'
                        }
                    };
                }
                
                // Safe to delete
                if (Model.modelName === 'Expense') {
                    await existing.softDelete();
                } else {
                    existing.isActive = false;
                    await existing.save({ session });
                }
            }
            
            return { item: { id, action: 'deleted' } };
        }

        // Create or update
        const existing = await Model.findById(id).session(session);
        
        if (existing) {
            // Check for conflicts
            if (existing.updatedAt > new Date(clientTimestamp)) {
                return {
                    conflict: {
                        id,
                        type: Model.modelName.toLowerCase(),
                        localData: data,
                        remoteData: existing,
                        reason: 'concurrent_modification'
                    }
                };
            }
            
            // Update existing
            Object.assign(existing, data);
            existing.sync.deviceId = deviceId;
            existing.sync.syncVersion += 1;
            await existing.save({ session });
            
            return { item: existing };
        } else {
            // Create new
            const newItem = new Model({
                ...data,
                _id: id,
                userId: userId,
                sync: {
                    deviceId,
                    syncVersion: 1,
                    lastSyncedAt: new Date()
                }
            });
            
            await newItem.save({ session });
            return { item: newItem };
        }
    } catch (error) {
        throw error;
    }
}

// Helper function to merge conflict data
function mergeConflictData(localData, remoteData) {
    // Simple merge strategy - prefer local for user-modified fields, remote for system fields
    const merged = { ...remoteData };
    
    // Fields that should prefer local changes
    const localPreferredFields = [
        'description', 'amount', 'category', 'notes', 'tags',
        'name', 'color', 'icon', 'keywords'
    ];
    
    localPreferredFields.forEach(field => {
        if (localData[field] !== undefined) {
            merged[field] = localData[field];
        }
    });
    
    // Merge arrays (tags, keywords, etc.)
    if (localData.tags && remoteData.tags) {
        merged.tags = [...new Set([...localData.tags, ...remoteData.tags])];
    }
    
    if (localData.keywords && remoteData.keywords) {
        merged.keywords = [...new Set([...localData.keywords, ...remoteData.keywords])];
    }
    
    return merged;
}

module.exports = router; 