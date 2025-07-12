# Valut - Cross-Platform Personal Finance Tracker

A comprehensive personal finance tracker designed to work seamlessly across Windows, Android, and Linux with real-time synchronization and offline capabilities.

## 🌟 Features

### Core Functionality
- **Expense Management**: Add, edit, delete, and categorize expenses with smart auto-categorization
- **Budget Tracking**: Create and manage budgets with real-time alerts and analytics
- **Advanced Analytics**: Comprehensive insights, trends, and predictions
- **Category Management**: Hierarchical categories with custom rules and automation
- **Recurring Expenses**: Automatic recurring expense creation and management
- **Multi-Currency Support**: Track expenses in multiple currencies
- **Receipt Attachments**: Attach photos and documents to expenses

### Cross-Platform Support
- **Progressive Web App (PWA)**: Works on all platforms with native-like experience
- **Real-time Sync**: Automatic synchronization across all devices
- **Offline Functionality**: Full offline capability with background sync
- **Responsive Design**: Optimized for desktop, tablet, and mobile

### Advanced Features
- **Data Export/Import**: JSON and CSV format support
- **Backup & Restore**: Comprehensive backup system
- **Conflict Resolution**: Intelligent sync conflict handling
- **Push Notifications**: Budget alerts and reminders
- **Device Management**: Track and manage connected devices
- **Security Features**: JWT authentication, rate limiting, and data encryption

## 🏗️ Architecture

### Backend (Node.js + Express + MongoDB)
- **Enhanced API**: RESTful API with comprehensive endpoints
- **WebSocket Support**: Real-time synchronization using Socket.IO
- **Database**: MongoDB with advanced indexing and aggregation
- **Security**: Helmet, rate limiting, CORS, and input validation
- **Logging**: Winston for comprehensive logging
- **File Uploads**: Multer for attachment handling

### Frontend (React PWA)
- **Progressive Web App**: Full PWA with offline capabilities
- **State Management**: Redux Toolkit for state management
- **UI Components**: Modern, responsive React components
- **Charts & Analytics**: Chart.js for data visualization
- **Form Handling**: React Hook Form for efficient form management
- **Styling**: Styled Components with modern CSS

### Database Schema
```
Users:
- Profile information and preferences
- Security settings and 2FA
- Device management
- Subscription details
- Statistics and streaks

Expenses:
- Basic expense information
- Location and payment method
- Tags and attachments
- Recurring patterns
- Sync metadata
- Analytics data

Categories:
- Hierarchical structure
- Custom rules and keywords
- Budget integration
- Statistics tracking

Budgets:
- Flexible budget periods
- Category allocations
- Alert thresholds
- Goal tracking
- Historical data
```

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ 
- MongoDB 4.4+
- npm or yarn

### Backend Setup
```bash
cd backend
npm install
cp .env.example .env
# Configure your environment variables
npm run dev
```

### Frontend Setup
```bash
cd frontend
npm install
npm start
```

### Environment Variables
```env
# Backend (.env)
NODE_ENV=development
PORT=5000
MONGO_URI=mongodb://localhost:27017/valut
JWT_SECRET=your-secret-key
FRONTEND_URL=http://localhost:3000

# Additional configuration...
```

## 📱 Cross-Platform Deployment

### Progressive Web App
The PWA can be installed on any platform:
- **Desktop**: Chrome, Edge, Firefox (installable)
- **Android**: Chrome, Samsung Internet (installable)
- **iOS**: Safari (add to home screen)

### Installation Process
1. Visit the web app URL
2. Look for the install prompt
3. Click "Install" to add to your device
4. Launch like any native app

### Offline Functionality
- Full offline expense tracking
- Background synchronization when online
- Cached data for instant access
- Offline form submission queue

## 🔄 Synchronization

### Real-time Sync
- WebSocket connections for instant updates
- Automatic conflict resolution
- Device-specific sync tracking
- Merge strategies for data conflicts

### Offline Sync
- Service worker background sync
- Queued requests when offline
- Automatic retry mechanisms
- Conflict detection and resolution

## 📊 Analytics & Insights

### Dashboard Analytics
- Monthly/yearly spending summaries
- Category breakdowns
- Spending trends and patterns
- Budget performance metrics

### Advanced Analytics
- Predictive spending analysis
- Unusual expense detection
- Category insights and recommendations
- Financial goal tracking

### Reporting
- Export data in JSON/CSV formats
- Custom date range reports
- Category-specific reports
- Budget performance reports

## 🔒 Security

### Authentication
- JWT-based authentication
- Password hashing with bcrypt
- Account lockout protection
- Session management

### Data Protection
- Input validation and sanitization
- SQL injection prevention
- XSS protection
- CSRF protection
- Rate limiting

### Privacy
- Data encryption at rest
- Secure data transmission
- No third-party tracking
- Local data storage options

## 🛠️ Development

### Project Structure
```
valut/
├── backend/
│   ├── controllers/
│   ├── models/
│   ├── routes/
│   ├── middleware/
│   ├── utils/
│   └── server.js
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── contexts/
│   │   ├── services/
│   │   └── App.js
│   ├── public/
│   └── package.json
└── README.md
```

### API Endpoints
```
Authentication:
POST /api/auth/login
POST /api/auth/register

Expenses:
GET /api/expenses
POST /api/expenses
PUT /api/expenses/:id
DELETE /api/expenses/:id

Categories:
GET /api/categories
POST /api/categories
PUT /api/categories/:id
DELETE /api/categories/:id

Analytics:
GET /api/analytics/dashboard
GET /api/analytics/trends/:period
GET /api/analytics/insights

Sync:
GET /api/sync/status
POST /api/sync/push
GET /api/sync/changes

Backup:
GET /api/backup/export
POST /api/backup/import
```

### Testing
```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

## 📈 Performance

### Backend Optimization
- Database indexing for fast queries
- Caching strategies
- Connection pooling
- Query optimization

### Frontend Optimization
- Code splitting and lazy loading
- Service worker caching
- Image optimization
- Bundle size optimization

## 🔧 Configuration

### Backend Configuration
- Environment-specific settings
- Database connection options
- Security configurations
- Logging levels

### Frontend Configuration
- API endpoint configuration
- PWA settings
- Cache strategies
- Theme customization

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

- **Issues**: Report bugs and feature requests
- **Documentation**: Comprehensive API documentation
- **Community**: Join our Discord for support and discussions

## 🎯 Roadmap

### Phase 1 (Current)
- ✅ Core expense tracking
- ✅ Cross-platform PWA
- ✅ Real-time synchronization
- ✅ Offline functionality

### Phase 2 (Next)
- 🔄 React Native mobile app
- 🔄 Electron desktop app
- 🔄 Advanced analytics
- 🔄 Receipt OCR scanning

### Phase 3 (Future)
- 📱 Bank integration
- 🤖 AI-powered insights
- 📊 Advanced reporting
- 🔒 Multi-user support

## 📊 Statistics

- **Performance**: Sub-second load times
- **Offline**: 100% offline functionality
- **Sync**: Real-time synchronization
- **Security**: Enterprise-grade security
- **Platforms**: Windows, Android, Linux, iOS

---

**Built with ❤️ for cross-platform personal finance management**
