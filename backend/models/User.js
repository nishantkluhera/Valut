const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: true, 
        unique: true, 
        trim: true,
        minlength: 3,
        maxlength: 30
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: { 
        type: String, 
        required: true,
        minlength: 6
    },
    profile: {
        firstName: { type: String, trim: true },
        lastName: { type: String, trim: true },
        avatar: { type: String },
        currency: { type: String, default: 'USD' },
        timezone: { type: String, default: 'UTC' },
        language: { type: String, default: 'en' }
    },
    preferences: {
        theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'auto' },
        defaultCategory: { type: String, default: 'Miscellaneous' },
        notificationsEnabled: { type: Boolean, default: true },
        autoSync: { type: Boolean, default: true },
        budgetAlerts: { type: Boolean, default: true }
    },
    security: {
        twoFactorEnabled: { type: Boolean, default: false },
        twoFactorSecret: { type: String },
        lastPasswordChange: { type: Date, default: Date.now },
        failedLoginAttempts: { type: Number, default: 0 },
        lockoutUntil: { type: Date }
    },
    subscription: {
        type: { type: String, enum: ['free', 'premium'], default: 'free' },
        startDate: { type: Date },
        endDate: { type: Date },
        autoRenew: { type: Boolean, default: false }
    },
    devices: [{
        deviceId: { type: String, required: true },
        deviceName: { type: String, required: true },
        platform: { type: String, enum: ['web', 'android', 'ios', 'windows', 'linux', 'macos'], required: true },
        lastSyncAt: { type: Date, default: Date.now },
        isActive: { type: Boolean, default: true }
    }],
    apiKeys: [{
        name: { type: String, required: true },
        key: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
        isActive: { type: Boolean, default: true }
    }],
    stats: {
        totalExpenses: { type: Number, default: 0 },
        totalAmount: { type: Number, default: 0 },
        currentStreak: { type: Number, default: 0 },
        longestStreak: { type: Number, default: 0 },
        lastExpenseDate: { type: Date }
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    lastLoginAt: { type: Date },
    isActive: { type: Boolean, default: true },
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date }
});

// Indexes for performance
UserSchema.index({ username: 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ 'devices.deviceId': 1 });
UserSchema.index({ createdAt: -1 });

// Virtual for account locked
UserSchema.virtual('isLocked').get(function() {
    return !!(this.security.lockoutUntil && this.security.lockoutUntil > Date.now());
});

// Pre-save middleware to hash password
UserSchema.pre('save', async function(next) {
    // Only hash the password if it has been modified (or is new)
    if (!this.isModified('password')) {
        return next();
    }
    
    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Pre-save middleware to update timestamps
UserSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Method to check password
UserSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Method to increment failed login attempts
UserSchema.methods.incLoginAttempts = function() {
    // If we have a previous lock that has expired, restart at 1
    if (this.security.lockoutUntil && this.security.lockoutUntil < Date.now()) {
        return this.updateOne({
            $unset: { 'security.lockoutUntil': 1 },
            $set: { 'security.failedLoginAttempts': 1 }
        });
    }
    
    const updates = { $inc: { 'security.failedLoginAttempts': 1 } };
    
    // If we have max attempts and no lock, set lock
    if (this.security.failedLoginAttempts + 1 >= 5 && !this.isLocked) {
        updates.$set = { 'security.lockoutUntil': Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
    }
    
    return this.updateOne(updates);
};

// Method to reset login attempts
UserSchema.methods.resetLoginAttempts = function() {
    return this.updateOne({
        $unset: { 'security.lockoutUntil': 1, 'security.failedLoginAttempts': 1 }
    });
};

// Method to add or update device
UserSchema.methods.addDevice = function(deviceInfo) {
    const existingDevice = this.devices.find(d => d.deviceId === deviceInfo.deviceId);
    
    if (existingDevice) {
        existingDevice.lastSyncAt = Date.now();
        existingDevice.isActive = true;
    } else {
        this.devices.push({
            ...deviceInfo,
            lastSyncAt: Date.now(),
            isActive: true
        });
    }
    
    return this.save();
};

// Method to get full name
UserSchema.methods.getFullName = function() {
    return `${this.profile.firstName || ''} ${this.profile.lastName || ''}`.trim() || this.username;
};

// Method to update stats
UserSchema.methods.updateStats = function(expense) {
    this.stats.totalExpenses += 1;
    this.stats.totalAmount += expense.amount;
    this.stats.lastExpenseDate = Date.now();
    
    // Update streak logic
    const today = new Date();
    const lastExpense = new Date(this.stats.lastExpenseDate);
    const daysDiff = Math.floor((today - lastExpense) / (1000 * 60 * 60 * 24));
    
    if (daysDiff === 0) {
        // Same day, continue streak
    } else if (daysDiff === 1) {
        // Consecutive day, increment streak
        this.stats.currentStreak += 1;
        if (this.stats.currentStreak > this.stats.longestStreak) {
            this.stats.longestStreak = this.stats.currentStreak;
        }
    } else {
        // Streak broken, reset to 1
        this.stats.currentStreak = 1;
    }
    
    return this.save();
};

module.exports = mongoose.model('User', UserSchema);
