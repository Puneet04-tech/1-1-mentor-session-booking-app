# Socket.IO Connection Troubleshooting Guide

## 🔴 Problem: Socket Connection Timeout

If you see this error in browser console:
```
❌ Socket connect_error: Error: timeout
```

This means the frontend cannot establish a Socket.IO connection to the backend. This prevents all WebRTC video streaming from working.

---

## ✅ Quick Fixes (Try in Order)

### 1. **Verify Socket URL Configuration**

Check that your environment variables are correctly set.

**Frontend (Netlify Environment Variables):**
```
NEXT_PUBLIC_SOCKET_URL=https://mentor-session-backend.onrender.com
NEXT_PUBLIC_API_URL=https://mentor-session-backend.onrender.com
```

**Backend (Render Environment Variables):**
```
CLIENT_URL=https://your-netlify-site.netlify.app
CLIENT_URLS=https://your-netlify-site.netlify.app
```

⚠️ **IMPORTANT**: Replace `your-netlify-site` with your actual Netlify domain!

**To find your Netlify domain:**
1. Go to your Netlify dashboard
2. Find your site and look for the URL (usually `https://[site-name].netlify.app`)
3. Copy this exact URL to backend's `CLIENT_URL` or `CLIENT_URLS`

### 2. **Update Backend Environment Variables**

If you've already deployed and the socket is timing out:

1. Go to Render Dashboard → select `mentor-session-backend`
2. Navigate to **Environment** tab
3. Update or add these variables:
   - `CLIENT_URL`: Set to your Netlify frontend URL
   - `CLIENT_URLS`: Set to your Netlify frontend URL (comma-separated if multiple)
4. Click **Save** (this triggers a redeploy)
5. Wait for deployment to complete

### 3. **Rebuild Frontend on Netlify**

After updating backend variables:

1. Go to Netlify Dashboard → select your site
2. Click **Deploys** → **Trigger deploy** → **Deploy site**
3. Wait for build to complete

---

## 🔍 Debugging Steps

### Step 1: Check the Logs

**Backend Logs (Render):**
1. Go to Render Dashboard → select `mentor-session-backend`
2. Go to **Logs** tab
3. Look for these messages:
   - Should see: `✅ Socket.IO allowed origins: [...]`
   - When connection attempts: `📍 Socket.IO incoming origin: https://...`
   - If connection succeeds: `✅ Origin accepted: https://...`
   - If rejected: `❌ Origin rejected: https://...`

**Frontend Console (Browser):**
1. Open the video session page
2. Press `F12` to open Developer Tools
3. Go to **Console** tab
4. Look for these messages:
   - `🔌 Connecting to socket at: https://mentor-session-backend.onrender.com`
   - Should see transport type: `📊 Connected via transport: websocket` or `polling`
   - If error: `❌ Socket connect_error: Error: ...`

### Step 2: Check Browser Console Details

In browser console, after seeing the error, check:

```javascript
// These will show diagnostics
window.webrtcDiag?.summary()  // Should list all WebRTC events
window.webrtcDiag?.events()   // Should show event log

// Check if socket is initialized
console.log(window.socketService?.isConnected?.())
```

### Step 3: Verify Render Backend is Running

Open in a new browser tab:
```
https://mentor-session-backend.onrender.com/health
```

Should return:
```json
{
  "status": "healthy",
  "timestamp": "2024-..."
}
```

If this fails:
- Backend may be down or crashed
- Check Render logs for errors
- May need to restart the service

---

## 🛠️ Most Common Issues & Solutions

### Issue 1: "CORS policy violation"
**Cause**: Backend doesn't recognize frontend origin

**Solution**:
1. Check Render logs see what origin was rejected
2. Copy that exact origin
3. Go to Render → Environment → Set `CLIENT_URL` to that origin
4. Save and wait for redeploy

### Issue 2: "timeout"
**Cause**: Backend unreachable or websocket not working on Render

**Solution**:
1. Check if backend is running: Visit `/health` endpoint
2. Check Render free tier may have connection limits
3. The socket.io client now has polling fallback - should automatically switch transports
4. Check Render logs for any errors

### Issue 3: "Authentication failed"
**Cause**: Token is invalid or JWT_SECRET doesn't match

**Solution**:
1. Ensure JWT_SECRET is the same on backend
2. Check that your auth token is being sent correctly
3. Restart browser and try again (get a fresh token)

### Issue 4: Still timing out after all fixes
**Cause**: Likely deep network/infrastructure issue

**Solution**:
1. Try accessing from different network (different WiFi/cellular)
2. Clear browser cache: `Ctrl+Shift+Delete`
3. Try different browser (Chrome, Firefox, Edge)
4. Check if ISP blocking: Try VPN
5. Consider upgrading Render from free tier to paid

---

## 📋 Environment Variables Checklist

Use this checklist when deploying:

**Frontend (Netlify):**
- [ ] `NEXT_PUBLIC_API_URL` = `https://mentor-session-backend.onrender.com`
- [ ] `NEXT_PUBLIC_SOCKET_URL` = `https://mentor-session-backend.onrender.com`
- [ ] `NODE_VERSION` = `18.17.0` (or compatible)

**Backend (Render):**
- [ ] `NODE_ENV` = `production`
- [ ] `PORT` = `5000`
- [ ] `DATABASE_URL` = Your Neon or Postgres connection string
- [ ] `JWT_SECRET` = A long random string
- [ ] `CLIENT_URL` = Your Netlify URL (e.g., `https://my-site.netlify.app`)
- [ ] `CLIENT_URLS` = Same as CLIENT_URL (comma-separated if multiple origins)
- [ ] `PISTON_API` = `https://emkc.org/api/v2` (for code execution)
- [ ] `ENABLE_CODE_EXECUTION` = `true`

---

## 🧪 Testing the Connection

Once deployed, test with these steps:

### Test 1: Access Frontend
1. Open your Netlify URL in browser
2. Sign in with valid credentials
3. Navigate to a video session

### Test 2: Check Connection
```javascript
// In browser console:
window.socketService?.socket?.connected  // Should be true
window.socketService?.socket?.id          // Should show a socket ID like "abc123xyz"
```

### Test 3: View WebRTC Status
```javascript
window.webrtcDiag?.summary()  // Should show WebRTC connection info
```

### Test 4: Start a Session
1. Have two different user accounts
2. One user initiates a session
3. Other user joins
4. Video should appear within 3-5 seconds
5. Audio/video should be working

---

## 📞 Still Having Issues?

Check these resources:
- Socket.IO Client Docs: https://socket.io/docs/v4/client-api/
- Render Deployment: https://render.com/docs
- Netlify Environment: https://docs.netlify.com/configure-builds/environment/

Add more logs to understand the flow:
1. Check browser console for error messages
2. Check Render backend logs for origin information
3. Verify all environment variables are set correctly
4. Try the health check endpoint

---

## 🔧 Recent Changes Made to Fix Timeouts

The following improvements were made to handle socket timeouts better:

1. **Added Polling Fallback**: Socket now tries websocket first, then falls back to HTTP long-polling
2. **Increased Timeout**: Changed from 20s default to 15s explicit timeout
3. **Better Logging**: Added detailed diagnostic messages to help troubleshoot
4. **Transport Detection**: Now logs which transport is being used (websocket vs polling)
5. **Origin Logging**: Backend now logs what origins are accepted/rejected

These changes should significantly improve connection reliability, especially on Render free tier.
