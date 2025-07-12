const mongoose = require('mongoose');

const BudgetSchema = new mongoose.Schema({
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
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    spent: {
        type: Number,
        default: 0,
        min: 0
    },
    remaining: {
        type: Number,
        default: function() {
            return this.amount - this.spent;
        }
    },
    period: {
        type: String,
        enum: ['weekly', 'monthly', 'quarterly', 'yearly'],
        required: true,
        default: 'monthly'
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    categories: [{
        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Category',
            required: true
        },
        allocation: {
            type: Number,
            required: true,
            min: 0
        },
        spent: {
            type: Number,
            default: 0,
            min: 0
        }
    }],
    alerts: {
        enabled: {
            type: Boolean,
            default: true
        },
        thresholds: [{
            percentage: {
                type: Number,
                required: true,
                min: 0,
                max: 100
            },
            triggered: {
                type: Boolean,
                default: false
            },
            triggeredAt: {
                type: Date
            }
        }]
    },
    autoReset: {
        type: Boolean,
        default: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    goals: [{
        description: {
            type: String,
            required: true,
            trim: true
        },
        targetAmount: {
            type: Number,
            required: true,
            min: 0
        },
        currentAmount: {
            type: Number,
            default: 0,
            min: 0
        },
        deadline: {
            type: Date
        },
        isCompleted: {
            type: Boolean,
            default: false
        },
        completedAt: {
            type: Date
        }
    }],
    history: [{
        date: {
            type: Date,
            default: Date.now
        },
        action: {
            type: String,
            enum: ['created', 'updated', 'reset', 'expense_added', 'expense_removed', 'alert_triggered'],
            required: true
        },
        amount: {
            type: Number
        },
        description: {
            type: String
        },
        expenseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Expense'
        }
    }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Indexes
BudgetSchema.index({ userId: 1, isActive: 1 });
BudgetSchema.index({ userId: 1, period: 1 });
BudgetSchema.index({ startDate: 1, endDate: 1 });
BudgetSchema.index({ 'categories.categoryId': 1 });

// Virtual for percentage spent
BudgetSchema.virtual('percentageSpent').get(function() {
    return this.amount > 0 ? (this.spent / this.amount) * 100 : 0;
});

// Virtual for is over budget
BudgetSchema.virtual('isOverBudget').get(function() {
    return this.spent > this.amount;
});

// Virtual for days remaining
BudgetSchema.virtual('daysRemaining').get(function() {
    const now = new Date();
    const diffTime = this.endDate - now;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for status
BudgetSchema.virtual('status').get(function() {
    if (!this.isActive) return 'inactive';
    
    const now = new Date();
    if (now < this.startDate) return 'upcoming';
    if (now > this.endDate) return 'expired';
    
    const percentageSpent = this.percentageSpent;
    if (percentageSpent >= 100) return 'over_budget';
    if (percentageSpent >= 90) return 'critical';
    if (percentageSpent >= 75) return 'warning';
    return 'good';
});

// Pre-save middleware
BudgetSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    this.remaining = this.amount - this.spent;
    
    // Check and trigger alerts
    if (this.alerts.enabled) {
        const percentageSpent = this.percentageSpent;
        this.alerts.thresholds.forEach(threshold => {
            if (!threshold.triggered && percentageSpent >= threshold.percentage) {
                threshold.triggered = true;
                threshold.triggeredAt = Date.now();
                
                // Add to history
                this.history.push({
                    action: 'alert_triggered',
                    amount: this.spent,
                    description: `Alert triggered at ${threshold.percentage}% spent`
                });
            }
        });
    }
    
    next();
});

// Method to add expense to budget
BudgetSchema.methods.addExpense = function(expense) {
    this.spent += expense.amount;
    
    // Update category allocation if exists
    const categoryAllocation = this.categories.find(cat => 
        cat.categoryId.toString() === expense.categoryId?.toString()
    );
    if (categoryAllocation) {
        categoryAllocation.spent += expense.amount;
    }
    
    // Add to history
    this.history.push({
        action: 'expense_added',
        amount: expense.amount,
        description: expense.description,
        expenseId: expense._id
    });
    
    return this.save();
};

// Method to remove expense from budget
BudgetSchema.methods.removeExpense = function(expense) {
    this.spent = Math.max(0, this.spent - expense.amount);
    
    // Update category allocation if exists
    const categoryAllocation = this.categories.find(cat => 
        cat.categoryId.toString() === expense.categoryId?.toString()
    );
    if (categoryAllocation) {
        categoryAllocation.spent = Math.max(0, categoryAllocation.spent - expense.amount);
    }
    
    // Add to history
    this.history.push({
        action: 'expense_removed',
        amount: expense.amount,
        description: expense.description,
        expenseId: expense._id
    });
    
    return this.save();
};

// Method to reset budget
BudgetSchema.methods.reset = function() {
    this.spent = 0;
    this.categories.forEach(cat => {
        cat.spent = 0;
    });
    
    // Reset alert triggers
    this.alerts.thresholds.forEach(threshold => {
        threshold.triggered = false;
        threshold.triggeredAt = undefined;
    });
    
    // Add to history
    this.history.push({
        action: 'reset',
        description: 'Budget reset'
    });
    
    return this.save();
};

// Method to check if budget needs reset
BudgetSchema.methods.shouldReset = function() {
    if (!this.autoReset) return false;
    
    const now = new Date();
    return now > this.endDate;
};

// Method to create next period budget
BudgetSchema.methods.createNextPeriod = function() {
    const nextBudget = new this.constructor({
        name: this.name,
        description: this.description,
        userId: this.userId,
        amount: this.amount,
        period: this.period,
        startDate: this.endDate,
        endDate: this.calculateEndDate(this.endDate),
        categories: this.categories.map(cat => ({
            categoryId: cat.categoryId,
            allocation: cat.allocation
        })),
        alerts: {
            enabled: this.alerts.enabled,
            thresholds: this.alerts.thresholds.map(threshold => ({
                percentage: threshold.percentage,
                triggered: false
            }))
        },
        autoReset: this.autoReset,
        goals: this.goals.filter(goal => !goal.isCompleted)
    });
    
    return nextBudget.save();
};

// Method to calculate end date based on period
BudgetSchema.methods.calculateEndDate = function(startDate) {
    const date = new Date(startDate);
    
    switch (this.period) {
        case 'weekly':
            date.setDate(date.getDate() + 7);
            break;
        case 'monthly':
            date.setMonth(date.getMonth() + 1);
            break;
        case 'quarterly':
            date.setMonth(date.getMonth() + 3);
            break;
        case 'yearly':
            date.setFullYear(date.getFullYear() + 1);
            break;
    }
    
    return date;
};

// Static method to get active budgets for user
BudgetSchema.statics.getActiveBudgets = function(userId) {
    const now = new Date();
    return this.find({
        userId: userId,
        isActive: true,
        startDate: { $lte: now },
        endDate: { $gte: now }
    }).populate('categories.categoryId', 'name icon color');
};

// Static method to get budgets that need reset
BudgetSchema.statics.getBudgetsNeedingReset = function() {
    const now = new Date();
    return this.find({
        isActive: true,
        autoReset: true,
        endDate: { $lt: now }
    });
};

// Static method to get budget summary for user
BudgetSchema.statics.getBudgetSummary = function(userId) {
    return this.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(userId),
                isActive: true
            }
        },
        {
            $group: {
                _id: '$period',
                totalBudget: { $sum: '$amount' },
                totalSpent: { $sum: '$spent' },
                count: { $sum: 1 }
            }
        },
        {
            $project: {
                period: '$_id',
                totalBudget: 1,
                totalSpent: 1,
                count: 1,
                percentageSpent: {
                    $multiply: [
                        { $divide: ['$totalSpent', '$totalBudget'] },
                        100
                    ]
                }
            }
        }
    ]);
};

module.exports = mongoose.model('Budget', BudgetSchema); 