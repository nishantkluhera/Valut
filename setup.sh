#!/bin/bash

# Valut Setup Script
# This script helps you set up the Valut cross-platform personal finance tracker

echo "🚀 Setting up Valut - Cross-Platform Personal Finance Tracker"
echo "============================================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+ first."
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

# Check if MongoDB is running
if ! pgrep mongod &> /dev/null; then
    echo "⚠️  MongoDB is not running. Please start MongoDB first."
    echo "   You can install MongoDB from: https://www.mongodb.com/try/download/community"
fi

echo ""
echo "📦 Installing Backend Dependencies..."
cd backend
npm install

echo ""
echo "📦 Installing Frontend Dependencies..."
cd ../frontend
npm install

echo ""
echo "🔧 Setting up Environment Variables..."
cd ../backend

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    cat > .env << EOF
# Server Configuration
NODE_ENV=development
PORT=5000

# Database Configuration
MONGO_URI=mongodb://localhost:27017/valut

# JWT Configuration
JWT_SECRET=$(openssl rand -hex 32)

# Frontend Configuration
FRONTEND_URL=http://localhost:3000

# Security Configuration
BCRYPT_ROUNDS=12
SESSION_SECRET=$(openssl rand -hex 32)

# File Upload Configuration
MAX_FILE_SIZE=10485760
UPLOAD_DIR=uploads

# API Configuration
API_RATE_LIMIT=100
API_RATE_WINDOW=900000

# WebSocket Configuration
WS_ORIGINS=http://localhost:3000

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=logs/app.log

# Cache Configuration
CACHE_TTL=3600
EOF
    echo "✅ Created .env file with secure random secrets"
else
    echo "✅ .env file already exists"
fi

# Create necessary directories
mkdir -p logs uploads

echo ""
echo "🎉 Setup Complete!"
echo ""
echo "📋 Next Steps:"
echo "1. Make sure MongoDB is running on localhost:27017"
echo "2. Start the backend server:"
echo "   cd backend && npm run dev"
echo "3. In another terminal, start the frontend:"
echo "   cd frontend && npm start"
echo "4. Open http://localhost:3000 in your browser"
echo ""
echo "🔧 Advanced Setup:"
echo "- Edit backend/.env to customize configuration"
echo "- The app will automatically create default categories on first use"
echo "- Install as PWA from your browser for native-like experience"
echo ""
echo "📖 Documentation: See README.md for detailed information"
echo "🆘 Support: https://github.com/your-username/valut/issues"
echo ""
echo "Happy expense tracking! 💰✨" 