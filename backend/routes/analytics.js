const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
const Category = require('../models/Category');
const Budget = require('../models/Budget');
const auth = require('../middleware/auth');
const moment = require('moment');
const mongoose = require('mongoose');

// Get dashboard analytics
router.get('/dashboard', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));

        // Get current month expenses
        const monthlyExpenses = await Expense.find({
            userId: userId,
            date: { $gte: startOfMonth },
            isDeleted: false
        });

        // Get current week expenses
        const weeklyExpenses = await Expense.find({
            userId: userId,
            date: { $gte: startOfWeek },
            isDeleted: false
        });

        // Get yearly expenses
        const yearlyExpenses = await Expense.find({
            userId: userId,
            date: { $gte: startOfYear },
            isDeleted: false
        });

        // Calculate totals
        const monthlyTotal = monthlyExpenses.reduce((sum, exp) => sum + exp.amount, 0);
        const weeklyTotal = weeklyExpenses.reduce((sum, exp) => sum + exp.amount, 0);
        const yearlyTotal = yearlyExpenses.reduce((sum, exp) => sum + exp.amount, 0);

        // Get category breakdown for current month
        const categoryBreakdown = await Expense.getTotalByCategory(userId, startOfMonth, now);

        // Get spending trends (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const trends = await Expense.getMonthlyTrends(userId, 6);

        // Get active budgets
        const activeBudgets = await Budget.getActiveBudgets(userId);

        // Calculate average daily spending
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const currentDay = now.getDate();
        const avgDailySpending = monthlyTotal / currentDay;
        const projectedMonthlySpending = avgDailySpending * daysInMonth;

        // Get top categories
        const topCategories = categoryBreakdown.slice(0, 5);

        // Get recent expenses
        const recentExpenses = await Expense.find({
            userId: userId,
            isDeleted: false
        }).sort({ date: -1 }).limit(10);

        res.json({
            summary: {
                weekly: {
                    total: weeklyTotal,
                    count: weeklyExpenses.length
                },
                monthly: {
                    total: monthlyTotal,
                    count: monthlyExpenses.length,
                    projected: projectedMonthlySpending,
                    avgDaily: avgDailySpending
                },
                yearly: {
                    total: yearlyTotal,
                    count: yearlyExpenses.length
                }
            },
            categoryBreakdown,
            trends,
            topCategories,
            recentExpenses,
            activeBudgets: activeBudgets.map(budget => ({
                id: budget._id,
                name: budget.name,
                amount: budget.amount,
                spent: budget.spent,
                remaining: budget.remaining,
                percentageSpent: budget.percentageSpent,
                status: budget.status
            }))
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get spending trends by period
router.get('/trends/:period', auth, async (req, res) => {
    try {
        const { period } = req.params;
        const userId = req.user.id;
        let startDate, groupBy;

        switch (period) {
            case 'weekly':
                startDate = new Date();
                startDate.setDate(startDate.getDate() - 7 * 12); // Last 12 weeks
                groupBy = {
                    year: { $year: '$date' },
                    week: { $week: '$date' }
                };
                break;
            case 'monthly':
                startDate = new Date();
                startDate.setMonth(startDate.getMonth() - 12); // Last 12 months
                groupBy = {
                    year: { $year: '$date' },
                    month: { $month: '$date' }
                };
                break;
            case 'yearly':
                startDate = new Date();
                startDate.setFullYear(startDate.getFullYear() - 5); // Last 5 years
                groupBy = {
                    year: { $year: '$date' }
                };
                break;
            default:
                return res.status(400).json({ message: 'Invalid period' });
        }

        const trends = await Expense.aggregate([
            {
                $match: {
                    userId: new mongoose.Types.ObjectId(userId),
                    date: { $gte: startDate },
                    isDeleted: false
                }
            },
            {
                $group: {
                    _id: groupBy,
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 },
                    avgAmount: { $avg: '$amount' },
                    maxAmount: { $max: '$amount' },
                    minAmount: { $min: '$amount' }
                }
            },
            {
                $sort: { 
                    '_id.year': 1, 
                    '_id.month': 1, 
                    '_id.week': 1 
                }
            }
        ]);

        res.json(trends);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get category insights
router.get('/categories/insights', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

        // Get current month data
        const currentMonthData = await Expense.getTotalByCategory(userId, startOfMonth, now);
        
        // Get last month data
        const lastMonthData = await Expense.getTotalByCategory(userId, lastMonth, endOfLastMonth);

        // Calculate insights
        const insights = currentMonthData.map(current => {
            const lastMonthCategory = lastMonthData.find(last => last._id === current._id);
            const lastMonthAmount = lastMonthCategory ? lastMonthCategory.totalAmount : 0;
            
            const change = current.totalAmount - lastMonthAmount;
            const changePercentage = lastMonthAmount > 0 ? (change / lastMonthAmount) * 100 : 0;

            return {
                category: current._id,
                currentMonth: {
                    amount: current.totalAmount,
                    count: current.count,
                    average: current.averageAmount
                },
                lastMonth: {
                    amount: lastMonthAmount,
                    count: lastMonthCategory ? lastMonthCategory.count : 0
                },
                change: {
                    amount: change,
                    percentage: changePercentage,
                    trend: change > 0 ? 'increase' : change < 0 ? 'decrease' : 'stable'
                }
            };
        });

        // Sort by change percentage (highest increases first)
        insights.sort((a, b) => b.change.percentage - a.change.percentage);

        res.json(insights);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get budget performance
router.get('/budget-performance', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const budgetSummary = await Budget.getBudgetSummary(userId);
        
        // Get detailed budget performance
        const activeBudgets = await Budget.getActiveBudgets(userId);
        const performance = activeBudgets.map(budget => ({
            id: budget._id,
            name: budget.name,
            period: budget.period,
            amount: budget.amount,
            spent: budget.spent,
            remaining: budget.remaining,
            percentageSpent: budget.percentageSpent,
            status: budget.status,
            daysRemaining: budget.daysRemaining,
            dailyAverage: budget.spent / Math.max(1, moment().diff(moment(budget.startDate), 'days')),
            projectedSpend: budget.spent + (budget.spent / Math.max(1, moment().diff(moment(budget.startDate), 'days')) * budget.daysRemaining)
        }));

        res.json({
            summary: budgetSummary,
            performance
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get spending patterns
router.get('/patterns', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { timeframe = 'month' } = req.query;
        
        let startDate = new Date();
        let dateFormat;
        
        switch (timeframe) {
            case 'week':
                startDate.setDate(startDate.getDate() - 7);
                dateFormat = '%w'; // Day of week
                break;
            case 'month':
                startDate.setMonth(startDate.getMonth() - 1);
                dateFormat = '%d'; // Day of month
                break;
            case 'year':
                startDate.setFullYear(startDate.getFullYear() - 1);
                dateFormat = '%m'; // Month
                break;
            default:
                return res.status(400).json({ message: 'Invalid timeframe' });
        }

        const patterns = await Expense.aggregate([
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
                        period: { $dateToString: { format: dateFormat, date: '$date' } },
                        category: '$category'
                    },
                    totalAmount: { $sum: '$amount' },
                    count: { $sum: 1 }
                }
            },
            {
                $group: {
                    _id: '$_id.period',
                    categories: {
                        $push: {
                            category: '$_id.category',
                            amount: '$totalAmount',
                            count: '$count'
                        }
                    },
                    totalAmount: { $sum: '$totalAmount' },
                    totalCount: { $sum: '$count' }
                }
            },
            {
                $sort: { '_id': 1 }
            }
        ]);

        res.json(patterns);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get expense predictions
router.get('/predictions', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { category, period = 'month' } = req.query;
        
        let monthsBack = 6;
        let projectionPeriod = 'month';
        
        if (period === 'week') {
            monthsBack = 3;
            projectionPeriod = 'week';
        } else if (period === 'year') {
            monthsBack = 24;
            projectionPeriod = 'year';
        }

        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - monthsBack);

        const matchConditions = {
            userId: new mongoose.Types.ObjectId(userId),
            date: { $gte: startDate },
            isDeleted: false
        };

        if (category) {
            matchConditions.category = category;
        }

        const historicalData = await Expense.aggregate([
            { $match: matchConditions },
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
            { $sort: { '_id.year': 1, '_id.month': 1 } }
        ]);

        if (historicalData.length === 0) {
            return res.json({ prediction: 0, confidence: 0, trend: 'no_data' });
        }

        // Simple linear regression for prediction
        const amounts = historicalData.map(item => item.totalAmount);
        const n = amounts.length;
        const sumX = n * (n + 1) / 2;
        const sumY = amounts.reduce((sum, val) => sum + val, 0);
        const sumXY = amounts.reduce((sum, val, index) => sum + val * (index + 1), 0);
        const sumXX = n * (n + 1) * (2 * n + 1) / 6;

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        const prediction = slope * (n + 1) + intercept;
        const average = sumY / n;
        const trend = slope > 0 ? 'increasing' : slope < 0 ? 'decreasing' : 'stable';
        
        // Calculate confidence based on data consistency
        const variance = amounts.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) / n;
        const standardDeviation = Math.sqrt(variance);
        const coefficientOfVariation = standardDeviation / average;
        const confidence = Math.max(0, 1 - coefficientOfVariation);

        res.json({
            prediction: Math.max(0, prediction),
            confidence,
            trend,
            historicalAverage: average,
            dataPoints: n
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get financial insights
router.get('/insights', auth, async (req, res) => {
    try {
        const userId = req.user.id;
        const insights = [];

        // Get user's recent expenses
        const recentExpenses = await Expense.find({
            userId: userId,
            isDeleted: false
        }).sort({ date: -1 }).limit(100);

        if (recentExpenses.length === 0) {
            return res.json({ insights: [] });
        }

        // Insight 1: Unusual spending
        const amounts = recentExpenses.map(exp => exp.amount);
        const average = amounts.reduce((sum, val) => sum + val, 0) / amounts.length;
        const unusualExpenses = recentExpenses.filter(exp => exp.amount > average * 2);
        
        if (unusualExpenses.length > 0) {
            insights.push({
                type: 'unusual_spending',
                title: 'Unusual Spending Detected',
                description: `You have ${unusualExpenses.length} expenses that are significantly higher than your average.`,
                impact: 'medium',
                actionable: true
            });
        }

        // Insight 2: Category trends
        const categoryTotals = {};
        recentExpenses.forEach(exp => {
            categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + exp.amount;
        });
        
        const topCategory = Object.entries(categoryTotals).reduce((max, [cat, amount]) => 
            amount > max.amount ? { category: cat, amount } : max, { category: '', amount: 0 }
        );

        if (topCategory.category) {
            insights.push({
                type: 'top_category',
                title: `${topCategory.category} is your biggest expense`,
                description: `You've spent $${topCategory.amount.toFixed(2)} on ${topCategory.category} recently.`,
                impact: 'low',
                actionable: true
            });
        }

        // Insight 3: Budget alerts
        const activeBudgets = await Budget.getActiveBudgets(userId);
        const overBudget = activeBudgets.filter(budget => budget.isOverBudget);
        const nearBudget = activeBudgets.filter(budget => budget.percentageSpent > 80 && !budget.isOverBudget);

        if (overBudget.length > 0) {
            insights.push({
                type: 'over_budget',
                title: 'Budget Exceeded',
                description: `You've exceeded ${overBudget.length} budget(s) this period.`,
                impact: 'high',
                actionable: true
            });
        }

        if (nearBudget.length > 0) {
            insights.push({
                type: 'near_budget',
                title: 'Approaching Budget Limit',
                description: `You're close to exceeding ${nearBudget.length} budget(s).`,
                impact: 'medium',
                actionable: true
            });
        }

        res.json({ insights });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router; 