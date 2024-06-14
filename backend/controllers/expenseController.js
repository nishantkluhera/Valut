const Expense = require('../models/Expense');
const categorizeExpense = require('../utils/categorizeExpense');

exports.addExpense = async (req, res) => {
    const { description, amount } = req.body;
    const category = categorizeExpense(description);
    const newExpense = new Expense({ description, amount, category, userId: req.user.id });
    try {
        const savedExpense = await newExpense.save();
        res.status(201).json(savedExpense);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

exports.getExpenses = async (req, res) => {
    try {
        const expenses = await Expense.find({ userId: req.user.id });
        res.json(expenses);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};
