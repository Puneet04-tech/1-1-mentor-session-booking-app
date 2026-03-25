# 🎯 Deployment Setup Instructions

## Quick Setup (5-10 minutes)

Follow these steps **in order** to deploy your app on Render (backend) + Netlify (frontend).

---

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   Your Deployment                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────┐          ┌──────────────────┐    │
│  │   NETLIFY        │          │   RENDER         │    │
│  │  (Frontend)      │  ◄──►   │  (Backend API)   │    │
│  │                  │  REST    │                  │    │
│  │ your-app         │  WebRTC  │ mentor-session   │    │
│  │ .netlify.app     │  Socket  │ .onrender.com    │    │
│  └──────────────────┘          └──────────────────┘    │
│         ▲                                 ▲              │
│         │                                 │              │
│         └──────────────┬──────────────────┘              │
│                        │                                 │
│                   ┌────┴─────┐                          │
│                   │ NEON      │                          │
│                   │ PostgreSQL│                          │
│                   │           │                          │
│                   └───────────┘                          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 🔑 Step 0: Generate Secure Keys

Run these commands NOW and save the outputs:

### Generate JWT Secret
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
**Output example**: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2`

Save this! You'll need it for Render.

---

## ✨ Step 1: Create Neon PostgreSQL Database

**Time: 2 minutes**

1. Go to **https://neon.tech**
2. Click **"Sign Up"** (or log in)
3. Create a new project
4. Go to **"Connection Details"**
5. Copy your **CONNECTION STRING** that looks like:
   ```
   postgresql://user:password@ep-xxxxx.us-east-1.neon.tech/dbname
   ```

✅ **Save this** as your `DATABASE_URL`

---

## 🎮 Step 2: Get Judge0 API Key

**Time: 3 minutes**

1. Go to **https://rapidapi.com**
2. Create account (or log in)
3. Search for **"Judge0"**
4. Click **"Judge0 CE API"**
5. Click **"Subscribe"** (free tier is fine)
6. Go to **"Endpoints"** tab
7. Copy your **X-RapidAPI-Key**

✅ **Save this** as your `JUDGE0_API_KEY`

---

## 🚀 Step 3: Deploy Backend on Render

**Time: 5 minutes**

1. Go to **https://render.com** → Create account
2. Click **"New +"** → **"Web Service"**
3. Click **"Connect to GitHub"**
   - Link your GitHub account
   - Select your repository
4. **Configure Service**:
   - Name: `mentor-session-backend`
   - Environment: `Node`
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Plan: `Free` ✅
5. **Add Environment Variables**:

| Variable | Value | Where to get |
|----------|-------|-------------|
| `NODE_ENV` | `production` | Type this |
| `PORT` | `5000` | Type this |
| `DATABASE_URL` | Your Neon URL | From Step 1 ✅ |
| `JWT_SECRET` | Your generated key | From Step 0 ✅ |
| `JWT_EXPIRE` | `7d` | Type this |
| `CORS_ORIGIN` | `https://YOUR-NETLIFY-URL.netlify.app` | You'll add this later |
| `JUDGE0_API_BASE_URL` | `https://judge0-ce.p.rapidapi.com` | Type this |
| `JUDGE0_API_KEY` | Your RapidAPI key | From Step 2 ✅ |
| `JUDGE0_HOST` | `judge0-ce.p.rapidapi.com` | Type this |

6. Click **"Create Web Service"**
7. Wait for deployment (5-10 minutes)
8. Copy your backend URL: `https://mentor-session-backend.onrender.com`

⏳ **While waiting, proceed to Step 4**

---

## 🌐 Step 4: Deploy Frontend on Netlify

**Time: 5 minutes**

1. Go to **https://netlify.com** → Create account
2. Click **"Add new site"** → **"Import an existing project"**
3. **Connect GitHub**:
   - Click "GitHub"
   - Authorize Netlify
   - Select your repository
4. **Configure Build**:
   - **Base directory**: `frontend`
   - **Build command**: `npm run build`
   - **Publish directory**: `.next`
5. **Add Environment Variables** (click "Advanced"):

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | `https://mentor-session-backend.onrender.com` |
| `NEXT_PUBLIC_SOCKET_URL` | `https://mentor-session-backend.onrender.com` |
| `NODE_VERSION` | `18.17.0` |

6. Click **"Deploy site"**
7. Wait for deployment (3-5 minutes)
8. Copy your frontend URL: `https://xxxxx.netlify.app`

---

## 🔄 Step 5: Connect Frontend to Backend (CORS)

**Time: 1 minute**

Now that you have your Netlify URL, update backend:

1. Go back to **Render Dashboard**
2. Select **`mentor-session-backend`**
3. Go to **"Environment"** tab
4. Find **`CORS_ORIGIN`** and update to: `https://xxxxx.netlify.app`
   - Replace `xxxxx` with your actual Netlify subdomain
   - Must have `https://`
   - No trailing slash!
5. Click **"Save"** (will redeploy backend)

✅ Backend and frontend are now connected!

---

## ✅ Step 6: Test Everything

### Test 1: Backend Health
```bash
curl https://mentor-session-backend.onrender.com/api/health
# Should return: {"status":"ok"}
```

### Test 2: Frontend Loads
Open `https://xxxxx.netlify.app` in browser
- Should see login page
- No error messages in console (F12)

### Test 3: Test Account Login
Use these credentials:
```
Email: john_mentor@example.com
Password: password123
```
(These were created during database setup)

### Test 4: Check Console
Open Developer Tools (F12):
- Go to **Console** tab
- Should NOT see red error messages
- May see yellow warnings (fine)
- Look for success messages

---

## 📊 Environment Variables Summary

### Backend (Render) - 9 Variables
```
NODE_ENV = production
PORT = 5000
DATABASE_URL = [From Neon]
JWT_SECRET = [Generated key]
JWT_EXPIRE = 7d
CORS_ORIGIN = [Your Netlify URL]
JUDGE0_API_BASE_URL = https://judge0-ce.p.rapidapi.com
JUDGE0_API_KEY = [From RapidAPI]
JUDGE0_HOST = judge0-ce.p.rapidapi.com
```

### Frontend (Netlify) - 3 Variables
```
NEXT_PUBLIC_API_URL = [Your Render backend URL]
NEXT_PUBLIC_SOCKET_URL = [Your Render backend URL]
NODE_VERSION = 18.17.0
```

---

## 🎯 What Each Variable Does

| Variable | Purpose | Example |
|----------|---------|---------|
| `DATABASE_URL` | Connects to PostgreSQL | `postgresql://user:pass@host/db` |
| `JWT_SECRET` | Signs authentication tokens | Random 64-character string |
| `CORS_ORIGIN` | Allows frontend to talk to backend | `https://app.netlify.app` |
| `JUDGE0_API_KEY` | Allows code execution | RapidAPI key |
| `NEXT_PUBLIC_API_URL` | Frontend knows backend location | `https://backend.onrender.com` |

---

## 🚨 Troubleshooting

### ❌ "Cannot read DATABASE_URL"
**Fix**: Check Neon URL is set correctly on Render

### ❌ "CORS error in browser"
**Fix**: 
1. Check `CORS_ORIGIN` on Render matches Netlify URL exactly
2. Redeploy backend on Render
3. Hard refresh frontend (Ctrl+Shift+R)

### ❌ "Login fails"
**Fix**:
1. Check backend logs: Render → Select service → Logs
2. Database migrations may not have run
3. User account may not exist (try john_mentor@example.com)

### ❌ "Video shows black screen"
**Fix**:
1. Both frontend and backend must be HTTPS ✅ (automatic)
2. Open debug panel: 🔧 Debug button in video
3. Run: `window.videoDebug.report()`

### ❌ "Render deployment fails"
**Fix**:
1. Check build logs in Render dashboard
2. Ensure `npm install` works locally
3. Verify node version is 18+
4. Check for uncommitted changes

---

## 📱 Testing on Mobile

1. Open `https://xxxxx.netlify.app` on phone
2. Landscape mode recommended for better layout
3. Allow camera/microphone when prompted
4. Try joining a session

---

## 🎉 Success Checklist

- [ ] Backend deployed and healthy (health check passes)
- [ ] Frontend deployed and loads
- [ ] Can log in with test account
- [ ] Can create new session
- [ ] Video call works (two browser tabs)
- [ ] Screen sharing works
- [ ] Code editor syncs between two windows
- [ ] Chat messages appear instantly
- [ ] No error messages in console

---

## 📞 Useful Links

| Service | Link | Purpose |
|---------|------|---------|
| **Render** | https://dashboard.render.com | Backend hosting |
| **Netlify** | https://app.netlify.com | Frontend hosting |
| **Neon** | https://neon.tech | PostgreSQL database |
| **RapidAPI** | https://rapidapi.com | Judge0 API key |

---

## 💡 Pro Tips

1. **Enable auto-deployments**: Both Render and Netlify auto-deploy on git push
2. **Monitor logs**: Keep dashboard tabs open to monitor for errors
3. **Custom domain**: Both services allow custom domain (optional)
4. **Free tier limits**:
   - Render sleeps after 15 mins inactivity (normal)
   - Netlify has generous limits (fine for testing)
5. **Stick with free tier initially**, upgrade only if needed

---

## 🆘 Still Having Issues?

1. Check the detailed **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)**
2. Check **[ENV_SETUP.md](ENV_SETUP.md)** for variable reference
3. Review logs:
   - Render: Dashboard → Logs
   - Netlify: Deployments → view deploy log
4. Try locally first: `npm run dev` (backend & frontend)

---

**Estimated Total Time: 15-20 minutes**

Good luck! 🚀

