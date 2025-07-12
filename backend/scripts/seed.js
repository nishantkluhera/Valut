const mongoose = require('mongoose');
const User = require('../models/User');
const Category = require('../models/Category');
const Budget = require('../models/Budget');
const Expense = require('../models/Expense');
require('dotenv').config();

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('MongoDB connected for seeding');
    } catch (err) {
        console.error('Database connection error:', err.message);
        process.exit(1);
    }
};

const seedData = async () => {
    try {
        // Clear existing data
        await User.deleteMany({});
        await Category.deleteMany({});
        await Budget.deleteMany({});
        await Expense.deleteMany({});

        // Create default categories
        const categories = [
            { name: 'Food & Dining', type: 'expense', icon: 'utensils', color: '#FF6B6B' },
            { name: 'Transportation', type: 'expense', icon: 'car', color: '#4ECDC4' },
            { name: 'Shopping', type: 'expense', icon: 'shopping-cart', color: '#45B7D1' },
            { name: 'Entertainment', type: 'expense', icon: 'film', color: '#F9CA24' },
            { name: 'Health', type: 'expense', icon: 'heart', color: '#6C5CE7' },
            { name: 'Education', type: 'expense', icon: 'book', color: '#00B894' },
            { name: 'Bills & Utilities', type: 'expense', icon: 'receipt', color: '#E17055' },
            { name: 'Miscellaneous', type: 'expense', icon: 'question', color: '#74B9FF' },
        ];

        const createdCategories = await Category.insertMany(categories);
        console.log(`Created ${createdCategories.length} categories`);

        // Create a demo user
        const demoUser = new User({
            username: 'demo',
            email: 'demo@valut.app',
            password: 'password123',
            profile: {
                firstName: 'Demo',
                lastName: 'User',
                currency: 'USD',
                timezone: 'UTC',
                language: 'en'
            }
        });

        await demoUser.save();
        console.log('Created demo user');

        // Create sample expenses
        const expenses = [
            {
                description: 'Coffee at Starbucks',
                amount: 4.50,
                category: 'Food & Dining',
                userId: demoUser._id,
                date: new Date('2024-01-01'),
                paymentMethod: 'credit_card'
            },
            {
                description: 'Gas for car',
                amount: 45.00,
                category: 'Transportation',
                userId: demoUser._id,
                date: new Date('2024-01-02'),
                paymentMethod: 'credit_card'
            },
            {
                description: 'Grocery shopping',
                amount: 120.50,
                category: 'Food & Dining',
                userId: demoUser._id,
                date: new Date('2024-01-03'),
                paymentMethod: 'debit_card'
            }
        ];

        await Expense.insertMany(expenses);
        console.log(`Created ${expenses.length} sample expenses`);

        console.log('Database seeding completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Error seeding database:', error);
        process.exit(1);
    }
};

const main = async () => {
    await connectDB();
    await seedData();
};

main(); 