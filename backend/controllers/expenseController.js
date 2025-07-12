const Expense = require('../models/Expense');
const Category = require('../models/Category');
const Budget = require('../models/Budget');
const User = require('../models/User');
const categorizeExpense = require('../utils/categorizeExpense');
const { validationResult } = require('express-validator');
const winston = require('winston');
const mongoose = require('mongoose');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console()
    ]
});

// Add expense
exports.addExpense = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { 
            description, 
            amount, 
            category, 
            subcategory,
            date,
            paymentMethod,
            currency,
            location,
            notes,
            tags,
            isRecurring,
            recurringPattern
        } = req.body;

        const userId = req.user.id;
        
        // Auto-categorize if no category provided
        let finalCategory = category;
        if (!category) {
            finalCategory = categorizeExpense(description);
            
            // Try to find better category using ML/rules
            try {
                const matchingCategory = await Category.findMatchingCategory(userId, { description, amount });
                if (matchingCategory) {
                    finalCategory = matchingCategory.name;
                }
            } catch (error) {
                logger.warn('Category matching failed:', error);
            }
        }

        // Create expense
        const newExpense = new Expense({
            description,
            amount,
            category: finalCategory,
            subcategory,
            date: date || new Date(),
            paymentMethod: paymentMethod || 'cash',
            currency: currency || 'USD',
            location,
            notes,
            tags: tags || [],
            isRecurring: isRecurring || false,
            recurringPattern: isRecurring ? recurringPattern : undefined,
            userId: userId,
            metadata: {
                source: 'manual',
                autoCategorizationUsed: !category,
                confidence: category ? 1 : 0.8
            }
        });

        const savedExpense = await newExpense.save();

        // Update user stats
        try {
            const user = await User.findById(userId);
            await user.updateStats(savedExpense);
        } catch (error) {
            logger.warn('Failed to update user stats:', error);
        }

        // Update category statistics
        try {
            const categoryDoc = await Category.findOne({ userId, name: finalCategory });
            if (categoryDoc) {
                await categoryDoc.updateStatistics(savedExpense, true);
            }
        } catch (error) {
            logger.warn('Failed to update category stats:', error);
        }

        // Update budget if applicable
        try {
            const activeBudgets = await Budget.getActiveBudgets(userId);
            const relevantBudget = activeBudgets.find(budget => 
                budget.categories.some(cat => cat.categoryId.name === finalCategory)
            );
            
            if (relevantBudget) {
                await relevantBudget.addExpense(savedExpense);
            }
        } catch (error) {
            logger.warn('Failed to update budget:', error);
        }

        // Create recurring expense if needed
        if (isRecurring && recurringPattern) {
            try {
                const nextExpense = savedExpense.createNextRecurring();
                if (nextExpense) {
                    await nextExpense.save();
                }
            } catch (error) {
                logger.warn('Failed to create recurring expense:', error);
            }
        }

        // Notify via WebSocket
        const io = req.app.get('io');
        if (io) {
            io.to(`user-${userId}`).emit('expense-added', {
                expense: savedExpense,
                userId: userId
            });
        }

        res.status(201).json({
            success: true,
            expense: savedExpense,
            message: 'Expense added successfully'
        });

    } catch (error) {
        logger.error('Error adding expense:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to add expense',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get expenses
exports.getExpenses = async (req, res) => {
    try {
        const userId = req.user.id;
        const { 
            page = 1, 
            limit = 50, 
            category, 
            startDate, 
            endDate,
            minAmount,
            maxAmount,
            paymentMethod,
            tags,
            search,
            sortBy = 'date',
            sortOrder = 'desc'
        } = req.query;

        // Build query
        const query = { 
            userId: userId,
            isDeleted: false 
        };

        // Apply filters
        if (category) query.category = category;
        if (startDate || endDate) {
            query.date = {};
            if (startDate) query.date.$gte = new Date(startDate);
            if (endDate) query.date.$lte = new Date(endDate);
        }
        if (minAmount || maxAmount) {
            query.amount = {};
            if (minAmount) query.amount.$gte = parseFloat(minAmount);
            if (maxAmount) query.amount.$lte = parseFloat(maxAmount);
        }
        if (paymentMethod) query.paymentMethod = paymentMethod;
        if (tags) {
            const tagArray = tags.split(',');
            query.tags = { $in: tagArray };
        }
        if (search) {
            query.$or = [
                { description: { $regex: search, $options: 'i' } },
                { notes: { $regex: search, $options: 'i' } }
            ];
        }

        // Execute query with pagination
        const options = {
            page: parseInt(page),
            limit: parseInt(limit),
            sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 },
            populate: [
                { path: 'budget.budgetId', select: 'name' }
            ]
        };

        const expenses = await Expense.paginate(query, options);

        // Get summary statistics
        const totalStats = await Expense.aggregate([
            { $match: query },
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 },
                    avgAmount: { $avg: '$amount' },
                    maxAmount: { $max: '$amount' },
                    minAmount: { $min: '$amount' }
                }
            }
        ]);

        const stats = totalStats.length > 0 ? totalStats[0] : {
            totalAmount: 0,
            count: 0,
            avgAmount: 0,
            maxAmount: 0,
            minAmount: 0
        };

        res.json({
            success: true,
            expenses: expenses.docs,
            pagination: {
                page: expenses.page,
                limit: expenses.limit,
                totalPages: expenses.totalPages,
                totalDocs: expenses.totalDocs,
                hasNextPage: expenses.hasNextPage,
                hasPrevPage: expenses.hasPrevPage
            },
            stats
        });

    } catch (error) {
        logger.error('Error getting expenses:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get expenses',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get expense by ID
exports.getExpenseById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const expense = await Expense.findOne({ 
            _id: id, 
            userId: userId,
            isDeleted: false 
        });

        if (!expense) {
            return res.status(404).json({ 
                success: false, 
                message: 'Expense not found' 
            });
        }

        res.json({
            success: true,
            expense
        });

    } catch (error) {
        logger.error('Error getting expense:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get expense',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Update expense
exports.updateExpense = async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { id } = req.params;
        const userId = req.user.id;
        const updateData = req.body;

        const expense = await Expense.findOne({ 
            _id: id, 
            userId: userId,
            isDeleted: false 
        });

        if (!expense) {
            return res.status(404).json({ 
                success: false, 
                message: 'Expense not found' 
            });
        }

        // Update expense fields
        Object.keys(updateData).forEach(key => {
            if (key !== 'userId' && key !== '_id') {
                expense[key] = updateData[key];
            }
        });

        const updatedExpense = await expense.save();

        // Notify via WebSocket
        const io = req.app.get('io');
        if (io) {
            io.to(`user-${userId}`).emit('expense-updated', {
                expense: updatedExpense,
                userId: userId
            });
        }

        res.json({
            success: true,
            expense: updatedExpense,
            message: 'Expense updated successfully'
        });

    } catch (error) {
        logger.error('Error updating expense:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update expense',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Delete expense
exports.deleteExpense = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const expense = await Expense.findOne({ 
            _id: id, 
            userId: userId,
            isDeleted: false 
        });

        if (!expense) {
            return res.status(404).json({ 
                success: false, 
                message: 'Expense not found' 
            });
        }

        // Soft delete
        await expense.softDelete();

        // Notify via WebSocket
        const io = req.app.get('io');
        if (io) {
            io.to(`user-${userId}`).emit('expense-deleted', {
                expenseId: id,
                userId: userId
            });
        }

        res.json({
            success: true,
            message: 'Expense deleted successfully'
        });

    } catch (error) {
        logger.error('Error deleting expense:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to delete expense',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Bulk operations
exports.bulkUpdateExpenses = async (req, res) => {
    try {
        const { expenseIds, updateData } = req.body;
        const userId = req.user.id;

        if (!expenseIds || !Array.isArray(expenseIds) || expenseIds.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Expense IDs are required' 
            });
        }

        const result = await Expense.updateMany(
            { 
                _id: { $in: expenseIds }, 
                userId: userId,
                isDeleted: false 
            },
            { 
                ...updateData,
                updatedAt: new Date()
            }
        );

        res.json({
            success: true,
            message: `${result.modifiedCount} expenses updated successfully`,
            modifiedCount: result.modifiedCount
        });

    } catch (error) {
        logger.error('Error bulk updating expenses:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to update expenses',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Bulk delete
exports.bulkDeleteExpenses = async (req, res) => {
    try {
        const { expenseIds } = req.body;
        const userId = req.user.id;

        if (!expenseIds || !Array.isArray(expenseIds) || expenseIds.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Expense IDs are required' 
            });
        }

        const result = await Expense.updateMany(
            { 
                _id: { $in: expenseIds }, 
                userId: userId,
                isDeleted: false 
            },
            { 
                isDeleted: true,
                deletedAt: new Date(),
                updatedAt: new Date()
            }
        );

        res.json({
            success: true,
            message: `${result.modifiedCount} expenses deleted successfully`,
            deletedCount: result.modifiedCount
        });

    } catch (error) {
        logger.error('Error bulk deleting expenses:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to delete expenses',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get expense statistics
exports.getExpenseStats = async (req, res) => {
    try {
        const userId = req.user.id;
        const { period = 'month' } = req.query;

        let startDate = new Date();
        switch (period) {
            case 'week':
                startDate.setDate(startDate.getDate() - 7);
                break;
            case 'month':
                startDate.setMonth(startDate.getMonth() - 1);
                break;
            case 'year':
                startDate.setFullYear(startDate.getFullYear() - 1);
                break;
            default:
                startDate.setMonth(startDate.getMonth() - 1);
        }

        const stats = await Expense.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(userId),
                    date: { $gte: startDate },
                    isDeleted: false
                }
            },
            {
                $group: {
                    _id: '$category',
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 },
                    avgAmount: { $avg: '$amount' },
                    maxAmount: { $max: '$amount' },
                    minAmount: { $min: '$amount' }
                }
            },
            {
                $sort: { totalAmount: -1 }
            }
        ]);

        res.json({
            success: true,
            stats,
            period
        });

    } catch (error) {
        logger.error('Error getting expense stats:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get expense statistics',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};
