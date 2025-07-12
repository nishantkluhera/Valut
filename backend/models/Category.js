const mongoose = require('mongoose');

const CategorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    description: {
        type: String,
        trim: true,
        maxlength: 500
    },
    icon: {
        type: String,
        trim: true
    },
    color: {
        type: String,
        match: /^#[0-9A-F]{6}$/i,
        default: '#6B7280'
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    parentCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category'
    },
    subcategories: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category'
    }],
    isDefault: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true
    },
    keywords: [{
        type: String,
        trim: true,
        lowercase: true
    }],
    rules: [{
        field: {
            type: String,
            enum: ['description', 'amount', 'location', 'paymentMethod'],
            required: true
        },
        operator: {
            type: String,
            enum: ['contains', 'starts_with', 'ends_with', 'equals', 'greater_than', 'less_than'],
            required: true
        },
        value: {
            type: String,
            required: true
        },
        caseSensitive: {
            type: Boolean,
            default: false
        }
    }],
    budget: {
        monthlyLimit: { type: Number, min: 0 },
        yearlyLimit: { type: Number, min: 0 },
        alertThreshold: { type: Number, min: 0, max: 100, default: 80 }, // Percentage
        isActive: { type: Boolean, default: false }
    },
    statistics: {
        totalExpenses: { type: Number, default: 0 },
        totalAmount: { type: Number, default: 0 },
        averageAmount: { type: Number, default: 0 },
        lastExpenseDate: { type: Date },
        monthlyAverage: { type: Number, default: 0 },
        trend: { type: String, enum: ['increasing', 'decreasing', 'stable'], default: 'stable' }
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Indexes
CategorySchema.index({ userId: 1, name: 1 }, { unique: true });
CategorySchema.index({ userId: 1, isActive: 1 });
CategorySchema.index({ userId: 1, isDefault: 1 });
CategorySchema.index({ parentCategory: 1 });

// Virtual for full category path
CategorySchema.virtual('fullPath').get(function() {
    if (this.parentCategory) {
        return `${this.parentCategory.name} > ${this.name}`;
    }
    return this.name;
});

// Pre-save middleware
CategorySchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Method to check if category matches expense
CategorySchema.methods.matchesExpense = function(expense) {
    if (this.keywords.length > 0) {
        const description = expense.description.toLowerCase();
        const hasKeywordMatch = this.keywords.some(keyword => 
            description.includes(keyword.toLowerCase())
        );
        if (hasKeywordMatch) return true;
    }
    
    if (this.rules.length > 0) {
        return this.rules.every(rule => {
            const fieldValue = expense[rule.field];
            if (!fieldValue) return false;
            
            const compareValue = rule.caseSensitive ? fieldValue : fieldValue.toLowerCase();
            const ruleValue = rule.caseSensitive ? rule.value : rule.value.toLowerCase();
            
            switch (rule.operator) {
                case 'contains':
                    return compareValue.includes(ruleValue);
                case 'starts_with':
                    return compareValue.startsWith(ruleValue);
                case 'ends_with':
                    return compareValue.endsWith(ruleValue);
                case 'equals':
                    return compareValue === ruleValue;
                case 'greater_than':
                    return parseFloat(fieldValue) > parseFloat(rule.value);
                case 'less_than':
                    return parseFloat(fieldValue) < parseFloat(rule.value);
                default:
                    return false;
            }
        });
    }
    
    return false;
};

// Method to update statistics
CategorySchema.methods.updateStatistics = function(expense, isNew = true) {
    if (isNew) {
        this.statistics.totalExpenses += 1;
        this.statistics.totalAmount += expense.amount;
        this.statistics.lastExpenseDate = expense.date || Date.now();
    } else {
        // Handle expense update/deletion
        this.statistics.totalExpenses = Math.max(0, this.statistics.totalExpenses - 1);
        this.statistics.totalAmount = Math.max(0, this.statistics.totalAmount - expense.amount);
    }
    
    this.statistics.averageAmount = this.statistics.totalExpenses > 0 
        ? this.statistics.totalAmount / this.statistics.totalExpenses 
        : 0;
    
    return this.save();
};

// Static method to get user categories with hierarchy
CategorySchema.statics.getUserCategoriesWithHierarchy = function(userId) {
    return this.find({ userId: userId, isActive: true })
        .populate('parentCategory', 'name')
        .populate('subcategories', 'name icon color')
        .sort({ name: 1 });
};

// Static method to find matching category for expense
CategorySchema.statics.findMatchingCategory = function(userId, expense) {
    return this.find({ userId: userId, isActive: true })
        .then(categories => {
            for (const category of categories) {
                if (category.matchesExpense(expense)) {
                    return category;
                }
            }
            return null;
        });
};

// Static method to get default categories
CategorySchema.statics.getDefaultCategories = function() {
    return [
        { name: 'Food & Dining', icon: '🍽️', color: '#10B981', keywords: ['restaurant', 'food', 'dining', 'lunch', 'dinner', 'breakfast'] },
        { name: 'Groceries', icon: '🛒', color: '#3B82F6', keywords: ['grocery', 'supermarket', 'market', 'food shopping'] },
        { name: 'Transportation', icon: '🚗', color: '#EF4444', keywords: ['uber', 'lyft', 'taxi', 'bus', 'train', 'gas', 'fuel'] },
        { name: 'Entertainment', icon: '🎬', color: '#8B5CF6', keywords: ['movie', 'netflix', 'spotify', 'game', 'theater'] },
        { name: 'Shopping', icon: '🛍️', color: '#F59E0B', keywords: ['amazon', 'shopping', 'clothes', 'retail'] },
        { name: 'Health & Fitness', icon: '🏥', color: '#06B6D4', keywords: ['doctor', 'gym', 'pharmacy', 'health', 'medical'] },
        { name: 'Utilities', icon: '⚡', color: '#84CC16', keywords: ['electric', 'water', 'internet', 'phone', 'utility'] },
        { name: 'Travel', icon: '✈️', color: '#EC4899', keywords: ['hotel', 'flight', 'travel', 'vacation'] },
        { name: 'Education', icon: '📚', color: '#6366F1', keywords: ['school', 'book', 'course', 'education'] },
        { name: 'Miscellaneous', icon: '📝', color: '#6B7280', keywords: [] }
    ];
};

module.exports = mongoose.model('Category', CategorySchema); 