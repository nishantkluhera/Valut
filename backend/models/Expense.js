const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

const ExpenseSchema = new mongoose.Schema({
    description: { 
        type: String, 
        required: true, 
        trim: true,
        maxlength: 500
    },
    amount: { 
        type: Number, 
        required: true,
        min: 0
    },
    category: { 
        type: String, 
        required: true,
        trim: true
    },
    subcategory: {
        type: String,
        trim: true
    },
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    date: { 
        type: Date, 
        default: Date.now,
        required: true
    },
    location: {
        name: { type: String, trim: true },
        address: { type: String, trim: true },
        latitude: { type: Number },
        longitude: { type: Number }
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'credit_card', 'debit_card', 'bank_transfer', 'digital_wallet', 'other'],
        default: 'cash'
    },
    currency: {
        type: String,
        default: 'USD',
        uppercase: true
    },
    tags: [{
        type: String,
        trim: true,
        lowercase: true
    }],
    attachments: [{
        filename: { type: String, required: true },
        originalName: { type: String, required: true },
        mimetype: { type: String, required: true },
        size: { type: Number, required: true },
        url: { type: String, required: true },
        uploadedAt: { type: Date, default: Date.now }
    }],
    notes: {
        type: String,
        maxlength: 1000
    },
    isRecurring: {
        type: Boolean,
        default: false
    },
    recurringPattern: {
        frequency: {
            type: String,
            enum: ['daily', 'weekly', 'monthly', 'yearly'],
            required: function() { return this.isRecurring; }
        },
        interval: {
            type: Number,
            default: 1,
            min: 1
        },
        endDate: { type: Date },
        nextOccurrence: { type: Date }
    },
    budget: {
        budgetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Budget' },
        remainingBudget: { type: Number }
    },
    analytics: {
        averageForCategory: { type: Number },
        percentageOfIncome: { type: Number },
        monthlyTrend: { type: String, enum: ['increasing', 'decreasing', 'stable'] },
        isUnusual: { type: Boolean, default: false }
    },
    sync: {
        lastSyncedAt: { type: Date, default: Date.now },
        deviceId: { type: String },
        syncVersion: { type: Number, default: 1 },
        conflictResolution: {
            hasConflict: { type: Boolean, default: false },
            conflictsWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Expense' }],
            resolvedAt: { type: Date }
        }
    },
    metadata: {
        source: {
            type: String,
            enum: ['manual', 'receipt_scan', 'bank_import', 'api', 'recurring'],
            default: 'manual'
        },
        confidence: {
            type: Number,
            min: 0,
            max: 1,
            default: 1
        },
        originalData: { type: mongoose.Schema.Types.Mixed },
        processingInfo: {
            ocrUsed: { type: Boolean, default: false },
            autoCategorizationUsed: { type: Boolean, default: false },
            aiSuggested: { type: Boolean, default: false }
        }
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    deletedAt: { type: Date }, // Soft delete
    isDeleted: { type: Boolean, default: false }
});

// Add pagination plugin
ExpenseSchema.plugin(mongoosePaginate);

// Indexes for performance
ExpenseSchema.index({ userId: 1, date: -1 });
ExpenseSchema.index({ userId: 1, category: 1 });
ExpenseSchema.index({ userId: 1, createdAt: -1 });
ExpenseSchema.index({ userId: 1, isDeleted: 1 });
ExpenseSchema.index({ 'sync.lastSyncedAt': -1 });
ExpenseSchema.index({ 'recurringPattern.nextOccurrence': 1 });

// Virtual for formatted amount
ExpenseSchema.virtual('formattedAmount').get(function() {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: this.currency
    }).format(this.amount);
});

// Virtual for age in days
ExpenseSchema.virtual('ageInDays').get(function() {
    return Math.floor((Date.now() - this.date) / (1000 * 60 * 60 * 24));
});

// Pre-save middleware to update timestamps
ExpenseSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    this.sync.lastSyncedAt = Date.now();
    next();
});

// Pre-save middleware to handle recurring expenses
ExpenseSchema.pre('save', function(next) {
    if (this.isRecurring && this.recurringPattern.frequency && !this.recurringPattern.nextOccurrence) {
        this.calculateNextOccurrence();
    }
    next();
});

// Method to calculate next occurrence for recurring expenses
ExpenseSchema.methods.calculateNextOccurrence = function() {
    const currentDate = new Date(this.date);
    let nextDate = new Date(currentDate);
    
    switch (this.recurringPattern.frequency) {
        case 'daily':
            nextDate.setDate(currentDate.getDate() + this.recurringPattern.interval);
            break;
        case 'weekly':
            nextDate.setDate(currentDate.getDate() + (7 * this.recurringPattern.interval));
            break;
        case 'monthly':
            nextDate.setMonth(currentDate.getMonth() + this.recurringPattern.interval);
            break;
        case 'yearly':
            nextDate.setFullYear(currentDate.getFullYear() + this.recurringPattern.interval);
            break;
    }
    
    this.recurringPattern.nextOccurrence = nextDate;
    return nextDate;
};

// Method to create next recurring expense
ExpenseSchema.methods.createNextRecurring = function() {
    if (!this.isRecurring) return null;
    
    const nextExpense = new this.constructor({
        description: this.description,
        amount: this.amount,
        category: this.category,
        subcategory: this.subcategory,
        userId: this.userId,
        date: this.recurringPattern.nextOccurrence,
        paymentMethod: this.paymentMethod,
        currency: this.currency,
        tags: this.tags,
        notes: this.notes,
        isRecurring: true,
        recurringPattern: {
            ...this.recurringPattern,
            nextOccurrence: null // Will be calculated on save
        },
        metadata: {
            source: 'recurring',
            confidence: 1,
            originalData: { parentExpenseId: this._id }
        }
    });
    
    // Update this expense's next occurrence
    this.calculateNextOccurrence();
    
    return nextExpense;
};

// Method to soft delete
ExpenseSchema.methods.softDelete = function() {
    this.isDeleted = true;
    this.deletedAt = Date.now();
    return this.save();
};

// Method to restore from soft delete
ExpenseSchema.methods.restore = function() {
    this.isDeleted = false;
    this.deletedAt = undefined;
    return this.save();
};

// Method to add attachment
ExpenseSchema.methods.addAttachment = function(attachmentData) {
    this.attachments.push(attachmentData);
    return this.save();
};

// Method to remove attachment
ExpenseSchema.methods.removeAttachment = function(attachmentId) {
    this.attachments = this.attachments.filter(att => att._id.toString() !== attachmentId);
    return this.save();
};

// Static method to get expenses by date range
ExpenseSchema.statics.getByDateRange = function(userId, startDate, endDate) {
    return this.find({
        userId: userId,
        date: {
            $gte: startDate,
            $lte: endDate
        },
        isDeleted: false
    }).sort({ date: -1 });
};

// Static method to get expenses by category
ExpenseSchema.statics.getByCategory = function(userId, category) {
    return this.find({
        userId: userId,
        category: category,
        isDeleted: false
    }).sort({ date: -1 });
};

// Static method to get total amount by category
ExpenseSchema.statics.getTotalByCategory = function(userId, startDate, endDate) {
    return this.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(userId),
                date: {
                    $gte: startDate,
                    $lte: endDate
                },
                isDeleted: false
            }
        },
        {
            $group: {
                _id: '$category',
                totalAmount: { $sum: '$amount' },
                count: { $sum: 1 },
                averageAmount: { $avg: '$amount' }
            }
        },
        {
            $sort: { totalAmount: -1 }
        }
    ]);
};

// Static method to get monthly trends
ExpenseSchema.statics.getMonthlyTrends = function(userId, months = 12) {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);
    
    return this.aggregate([
        {
            $match: {
                userId: new mongoose.Types.ObjectId(userId),
                date: { $gte: startDate },
                isDeleted: false
            }
        },
        {
            $group: {
                _id: {
                    year: { $year: '$date' },
                    month: { $month: '$date' }
                },
                totalAmount: { $sum: '$amount' },
                count: { $sum: 1 }
            }
        },
        {
            $sort: { '_id.year': 1, '_id.month': 1 }
        }
    ]);
};

module.exports = mongoose.model('Expense', ExpenseSchema);
