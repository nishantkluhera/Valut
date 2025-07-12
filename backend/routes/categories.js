const express = require('express');
const router = express.Router();
const Category = require('../models/Category');
const auth = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// Get all categories for user
router.get('/', auth, async (req, res) => {
    try {
        const categories = await Category.getUserCategoriesWithHierarchy(req.user.id);
        res.json(categories);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get category by ID
router.get('/:id', auth, async (req, res) => {
    try {
        const category = await Category.findOne({ 
            _id: req.params.id, 
            userId: req.user.id 
        }).populate('parentCategory subcategories');
        
        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }
        
        res.json(category);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Create new category
router.post('/', auth, [
    body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name must be between 1 and 100 characters'),
    body('description').optional().trim().isLength({ max: 500 }).withMessage('Description must be less than 500 characters'),
    body('color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Color must be a valid hex color'),
    body('keywords').optional().isArray().withMessage('Keywords must be an array'),
    body('parentCategory').optional().isMongoId().withMessage('Parent category must be a valid ID')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const { name, description, icon, color, keywords, parentCategory, rules } = req.body;
        
        // Check if category name already exists for user
        const existingCategory = await Category.findOne({ 
            name: name, 
            userId: req.user.id 
        });
        
        if (existingCategory) {
            return res.status(400).json({ message: 'Category with this name already exists' });
        }

        const category = new Category({
            name,
            description,
            icon,
            color,
            keywords,
            parentCategory,
            rules,
            userId: req.user.id
        });

        await category.save();
        
        // If this is a subcategory, add it to parent's subcategories
        if (parentCategory) {
            await Category.findByIdAndUpdate(parentCategory, {
                $push: { subcategories: category._id }
            });
        }

        res.status(201).json(category);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Update category
router.put('/:id', auth, [
    body('name').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Name must be between 1 and 100 characters'),
    body('description').optional().trim().isLength({ max: 500 }).withMessage('Description must be less than 500 characters'),
    body('color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Color must be a valid hex color'),
    body('keywords').optional().isArray().withMessage('Keywords must be an array')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const category = await Category.findOne({ 
            _id: req.params.id, 
            userId: req.user.id 
        });
        
        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }

        const { name, description, icon, color, keywords, rules, budget } = req.body;
        
        // Check if new name conflicts with existing categories
        if (name && name !== category.name) {
            const existingCategory = await Category.findOne({ 
                name: name, 
                userId: req.user.id,
                _id: { $ne: req.params.id }
            });
            
            if (existingCategory) {
                return res.status(400).json({ message: 'Category with this name already exists' });
            }
        }

        // Update fields
        if (name) category.name = name;
        if (description !== undefined) category.description = description;
        if (icon !== undefined) category.icon = icon;
        if (color) category.color = color;
        if (keywords) category.keywords = keywords;
        if (rules) category.rules = rules;
        if (budget) category.budget = { ...category.budget, ...budget };

        await category.save();
        res.json(category);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Delete category
router.delete('/:id', auth, async (req, res) => {
    try {
        const category = await Category.findOne({ 
            _id: req.params.id, 
            userId: req.user.id 
        });
        
        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }

        // Don't allow deletion of default categories
        if (category.isDefault) {
            return res.status(400).json({ message: 'Cannot delete default category' });
        }

        // Remove from parent's subcategories if it's a subcategory
        if (category.parentCategory) {
            await Category.findByIdAndUpdate(category.parentCategory, {
                $pull: { subcategories: category._id }
            });
        }

        // Handle subcategories - either delete them or move them to parent
        if (category.subcategories.length > 0) {
            await Category.updateMany(
                { _id: { $in: category.subcategories } },
                { $unset: { parentCategory: 1 } }
            );
        }

        await Category.findByIdAndDelete(req.params.id);
        res.json({ message: 'Category deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get category statistics
router.get('/:id/stats', auth, async (req, res) => {
    try {
        const category = await Category.findOne({ 
            _id: req.params.id, 
            userId: req.user.id 
        });
        
        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }

        const stats = {
            ...category.statistics,
            budgetStatus: category.budget.isActive ? {
                monthlyLimit: category.budget.monthlyLimit,
                yearlyLimit: category.budget.yearlyLimit,
                alertThreshold: category.budget.alertThreshold
            } : null
        };

        res.json(stats);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Initialize default categories for user
router.post('/init-defaults', auth, async (req, res) => {
    try {
        const existingCategories = await Category.find({ userId: req.user.id });
        
        if (existingCategories.length > 0) {
            return res.status(400).json({ message: 'User already has categories' });
        }

        const defaultCategories = Category.getDefaultCategories();
        const createdCategories = [];

        for (const catData of defaultCategories) {
            const category = new Category({
                ...catData,
                userId: req.user.id,
                isDefault: true
            });
            await category.save();
            createdCategories.push(category);
        }

        res.json({ 
            message: 'Default categories created successfully',
            categories: createdCategories 
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router; 