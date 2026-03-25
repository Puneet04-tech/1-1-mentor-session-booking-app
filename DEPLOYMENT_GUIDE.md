# 🚀 Deployment Guide: Render + Netlify

Complete step-by-step instructions to deploy the Mentor Session Booking App on **Render** (Backend) and **Netlify** (Frontend).

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Backend Deployment on Render](#backend-deployment-on-render)
3. [Frontend Deployment on Netlify](#frontend-deployment-on-netlify)
4. [Environment Variables Reference](#environment-variables-reference)
5. [Post-Deployment Testing](#post-deployment-testing)
6. [Troubleshooting](#troubleshooting)

---

## ✅ Prerequisites

- GitHub account (for deploying from repositories)
- Render account (https://render.com)
- Netlify account (https://netlify.com)
- Neon PostgreSQL account (https://neon.tech) for database
- Judge0 API key (for code execution)
- All environment variables ready

---

## 🔧 Backend Deployment on Render

### **Step 1: Prepare Your GitHub Repository**

```bash
# Ensure all files are committed
git add .
git commit -m "Prepare for Render deployment"
git push origin main
```

### **Step 2: Create Neon PostgreSQL Database**

1. Go to https://neon.tech
2. Sign up or log in
3. Create a new project
4. Get your **DATABASE_URL** connection string (looks like):
   ```
   postgresql://user:password@ep-xxxxx.us-east-1.neon.tech/dbname
   ```

### **Step 3: Deploy Backend on Render**

1. **Go to Render Dashboard**: https://dashboard.render.com
2. **Click "New +"** → Select **"Web Service"**
3. **Connect to GitHub**:
   - Select your repository
   - Connect your GitHub account if not already
   
4. **Configure Service**:
   - **Name**: `mentor-session-backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: `Free` (or Paid if you need better performance)
   - **Region**: Choose closest to your users

5. **Set Environment Variables** (click "Advanced" → "Add Environment Variable"):

   | Key | Value | Notes |
   |-----|-------|-------|
   | `NODE_ENV` | `production` | Production mode |
   | `PORT` | `5000` | Backend port |
   | `DATABASE_URL` | Your Neon connection string | From Step 2 |
   | `JWT_SECRET` | Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | Keep secure! |
   | `JWT_EXPIRE` | `7d` | Token expiration |
   | `CORS_ORIGIN` | `https://your-netlify-app.netlify.app` | Your Netlify frontend URL (add after creating) |
   | `JUDGE0_API_BASE_URL` | `https://judge0-ce.p.rapidapi.com` | Code execution API |
   | `JUDGE0_API_KEY` | From RapidAPI | For Judge0 access |
   | `JUDGE0_HOST` | `judge0-ce.p.rapidapi.com` | Judge0 host |

6. **Deploy**:
   - Click **"Create Web Service"**
   - Wait for deployment to complete
   - Copy your backend URL: `https://mentor-session-backend.onrender.com`

### **Step 4: Create PostgreSQL Database on Render (Optional)**

If you don't have Neon, create Postgres on Render:

1. Click **"New +"** → **"PostgreSQL"**
2. **Name**: `mentor-postgres`
3. **PostgreSQL Version**: 15
4. **Region**: Same as backend
5. Click **"Create Database"**
6. Copy the connection string to `DATABASE_URL`
7. Run migrations:
   ```bash
   npm run migrate:seed
   ```

---

## 🌐 Frontend Deployment on Netlify

### **Step 1: Prepare Frontend**

Ensure frontend has backend URL:

```bash
# In .env.production (create if doesn't exist)
NEXT_PUBLIC_API_URL=https://mentor-session-backend.onrender.com
NEXT_PUBLIC_SOCKET_URL=https://mentor-session-backend.onrender.com
```

Or update your environment variables after connecting to Netlify.

### **Step 2: Deploy Frontend on Netlify**

1. **Go to Netlify**: https://app.netlify.com
2. **Click "Add new site"** → **"Import an existing project"**
3. **Connect GitHub**:
   - Select your GitHub account
   - Choose your repository
   - Authorize Netlify

4. **Configure Build**:
   - **Base directory**: `frontend`
   - **Build command**: `npm run build`
   - **Publish directory**: `.next`

5. **Set Environment Variables** (click "Advanced" → "New variable"):

   | Key | Value | Notes |
   |-----|-------|-------|
   | `NEXT_PUBLIC_API_URL` | `https://mentor-session-backend.onrender.com` | Your Render backend URL |
   | `NEXT_PUBLIC_SOCKET_URL` | `https://mentor-session-backend.onrender.com` | Same as backend URL |
   | `NODE_VERSION` | `18.17.0` | Node version for build |

6. **Deploy**:
   - Click **"Deploy site"**
   - Wait for build to complete
   - Your frontend URL will be: `https://your-site-name.netlify.app`

### **Step 3: Connect Frontend to Backend**

After getting your frontend URL, update backend's `CORS_ORIGIN`:

1. Go to **Render Dashboard**
2. Select **mentor-session-backend**
3. Go to **Environment** tab
4. Update `CORS_ORIGIN` = `https://your-site-name.netlify.app`
5. Click **"Save"** (will trigger redeploy)

---

## 🔐 Environment Variables Reference

### **Backend (Render) - Complete List**

```env
# Node Configuration
NODE_ENV=production
PORT=5000

# Database
DATABASE_URL=postgresql://user:password@ep-xxxxx.us-east-1.neon.tech/dbname

# JWT Authentication
JWT_SECRET=your-very-long-random-secret-key-here
JWT_EXPIRE=7d

# CORS
CORS_ORIGIN=https://your-netlify-app.netlify.app

# Judge0 Code Execution (RapidAPI)
JUDGE0_API_BASE_URL=https://judge0-ce.p.rapidapi.com
JUDGE0_API_KEY=your-rapidapi-key-here
JUDGE0_HOST=judge0-ce.p.rapidapi.com
```

### **Frontend (Netlify) - Complete List**

```env
# API Configuration
NEXT_PUBLIC_API_URL=https://mentor-session-backend.onrender.com
NEXT_PUBLIC_SOCKET_URL=https://mentor-session-backend.onrender.com

# Build Configuration
NODE_VERSION=18.17.0
```

---

## 🔑 How to Generate Secure Values

### **1. Generate JWT_SECRET**

```bash
# On your computer terminal:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Output:
# a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

### **2. Get Judge0 API Key**

1. Go to https://rapidapi.com
2. Search for "Judge0"
3. Click "Judge0 API"
4. Click **"Subscribe"** (free tier available)
5. Copy your **X-RapidAPI-Key**
6. Use as `JUDGE0_API_KEY`

### **3. Connect Neon Database**

1. Go to https://neon.tech
2. Create project
3. Connection string format:
   ```
   postgresql://[user]:[password]@[host]/[database]
   ```

---

## ✅ Post-Deployment Testing

### **Test Backend Health**

```bash
curl https://mentor-session-backend.onrender.com/api/health
# Should return: { "status": "ok" }
```

### **Test API Endpoints**

```bash
# Sign up
curl -X POST https://mentor-session-backend.onrender.com/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "name": "Test User",
    "password": "password123",
    "role": "student"
  }'

# Login
curl -X POST https://mentor-session-backend.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### **Test Frontend Connection**

1. Open https://your-site-name.netlify.app
2. Try signing up with test account
3. Check browser console (F12) for any API errors
4. Should see successful login

### **Test Database**

```bash
# From backend terminal
npm run migrate
npm run seed
# Should see test users created
```

### **Test Password Auth**

```bash
curl -X POST https://mentor-session-backend.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john_mentor@example.com",
    "password": "password123"
  }'
# Should return JWT token
```

---

## 🐛 Troubleshooting

### **Issue: Database connection fails**

**Error**: `ECONNREFUSED` or `timeout`

**Fix**:
1. Verify DATABASE_URL is correct
2. Check IP allowlist on Neon (should be `0.0.0.0/0`)
3. Run migrations: `npm run migrate:seed`
4. Check logs in Render dashboard

### **Issue: CORS errors in browser console**

**Error**: `Access to XMLHttpRequest blocked by CORS policy`

**Fix**:
1. Update `CORS_ORIGIN` in Render to match your Netlify URL
2. Make sure it starts with `https://`
3. Don't include trailing slash: `https://app.netlify.app` ✅ not `https://app.netlify.app/` ❌
4. Redeploy backend after changing

### **Issue: Frontend shows 404**

**Error**: Page not found

**Fix**:
1. Check build logs in Netlify (Deployments tab)
2. Ensure build command is correct: `npm run build`
3. Ensure publish directory is `.next`
4. Check `NEXT_PUBLIC_API_URL` in environment variables

### **Issue: WebRTC video not working**

**Error**: Remote video not displaying

**Fix**:
1. Video requires HTTPS (both frontend and backend must be HTTPS) ✅
2. Check browser console for security warnings
3. Use debug panel: Click 🔧 Debug in video controls
4. Run: `window.videoDebug.report()` in console

### **Issue: Code execution (Judge0) not working**

**Error**: "Failed to execute code"

**Fix**:
1. Verify `JUDGE0_API_KEY` is correct
2. Check RapidAPI subscription is active
3. Verify `JUDGE0_API_BASE_URL` and `JUDGE0_HOST` are correct
4. Check RapidAPI rate limits (free: 100 requests/day)

### **Issue: Render deployment fails**

**Error**: Build fails with npm errors

**Fix**:
1. Check Node version (18.x or higher)
2. Verify package.json exists in root
3. Check logs in Render dashboard
4. Ensure all dependencies are in package.json
5. Try: `npm ci` in local and push

### **Issue: Free tier resources exhausted**

**Problem**: App sleeps after 15 mins inactivity, websockets timeout

**Solutions**:
1. Upgrade to Paid tier on Render
2. Use pinging service (https://uptimerobot.com)
3. Or deploy on alternative: Heroku, Railway, Fly.io

---

## 📊 Deployment Checklist

### **Before Deploying**

- [ ] All code committed to GitHub
- [ ] All environment variables documented
- [ ] Database migrations created (`npm run migrate`)
- [ ] Test locally: `npm run dev` (backend) and `npm run dev` (frontend)
- [ ] `.env` files NOT in git repo
- [ ] API endpoints return correct responses

### **Backend Deployment**

- [ ] Render account created
- [ ] Neon/PostgreSQL database created
- [ ] render.yaml configured
- [ ] All environment variables set on Render
- [ ] Backend URL copied
- [ ] Health endpoint tested: `/api/health`
- [ ] Database migrations run on Render

### **Frontend Deployment**

- [ ] Netlify account created
- [ ] netlify.toml configured
- [ ] `NEXT_PUBLIC_API_URL` set correctly
- [ ] Frontend deployed successfully
- [ ] Frontend URL copied
- [ ] Backend CORS_ORIGIN updated with frontend URL
- [ ] Can access login page

### **Post-Deployment**

- [ ] Test signup/login flow
- [ ] Test video call functionality
- [ ] Test code editor
- [ ] Test chat
- [ ] Test screen sharing
- [ ] Check browser console for errors
- [ ] Monitor Render/Netlify logs for warnings

---

## 🔗 Quick Links

**Render Dashboard**: https://dashboard.render.com

**Netlify Dashboard**: https://app.netlify.com

**Neon Database**: https://neon.tech

**RapidAPI**: https://rapidapi.com

**Monitor Performance**:
- Render Logs: Dashboard → Select Service → Logs
- Netlify Logs: Deployments → View Deploy Log

---

## 💡 Tips for Production

1. **Enable Auto-Deployment**:
   - Render: Automatic on git push
   - Netlify: Automatic on git push

2. **Monitor Logs**:
   - Set up error tracking (Sentry, LogRocket)
   - Monitor WebSocket connections
   - Track API response times

3. **Optimize Performance**:
   - Enable caching on Netlify
   - Use CDN for static files
   - Optimize database queries

4. **Security**:
   - Rotate JWT_SECRET periodically
   - Monitor API usage
   - Implement rate limiting
   - Use HTTPS everywhere ✅

5. **Database Backups**:
   - Neon: Automatic backups included
   - Regular export of critical data
   - Test restore process

---

## 🆘 Need Help?

**Render Support**: https://render.com/docs

**Netlify Support**: https://docs.netlify.com

**Neon Support**: https://neon.tech/docs

**Your Project Documentation**: See `README.md` and `QUICKSTART.md`

