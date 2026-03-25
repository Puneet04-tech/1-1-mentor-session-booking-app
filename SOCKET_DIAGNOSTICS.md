# Socket.IO Connection Diagnostics

## ✅ How to Verify Socket Connection is Working

After deploying the Socket.IO timeout fix, use these diagnostics to confirm everything is connected properly.

---

## 🔍 Browser Console Checks

Open **Developer Tools** (`F12`) → **Console** tab in your session page and run these commands:

### Check 1: Socket Connection Status
```javascript
// Should show true if connected
console.log('Socket Connected:', window.socketService?.socket?.connected)

// Should show a socket ID like "abc123xyz"
console.log('Socket ID:', window.socketService?.socket?.id)

// Should show either 'websocket' or 'polling'  
console.log('Transport Type:', window.socketService?.socket?.io?.engine?.transport?.name)
```

**Expected Output:**
```
Socket Connected: true
Socket ID: "abc123xyz..."
Transport Type: "websocket"
```

### Check 2: WebRTC Stream Status
```javascript
// Should show all WebRTC events including offers, answers, ICE candidates
window.webrtcDiag?.summary()

// Should show an array of events
window.webrtcDiag?.events()

// Should show count of events
window.webrtcDiag?.export()
```

**Expected Output:**
```
{
  "offers": 1,
  "answers": 1,
  "iceCandidates": 12,
  "streamsReceived": 1,
  "connections": 1
}
```

### Check 3: Connection Timeline
```javascript
// Shows all events in order
window.webrtcDiag?.events().forEach(e => 
  console.log(`${e.timestamp}: ${e.event} - ${e.details.type || ''}`)
)
```

**Expected Sequence:**
1. Socket connects
2. Offer sent/received
3. Answer sent/received  
4. ICE candidates exchanged (multiple)
5. Remote stream received
6. Video appears on remote side

---

## 📊 Backend Log Checks

Go to **Render Dashboard** → select **mentor-session-backend** → **Logs** tab:

### What to Look For

When socket connection attempts:

#### ✅ Success Pattern:
```
🔌 Socket.IO allowed origins: ["https://my-site.netlify.app","http://localhost:3000"]
📍 Socket.IO incoming origin: https://my-site.netlify.app
✅ Origin accepted: https://my-site.netlify.app
🔐 Socket auth attempt for client: abc123xyz  
✅ Socket authenticated for user: 123 (socket: abc123xyz)
```

#### ❌ Failure Pattern #1 (Origin Mismatch):
```
❌ Origin rejected: https://wrong-domain.netlify.app
📊 Allowed origins were: ["https://correct-domain.netlify.app"]
```
**Fix**: Update backend `CLIENT_URL` to exact Netlify domain

#### ❌ Failure Pattern #2 (Auth Token Invalid):
```
🔴 Socket authentication error: jwt malformed
```
**Fix**: Check JWT_SECRET matches, or refresh page to get new token

---

## 🧪 Live Test Steps

### Test 1: Single User Session
1. Log in as a user
2. Go to **Sessions** page
3. Start a session with yourself
4. Open **Console** (`F12`)
5. Run: `window.socketService?.socket?.connected`
6. Should return `true`
7. Open **Logs** (`F12` → **Logs** tab)
8. Should see no error messages
9. Video element should not be black

### Test 2: Two User Video Call
1. Open two browser windows/tabs
2. Log in as different users (mentor and student)
3. Mentor user: Start a session, copy session ID
4. Student user: Join using session ID
5. Both should see:
   - ✅ Socket connected status in console
   - ✅ Transport type showing as websocket or polling
   - ✅ Remote video appears within 3-5 seconds
   - ✅ Video/audio working (if permissions granted)

### Test 3: Error Handling
1. Disable internet briefly (unplug network)
2. Socket should show reconnecting
3. Check logs for: `📊 Reconnection attempt status`
4. When internet returns, should reconnect automatically
5. Video should resume

---

## 📋 Diagnostic Commands Summary

Copy-paste these into browser console:

```javascript
// Quick health check
console.log({
  socketConnected: window.socketService?.socket?.connected,
  socketId: window.socketService?.socket?.id,
  transport: window.socketService?.socket?.io?.engine?.transport?.name,
  webrtcEvents: window.webrtcDiag?.events?.()?.length || 0,
  remoteStreams: window.webrtcDiag?.export?.()?.streamsReceived || 0
})

// Full diagnostics
window.webrtcDiag?.summary()

// Export all data for debugging
JSON.stringify(window.webrtcDiag?.export?.(), null, 2)
```

---

## 🔴 Common Issues & What to Check

### Issue: Shows `false` for connected
```javascript
window.socketService?.socket?.connected  // false - NOT GOOD
```
**What to check:**
1. Look at browser console for errors like "timeout", "CORS", "Authentication"
2. Check Render logs to see if origin is being rejected
3. Verify backend `CLIENT_URL` env var matches your Netlify domain exactly
4. Try refreshing page (gets fresh token)

### Issue: Transport is `undefined`
```javascript
window.socketService?.socket?.io?.engine?.transport?.name  // undefined
```
**What to check:**
1. Transport might still be negotiating
2. Wait 2-3 seconds and try again
3. If still undefined, check browser console for errors
4. May indicate websocket and polling both failed

### Issue: WebRTC events are empty
```javascript
window.webrtcDiag?.events()  // Returns empty array []
```
**What to check:**
1. Socket needs to be connected first
2. Session might not have started properly
3. Check `window.socketService?.socket?.connected` first
4. Try starting session again

### Issue: Remote stream never received
```javascript
window.webrtcDiag?.export().streamsReceived  // 0
```
**What to check:**
1. Verify both users are in same session
2. Check ICE candidates in events (should have several)
3. Check answer/offer were properly exchanged
4. Verify browser has camera permission granted
5. Check connection is not blocked by firewall/ISP

---

## 🎯 Success Criteria

Your system is working correctly when:

✅ Socket Connected: `true`
✅ Socket ID: Shows an ID (not empty)
✅ Transport: Shows `websocket` (or `polling` if websocket is unavailable)
✅ WebRTC Events: Shows offers, answers, ICE candidates
✅ Remote Streams: Shows 1 or more
✅ No error messages in browser console
✅ Backend logs show origin accepted
✅ Remote video appears within 5 seconds of joining
✅ Video/audio working (with permissions granted)

---

## 📞 Getting Help

If diagnostics show issues:

1. **Take a screenshot** of console output
2. **Copy backend logs** from Render for the time period
3. **Check environment variables** match exactly (no typos)
4. **Verify URLs** match between frontend and backend
5. **Clear cache** and try again (`Ctrl+Shift+Delete`)

See [SOCKET_IO_TROUBLESHOOTING.md](./SOCKET_IO_TROUBLESHOOTING.md) for detailed troubleshooting steps.
