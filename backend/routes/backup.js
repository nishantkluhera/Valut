const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
const Category = require('../models/Category');
const Budget = require('../models/Budget');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { Parser } = require('json2csv');
const csvParser = require('csv-parser');
const multer = require('multer');
const { body, validationResult } = require('express-validator');

// Configure multer for file uploads
const upload = multer({
    dest: 'uploads/',
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/json' || file.mimetype === 'text/csv') {
            cb(null, true);
        } else {
            cb(new Error('Only JSON and CSV files are allowed'));
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Export all data
router.get('/export', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { format = 'json', type = 'all' } = req.query;

        const data = {};

        // Get user data
        if (type === 'all' || type === 'user') {
            const user = await User.findById(userId).select('-password -resetPasswordToken -emailVerificationToken');
            data.user = user;
        }

        // Get expenses
        if (type === 'all' || type === 'expenses') {
            const expenses = await Expense.find({ userId, isDeleted: false })
                .sort({ date: -1 });
            data.expenses = expenses;
        }

        // Get categories
        if (type === 'all' || type === 'categories') {
            const categories = await Category.find({ userId, isActive: true })
                .sort({ name: 1 });
            data.categories = categories;
        }

        // Get budgets
        if (type === 'all' || type === 'budgets') {
            const budgets = await Budget.find({ userId, isActive: true })
                .sort({ startDate: -1 });
            data.budgets = budgets;
        }

        // Add metadata
        data.metadata = {
            exportedAt: new Date(),
            version: '2.0.0',
            format,
            type
        };

        if (format === 'csv') {
            return await exportAsCSV(data, res);
        } else {
            // JSON export
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="valut-backup-${Date.now()}.json"`);
            res.json(data);
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Export specific data type
router.get('/export/:type', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { type } = req.params;
        const { format = 'json' } = req.query;

        let data = [];
        let filename = '';

        switch (type) {
            case 'expenses':
                data = await Expense.find({ userId, isDeleted: false })
                    .sort({ date: -1 });
                filename = `valut-expenses-${Date.now()}`;
                break;
            case 'categories':
                data = await Category.find({ userId, isActive: true })
                    .sort({ name: 1 });
                filename = `valut-categories-${Date.now()}`;
                break;
            case 'budgets':
                data = await Budget.find({ userId, isActive: true })
                    .sort({ startDate: -1 });
                filename = `valut-budgets-${Date.now()}`;
                break;
            default:
                return res.status(400).json({ message: 'Invalid export type' });
        }

        if (format === 'csv') {
            return await exportDataAsCSV(data, type, res, filename);
        } else {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
            res.json({
                type,
                data,
                metadata: {
                    exportedAt: new Date(),
                    count: data.length,
                    version: '2.0.0'
                }
            });
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Import data
router.post('/import', auth, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const userId = req.user.id;
        const { strategy = 'merge' } = req.body; // merge, replace, skip
        const filePath = req.file.path;
        const fileType = req.file.mimetype;

        let importData;
        let results = {
            imported: 0,
            skipped: 0,
            errors: []
        };

        if (fileType === 'application/json') {
            importData = require(filePath);
        } else if (fileType === 'text/csv') {
            importData = await parseCSV(filePath);
        } else {
            return res.status(400).json({ message: 'Unsupported file type' });
        }

        // Import expenses
        if (importData.expenses && Array.isArray(importData.expenses)) {
            const expenseResults = await importExpenses(importData.expenses, userId, strategy);
            results.imported += expenseResults.imported;
            results.skipped += expenseResults.skipped;
            results.errors = results.errors.concat(expenseResults.errors);
        }

        // Import categories
        if (importData.categories && Array.isArray(importData.categories)) {
            const categoryResults = await importCategories(importData.categories, userId, strategy);
            results.imported += categoryResults.imported;
            results.skipped += categoryResults.skipped;
            results.errors = results.errors.concat(categoryResults.errors);
        }

        // Import budgets
        if (importData.budgets && Array.isArray(importData.budgets)) {
            const budgetResults = await importBudgets(importData.budgets, userId, strategy);
            results.imported += budgetResults.imported;
            results.skipped += budgetResults.skipped;
            results.errors = results.errors.concat(budgetResults.errors);
        }

        // Clean up uploaded file
        const fs = require('fs');
        fs.unlinkSync(filePath);

        res.json({
            success: true,
            message: 'Import completed',
            results
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get backup history
router.get('/history', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        
        // This could be extended to store backup history in database
        // For now, return a simple response
        res.json({
            backups: [],
            message: 'Backup history feature coming soon'
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Helper functions

async function exportAsCSV(data, res) {
    try {
        const csvData = [];
        
        // Flatten expenses for CSV
        if (data.expenses) {
            data.expenses.forEach(expense => {
                csvData.push({
                    type: 'expense',
                    id: expense._id,
                    description: expense.description,
                    amount: expense.amount,
                    category: expense.category,
                    date: expense.date,
                    paymentMethod: expense.paymentMethod,
                    notes: expense.notes,
                    tags: expense.tags ? expense.tags.join(',') : ''
                });
            });
        }

        // Flatten categories for CSV
        if (data.categories) {
            data.categories.forEach(category => {
                csvData.push({
                    type: 'category',
                    id: category._id,
                    name: category.name,
                    description: category.description,
                    icon: category.icon,
                    color: category.color,
                    keywords: category.keywords ? category.keywords.join(',') : ''
                });
            });
        }

        const parser = new Parser();
        const csv = parser.parse(csvData);
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="valut-backup-${Date.now()}.csv"`);
        res.send(csv);
    } catch (error) {
        throw error;
    }
}

async function exportDataAsCSV(data, type, res, filename) {
    try {
        let fields = [];
        
        switch (type) {
            case 'expenses':
                fields = ['description', 'amount', 'category', 'date', 'paymentMethod', 'notes', 'tags'];
                break;
            case 'categories':
                fields = ['name', 'description', 'icon', 'color', 'keywords'];
                break;
            case 'budgets':
                fields = ['name', 'description', 'amount', 'period', 'startDate', 'endDate'];
                break;
        }

        const parser = new Parser({ fields });
        const csv = parser.parse(data);
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
        res.send(csv);
    } catch (error) {
        throw error;
    }
}

async function parseCSV(filePath) {
    return new Promise((resolve, reject) => {
        const results = [];
        const fs = require('fs');
        
        fs.createReadStream(filePath)
            .pipe(csvParser())
            .on('data', (data) => results.push(data))
            .on('end', () => {
                resolve({ expenses: results });
            })
            .on('error', reject);
    });
}

async function importExpenses(expenses, userId, strategy) {
    const results = { imported: 0, skipped: 0, errors: [] };
    
    for (const expenseData of expenses) {
        try {
            const existingExpense = await Expense.findOne({
                userId,
                description: expenseData.description,
                amount: expenseData.amount,
                date: new Date(expenseData.date)
            });
            
            if (existingExpense) {
                if (strategy === 'skip') {
                    results.skipped++;
                    continue;
                } else if (strategy === 'replace') {
                    await Expense.findByIdAndUpdate(existingExpense._id, {
                        ...expenseData,
                        userId,
                        updatedAt: new Date()
                    });
                    results.imported++;
                } else { // merge
                    results.skipped++;
                }
            } else {
                const newExpense = new Expense({
                    ...expenseData,
                    userId,
                    tags: expenseData.tags ? expenseData.tags.split(',').map(tag => tag.trim()) : []
                });
                await newExpense.save();
                results.imported++;
            }
        } catch (error) {
            results.errors.push({
                item: expenseData,
                error: error.message
            });
        }
    }
    
    return results;
}

async function importCategories(categories, userId, strategy) {
    const results = { imported: 0, skipped: 0, errors: [] };
    
    for (const categoryData of categories) {
        try {
            const existingCategory = await Category.findOne({
                userId,
                name: categoryData.name
            });
            
            if (existingCategory) {
                if (strategy === 'skip') {
                    results.skipped++;
                    continue;
                } else if (strategy === 'replace') {
                    await Category.findByIdAndUpdate(existingCategory._id, {
                        ...categoryData,
                        userId,
                        updatedAt: new Date()
                    });
                    results.imported++;
                } else { // merge
                    results.skipped++;
                }
            } else {
                const newCategory = new Category({
                    ...categoryData,
                    userId,
                    keywords: categoryData.keywords ? categoryData.keywords.split(',').map(kw => kw.trim()) : []
                });
                await newCategory.save();
                results.imported++;
            }
        } catch (error) {
            results.errors.push({
                item: categoryData,
                error: error.message
            });
        }
    }
    
    return results;
}

async function importBudgets(budgets, userId, strategy) {
    const results = { imported: 0, skipped: 0, errors: [] };
    
    for (const budgetData of budgets) {
        try {
            const existingBudget = await Budget.findOne({
                userId,
                name: budgetData.name,
                period: budgetData.period
            });
            
            if (existingBudget) {
                if (strategy === 'skip') {
                    results.skipped++;
                    continue;
                } else if (strategy === 'replace') {
                    await Budget.findByIdAndUpdate(existingBudget._id, {
                        ...budgetData,
                        userId,
                        updatedAt: new Date()
                    });
                    results.imported++;
                } else { // merge
                    results.skipped++;
                }
            } else {
                const newBudget = new Budget({
                    ...budgetData,
                    userId
                });
                await newBudget.save();
                results.imported++;
            }
        } catch (error) {
            results.errors.push({
                item: budgetData,
                error: error.message
            });
        }
    }
    
    return results;
}

module.exports = router; 