const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const { 
    addExpense, 
    getExpenses, 
    getExpenseById,
    updateExpense,
    deleteExpense,
    bulkUpdateExpenses,
    bulkDeleteExpenses,
    getExpenseStats
} = require('../controllers/expenseController');
const auth = require('../middleware/auth');

// Validation middleware
const validateExpense = [
    body('description')
        .notEmpty()
        .withMessage('Description is required')
        .isLength({ max: 500 })
        .withMessage('Description must be less than 500 characters'),
    body('amount')
        .isFloat({ min: 0 })
        .withMessage('Amount must be a positive number'),
    body('category')
        .optional()
        .isString()
        .withMessage('Category must be a string'),
    body('subcategory')
        .optional()
        .isString()
        .withMessage('Subcategory must be a string'),
    body('date')
        .optional()
        .isISO8601()
        .withMessage('Date must be a valid ISO 8601 date'),
    body('paymentMethod')
        .optional()
        .isIn(['cash', 'credit_card', 'debit_card', 'bank_transfer', 'digital_wallet', 'other'])
        .withMessage('Invalid payment method'),
    body('currency')
        .optional()
        .isLength({ min: 3, max: 3 })
        .withMessage('Currency must be a 3-character code'),
    body('location.name')
        .optional()
        .isString()
        .withMessage('Location name must be a string'),
    body('location.latitude')
        .optional()
        .isFloat({ min: -90, max: 90 })
        .withMessage('Latitude must be between -90 and 90'),
    body('location.longitude')
        .optional()
        .isFloat({ min: -180, max: 180 })
        .withMessage('Longitude must be between -180 and 180'),
    body('notes')
        .optional()
        .isLength({ max: 1000 })
        .withMessage('Notes must be less than 1000 characters'),
    body('tags')
        .optional()
        .isArray()
        .withMessage('Tags must be an array'),
    body('tags.*')
        .optional()
        .isString()
        .withMessage('Each tag must be a string'),
    body('isRecurring')
        .optional()
        .isBoolean()
        .withMessage('isRecurring must be a boolean'),
    body('recurringPattern.frequency')
        .if(body('isRecurring').equals(true))
        .notEmpty()
        .isIn(['daily', 'weekly', 'monthly', 'yearly'])
        .withMessage('Invalid recurring frequency'),
    body('recurringPattern.interval')
        .if(body('isRecurring').equals(true))
        .isInt({ min: 1 })
        .withMessage('Recurring interval must be a positive integer'),
    body('recurringPattern.endDate')
        .optional()
        .isISO8601()
        .withMessage('End date must be a valid ISO 8601 date')
];

const validateExpenseUpdate = [
    body('description')
        .optional()
        .isLength({ min: 1, max: 500 })
        .withMessage('Description must be between 1 and 500 characters'),
    body('amount')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Amount must be a positive number'),
    body('category')
        .optional()
        .isString()
        .withMessage('Category must be a string'),
    body('subcategory')
        .optional()
        .isString()
        .withMessage('Subcategory must be a string'),
    body('date')
        .optional()
        .isISO8601()
        .withMessage('Date must be a valid ISO 8601 date'),
    body('paymentMethod')
        .optional()
        .isIn(['cash', 'credit_card', 'debit_card', 'bank_transfer', 'digital_wallet', 'other'])
        .withMessage('Invalid payment method'),
    body('currency')
        .optional()
        .isLength({ min: 3, max: 3 })
        .withMessage('Currency must be a 3-character code'),
    body('notes')
        .optional()
        .isLength({ max: 1000 })
        .withMessage('Notes must be less than 1000 characters'),
    body('tags')
        .optional()
        .isArray()
        .withMessage('Tags must be an array')
];

const validateGetExpenses = [
    query('page')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Page must be a positive integer'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
    query('category')
        .optional()
        .isString()
        .withMessage('Category must be a string'),
    query('startDate')
        .optional()
        .isISO8601()
        .withMessage('Start date must be a valid ISO 8601 date'),
    query('endDate')
        .optional()
        .isISO8601()
        .withMessage('End date must be a valid ISO 8601 date'),
    query('minAmount')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Min amount must be a positive number'),
    query('maxAmount')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Max amount must be a positive number'),
    query('paymentMethod')
        .optional()
        .isIn(['cash', 'credit_card', 'debit_card', 'bank_transfer', 'digital_wallet', 'other'])
        .withMessage('Invalid payment method'),
    query('sortBy')
        .optional()
        .isIn(['date', 'amount', 'category', 'description'])
        .withMessage('Invalid sort field'),
    query('sortOrder')
        .optional()
        .isIn(['asc', 'desc'])
        .withMessage('Sort order must be asc or desc')
];

const validateBulkOperations = [
    body('expenseIds')
        .isArray({ min: 1 })
        .withMessage('Expense IDs array is required'),
    body('expenseIds.*')
        .isMongoId()
        .withMessage('Each expense ID must be a valid MongoDB ObjectId')
];

// Routes

// Get all expenses with filters and pagination
router.get('/', auth, validateGetExpenses, getExpenses);

// Get expense statistics
router.get('/stats', auth, [
    query('period')
        .optional()
        .isIn(['week', 'month', 'year'])
        .withMessage('Period must be week, month, or year')
], getExpenseStats);

// Get single expense by ID
router.get('/:id', auth, [
    param('id')
        .isMongoId()
        .withMessage('Invalid expense ID')
], getExpenseById);

// Create new expense
router.post('/', auth, validateExpense, addExpense);

// Update expense
router.put('/:id', auth, [
    param('id')
        .isMongoId()
        .withMessage('Invalid expense ID'),
    ...validateExpenseUpdate
], updateExpense);

// Delete expense
router.delete('/:id', auth, [
    param('id')
        .isMongoId()
        .withMessage('Invalid expense ID')
], deleteExpense);

// Bulk update expenses
router.put('/bulk/update', auth, [
    ...validateBulkOperations,
    body('updateData')
        .isObject()
        .withMessage('Update data must be an object')
], bulkUpdateExpenses);

// Bulk delete expenses
router.delete('/bulk/delete', auth, validateBulkOperations, bulkDeleteExpenses);

// Error handling middleware for validation
router.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({
            success: false,
            message: 'Invalid JSON in request body'
        });
    }
    next(err);
});

module.exports = router;
