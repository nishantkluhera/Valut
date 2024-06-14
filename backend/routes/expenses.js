const express = require('express');
const { addExpense, getExpenses } = require('../controllers/expenseController');
const auth = require('../middleware/auth');
const router = express.Router();

router.post('/', auth, addExpense);
router.get('/', auth, getExpenses);

module.exports = router;
