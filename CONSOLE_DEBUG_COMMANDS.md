# Console Command Reference - Complete Debugging Guide

When you have video issues, use these console commands to diagnose the problem.

---

## 🔴 Quick Health Check (Run These First)

### 1. Is Socket Connected?
```javascript
window.socketService?.isConnected()
```

**Expected Output**: `true`

**If False**: 
- Socket not connected
- Video will NOT work (all signaling requires socket)
- Check: "Socket Connection Failed" section below

---

### 2. What's the Socket Status?
```javascript
window.socketService?.getSocket()?.connected
```

**Expected Output**: `true`

**If Different**: Something wrong with socket initialization

---

### 3. Are WebRTC Diagnostics Available?
```javascript
window.webrtcDiag
```

**Expected Output**: 
```javascript
{
  summary: ƒ,
  events: ƒ,
  export: ƒ,
  clear: ƒ,
  printSummary: ƒ
}
```

**If Undefined**: WebRTC not initialized in your session page

---

## 📊 WebRTC Status (Run After Socket is Connected)

### 4. Get Full WebRTC Summary
```javascript
window.webrtcDiag?.summary()
```

**Expected Output**:
```javascript
{
  offers: 1,
  answers: 1,
  iceCandidates: 12,
  streamsReceived: 1,
  connections: 1
}
```

**What Each Means**:
- `offers: 1` → Mentor sent WebRTC offer ✅
- `answers: 1` → Student sent WebRTC answer ✅
- `iceCandidates: 12` → Network negotiation happened ✅
- `streamsReceived: 1` → Remote stream was received ✅
- `connections: 1` → Peer connection established ✅

**If Any Are 0**:
- `offers: 0` → Mentor never sent offer (mentor side issue)
- `answers: 0` → Student never sent answer (student side issue)
- `iceCandidates: 0` → Network negotiation failed
- `streamsReceived: 0` → Remote stream never arrived
- `connections: 0` → Peer connection never established

---

### 5. View All Events in Order
```javascript
window.webrtcDiag?.events()
```

**Expected Sequence**:
```javascript
{
  timestamp: "14:23:45",
  event: "offer",
  details: {type: "offer", ...}
}
{
  timestamp: "14:23:46",
  event: "answer",
  details: {type: "answer", ...}
}
{
  timestamp: "14:23:47",
  event: "ice-candidate",
  details: {index: 0, ...}
}
// ... more ICE candidates ...
{
  timestamp: "14:23:49",
  event: "stream-received",
  details: {tracks: 2, ...}
}
```

**What to Look For**:
1. Do you see "offer"?
2. Do you see "answer"?
3. Are there ICE candidates (usually 5-20)?
4. Do you see "stream-received"?

If answer "no" to any: That step failed, that's your problem

---

### 6. Export All Diagnostic Data
```javascript
window.webrtcDiag?.export()
```

**Expected Output**: Complete event history with all details
- Useful for sending to support
- Shows everything that happened

---

## 🔗 Socket Details

### 7. Check Socket ID
```javascript
window.socketService?.getSocket()?.id
```

**Expected Output**: Something like `"abc123xyz_-AAAB"`

**What This Means**: Unique identifier for your socket connection

---

### 8. Check Transport Type (Websocket vs Polling)
```javascript
window.socketService?.getSocket()?.io?.engine?.transport?.name
```

**Expected Output**: Either `"websocket"` or `"polling"`

**What This Means**:
- `"websocket"` - Fast, ideal, what we want ✅
- `"polling"` - Slower but works when websocket blocked
- If neither: Transport negotiation still happening or failed

---

### 9. Check if Socket Has Message Handlers
```javascript
window.socketService?.getSocket()?.hasListeners('video:offer')
```

**Expected Output**: `true`

**If False**: Event listener not registered, which means video won't work

---

## ❌ Diagnosis Flowchart

Use this to find your exact problem:

```
START HERE
    ↓
Is socket connected?
    ├─ NO → Go to "Socket Not Connected" section
    └─ YES ↓
        Is WebRTC diagnostics available?
            ├─ NO → Page not initialized properly
            └─ YES ↓
                Does summary() show offers?
                    ├─ NO → Mentor never initiated connection
                    └─ YES ↓
                        Does summary() show answers?
                            ├─ NO → Student never responded
                            └─ YES ↓
                                Does summary() show ice-candidates > 0?
                                    ├─ NO → Network negotiation failed
                                    └─ YES ↓
                                        Does summary() show streamsReceived > 0?
                                            ├─ NO → Stream never arrived
                                            └─ YES ✅ VIDEO SHOULD BE WORKING!
```

---

## 🔴 Socket Not Connected

### Problem: Socket connection failed
```javascript
window.socketService?.isConnected()
// Returns: false or undefined
```

### Diagnosis Steps:

1. **Check browser console for error messages**
   - Look for: `❌ Socket connect_error:`
   - Look for: `Socket URL is:`

2. **Check socket URL**
   ```javascript
   // Should end with backend URL
   window.socketService?.getSocket()?.io?.uri
   // Returns: "https://mentor-session-backend.onrender.com"
   ```

3. **Check current transport**
   ```javascript
   window.socketService?.getSocket()?.io?.engine?.transport?.name
   // Should be websocket or polling, not undefined
   ```

4. **Wait for connection**
   - Socket takes a few seconds to connect
   - Wait 5 seconds and run check again
   - Should eventually show connected

5. **Check Render backend logs**
   - Go to Render Dashboard → Logs
   - Look for: "CORS policy violation"
   - This means origin mismatch

---

## 🟠 Socket Connected but No Video

### Problem: Socket works but video not appearing
```javascript
window.socketService?.isConnected()
// Returns: true

window.webrtcDiag?.summary()
// Returns: {offers: 0, answers: 0, ...}
```

### Likely Causes:

1. **Mentor never sent offer**
   - Check mentor side: Is mentor the "mentor" role?
   - Check mentor console: `window.webrtcService` available?
   - Mentor should see "Mentor detected - initiating WebRTC connection"

2. **Student never received offer**
   - Check student console for errors
   - Check socket connection is working
   - Socket should have 'video:offer' listener

3. **Race condition between mentor join and student prep**
   - Both need to be ready before WebRTC can start
   - Mentor initiates, student waits for offer
   - If mentor joins too fast, socket listeners may not be setup

---

## 🟡 Partial Video (One Direction Works)

### Problem: Student sees mentor, but mentor sees black screen
```javascript
// Student side - working
window.webrtcDiag?.summary()
// {offers: 1, answers: 1, streamsReceived: 1} ✅

// Mentor side - not working  
window.webrtcDiag?.summary()
// {offers: 1, answers: 1, streamsReceived: 0} ❌
```

### Diagnosis:

1. **Bidirectional issue**: Transceivers not sending both ways
   - May be browser permission issue
   - Check if student granted camera permission

2. **Check remote video element exists**
   ```javascript
   // On mentor side
   document.querySelector('video')  // Should find video elements
   ```

3. **Check if ref null error in console**
   - Look for: "❌ remoteVideoRef.current is NULL"
   - This means video element not properly initialized

4. **Retry mechanism**:
   - We added 500ms retry if ref is null
   - Wait a few seconds, may appear automatically

---

## 💾 Save Diagnostics for Support

```javascript
// Export all data
const data = window.webrtcDiag?.export();

// Print as JSON
console.log(JSON.stringify(data, null, 2));

// Save to file (in DevTools console):
copy(JSON.stringify(data, null, 2));
// Then paste into a text editor and save
```

---

## 🔧 More Debug Commands

### Check Browser Permissions
```javascript
navigator.mediaDevices?.enumerateDevices()
```

Should show your camera and microphone devices

### Check Local Stream
```javascript
window.webrtcService?.getLocalStream?.()?.getTracks()
```

Should show local audio and video tracks

### Check Peer Connections
```javascript
window.webrtcService?.getPeerConnections?.()
```

Should show established peer connections

### Monitor Events Live
```javascript
// Get new events every 2 seconds
setInterval(() => {
  const events = window.webrtcDiag?.events();
  console.clear();
  console.table(events);
}, 2000);
```

---

## ✨ Pro Tips

1. **Keep console open while testing**
   - Easier to catch errors as they happen
   - F12 to toggle, then to Console tab

2. **Hard refresh before testing**
   - Ctrl+F5 (Windows) or Cmd+Shift+R (Mac)
   - Clears old code from cache

3. **Testing two-user flow**
   - Open DevTools in both browsers
   - Run diagnostics on both sides
   - Compare what each side sees

4. **Copy/Paste Friendly**
   - All commands above can be copy-pasted directly
   - Use autocomplete: type window. then pause
   - Use arrow keys to navigate

5. **Screenshot for support**
   - Take screenshot of console output
   - Helpful for reporting issues
   - Use: Fn+Print Screen or Share → Screenshot tool

