# 🚀 Deployment Guide: Socket.IO Timeout Fix

## What Was Fixed

The Socket.IO connection was timing out, preventing video streaming from working. This has been fixed by:

1. ✅ Adding HTTP long-polling as a fallback transport (if websocket fails)
2. ✅ Increasing connection timeout to 15 seconds
3. ✅ Adding comprehensive logging to debug connection issues
4. ✅ Better error messages to identify CORS/auth/network problems

---

## Deploy the Fix (Quick Steps)

### Step 1: Update Backend Environment Variables (Render)

1. Go to **Render Dashboard** → Select **mentor-session-backend**
2. Click **Environment** tab
3. Find/Update these variables:
   ```
   CLIENT_URL = https://your-site-name.netlify.app
   CLIENT_URLS = https://your-site-name.netlify.app
   ```
   ⚠️ Replace `your-site-name` with your actual Netlify domain

4. Click **Save** (this triggers automatic redeploy)

### Step 2: Update Frontend Environment Variables (Netlify)

1. Go to **Netlify Dashboard** → Select your site
2. Click **Site settings** → **Build & deploy** → **Environment**
3. Ensure these variables are set:
   ```
   NEXT_PUBLIC_SOCKET_URL = https://mentor-session-backend.onrender.com
   NEXT_PUBLIC_API_URL = https://mentor-session-backend.onrender.com
   ```

### Step 3: Rebuild Frontend (Netlify)

1. Go to **Deploys** tab
2. Click **Trigger deploy** → **Deploy site**
3. Wait for build to complete (5-10 minutes)

### Step 4: Test the Connection

1. Open your site in browser
2. Sign in and go to a video session
3. Open **Developer Console** (`F12`)
4. Look for messages like:
   - `🔌 Connecting to socket at: https://mentor-session-backend.onrender.com`
   - `✅ Socket connected:` (socket ID will appear)
   - `📊 Connected via transport: websocket` or `polling`

5. If successful: Remote video should appear within 3-5 seconds
6. If still timing out: See **Troubleshooting** section below

---

## What Your Netlify Domain Is

If you don't know your Netlify domain:

1. Go to Netlify Dashboard
2. Find your site in the list
3. The blue link is your domain (e.g., `https://my-app-123.netlify.app`)
4. Use this URL in backend's `CLIENT_URL` variable

---

## Troubleshooting

### Issue: Still seeing `Socket connect_error: timeout`

**Check in this order:**

1. **Verify browser console has**: 
   - `📍 Socket URL is: https://mentor-session-backend.onrender.com`
   - If the URL is wrong, rebuild frontend
   
2. **Check backend logs** (Render Dashboard → Logs):
   - Should see: `✅ Socket.IO allowed origins: [...]`
   - Should include your Netlify domain
   - If NOT showing, update `CLIENT_URL` variable
   
3. **Verify health endpoint**:
   - Visit: `https://mentor-session-backend.onrender.com/health`
   - Should return `{"status": "healthy", ...}`
   - If error: Backend might be crashed or starting up
   
4. **Check CORS error in logs**:
   - If you see `❌ Origin rejected: https://your-site.netlify.app`
   - Make sure this exact URL is in backend's `CLIENT_URL`
   - No typos or trailing slashes!

### Issue: Connected but no video appears

- Socket is working now! 
- This means video streaming issue is separate
- Check that both users are in the same session
- Check browser permissions for camera/microphone
- Open browser console and check for WebRTC errors

### Issue: "Authentication failed"

- Token might be expired or invalid
- Refresh page and try again
- Clear browser cache if problem persists
- Check that `JWT_SECRET` is same on backend

---

## Environment Variables Quick Reference

### Frontend (Netlify)
```
NEXT_PUBLIC_SOCKET_URL = https://mentor-session-backend.onrender.com
NEXT_PUBLIC_API_URL = https://mentor-session-backend.onrender.com
NODE_VERSION = 18.17.0
```

### Backend (Render)
```
NODE_ENV = production
PORT = 5000
DATABASE_URL = [Your Neon or Postgres URL]
JWT_SECRET = [Random long string]
CLIENT_URL = https://[your-netlify-site].netlify.app
CLIENT_URLS = https://[your-netlify-site].netlify.app
PISTON_API = https://emkc.org/api/v2
ENABLE_CODE_EXECUTION = true
```

---

## Test Checklist

After deployment, verify these work:

- [ ] Frontend builds successfully (no errors)
- [ ] Backend deploys successfully (check Render logs)
- [ ] Can see `Compiled successfully` message in Netlify logs
- [ ] Socket connects in browser console (see `✅ Socket connected`)
- [ ] Transport shows as `websocket` or `polling` (not stuck)
- [ ] `/health` endpoint returns status 200
- [ ] Backend shows your Netlify domain in allowed origins
- [ ] Open session page shows no timeout errors
- [ ] Remote video streams within 5 seconds of joining

---

## Technical Details

### What Changed

1. **Socket Transport Configuration**:
   ```javascript
   // OLD: websocket only (fails if not supported)
   transports: ['websocket']
   
   // NEW: websocket first, then polling fallback
   transports: ['websocket', 'polling']
   ```

2. **Timeout Configuration**:
   ```javascript
   // Explicit timeout to ensure we know when to fail
   timeout: 15000  // 15 seconds
   ```

3. **Connection Error Handling**:
   - Better categorization: CORS error vs Auth error vs Timeout
   - Shows actual socket URL being used
   - Shows current transport type

4. **Backend CORS Logging**:
   - Logs every incoming origin request
   - Shows if origin is accepted or rejected
   - Helps debug origin mismatch issues

---

## If Issues Persist

1. **Clear everything**:
   - Clear browser cache: `Ctrl+Shift+Delete`
   - Hard refresh: `Ctrl+Shift+R`

2. **Check logs in order**:
   - Browser console (F12)
   - Netlify deploy logs
   - Render backend logs

3. **Verify URLs match exactly**:
   - Copy from Netlify: `https://[site].netlify.app`
   - Paste into Render's `CLIENT_URL` - exact match required

4. **Test from different network**:
   - Try WiFi and cellular (if possible)
   - Try different browser (Chrome, Firefox, Safari)
   - Try VPN if on restricted network

---

## Need More Help?

See [SOCKET_IO_TROUBLESHOOTING.md](./SOCKET_IO_TROUBLESHOOTING.md) for detailed debugging steps and advanced diagnostics.
