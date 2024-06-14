const categorizeExpense = (description) => {
    if (description.toLowerCase().includes('grocery')) return 'Groceries';
    if (description.toLowerCase().includes('uber') || description.toLowerCase().includes('lyft')) return 'Transportation';
    if (description.toLowerCase().includes('netflix')) return 'Entertainment';
    return 'Miscellaneous';
};

module.exports = categorizeExpense;
