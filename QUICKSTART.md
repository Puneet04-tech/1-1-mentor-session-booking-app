# Quick Start Guide

## 🚀 Getting Started

### Prerequisites
- Node.js 16+
- PostgreSQL / Neon account
- Supabase account
- Git

### 1. Clone and Setup

```bash
git clone <your-repo-url>
cd 1-1-mentor-session-booking-app

# Setup frontend
cd frontend
npm install
cp .env.local.example .env.local
# Edit .env.local with your Supabase credentials

# Setup backend (in new terminal)
cd ../backend
npm install
cp .env.example .env
# Edit .env with your database and API keys

# Setup database (in new terminal)
cd ../database
npm install
npm run setup
```

### 2. Start Development Servers

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
# Runs on http://localhost:5000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
# Runs on http://localhost:3000
```

**Database:**
- Neon automatically hosted
- Just set DATABASE_URL in backend .env

### 3. Test the Application

1. Visit http://localhost:3000
2. Sign up (mentor or student)
3. Create a session (if mentor)
4. Join a session (if student)
5. Test code editor, chat, video

---

## 📝 Environment Variables

### Frontend (.env.local)
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_SOCKET_URL=http://localhost:5000
```

### Backend (.env)
```
PORT=5000
DATABASE_URL=postgresql://user:password@host/db
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_API_KEY=your_api_key
JWT_SECRET=your-secret-key-here
CLIENT_URL=http://localhost:3000
```

---

## 🔧 Configuration

### Neon PostgreSQL
1. Create account at neon.tech
2. Create new project
3. Get connection string: `DATABASE_URL`
4. Run migrations: `cd database && npm run setup`

### Supabase
1. Create account at supabase.com
2. Create new project
3. Go to API Settings
4. Copy `Project URL` and `Anon Key`
5. Add to frontend .env.local

---

## 📚 Project Structure

```
├── frontend/              # Next.js application
├── backend/               # Express server
├── database/              # Migrations & seeds
└── docs/                  # Documentation
```

---

## 🎨 Theme Colors

- **Primary Purple**: `#a855f7` - Main actions
- **Secondary Green**: `#22c55e` - Secondary actions
- **Accent Yellow**: `#f59e0b` - Highlights

---

## 🚚 Deployment

### Frontend → Netlify
1. Push to GitHub
2. Connect repository to Netlify
3. Set environment variables
4. Auto-deploys on push

### Backend → Render
1. Push to GitHub
2. Create Web Service on Render
3. Set environment variables
4. Auto-deploys on push

### Database → Neon
- Already hosted
- Just update CONNECTION_STRING

---

## 🐛 Troubleshooting

### Can't connect to backend?
- Check backend is running on :5000
- Verify NEXT_PUBLIC_API_URL
- Check CORS settings

### Database connection error?
- Verify DATABASE_URL format
- Check IP whitelist on Neon
- Test with psql

### Socket.io not connecting?
- Ensure backend Socket.io is running
- Check NEXT_PUBLIC_SOCKET_URL
- Browser console for error details

---

## 📖 Learn More

- [Architecture](docs/ARCHITECTURE.md)
- [Database Schema](docs/DATABASE.md)
- [API Reference](docs/API.md)
- [Deployment Guide](docs/DEPLOYMENT.md)

---

Enjoy building! 🚀
