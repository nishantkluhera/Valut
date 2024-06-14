import React from 'react';

function ExpenseList({ expenses }) {
    return (
        <ul className="list-group">
            {expenses.map(expense => (
                <li key={expense._id} className="list-group-item">
                    <div><strong>{expense.description}</strong> - ${expense.amount}</div>
                    <div><small>{expense.category}</small></div>
                </li>
            ))}
        </ul>
    );
}

export default ExpenseList;
