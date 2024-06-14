import React, { useState } from 'react';
import axios from 'axios';

function ExpenseForm({ token, onAddExpense }) {
    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');

    const handleAddExpense = () => {
        const expense = { description, amount: parseFloat(amount) };
        axios.post('/api/expenses', expense, { headers: { 'x-auth-token': token } })
            .then(response => onAddExpense(response.data))
            .catch(error => console.error('Error adding expense:', error));
    };

    return (
        <div className="mb-3">
            <input
                type="text"
                className="form-control"
                placeholder="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
            />
            <input
                type="number"
                className="form-control mt-2"
                placeholder="Amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
            />
            <button className="btn btn-primary mt-2" onClick={handleAddExpense}>Add Expense</button>
        </div>
    );
}

export default ExpenseForm;

