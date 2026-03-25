# 🎥 WebRTC Video Display Debugging Guide

## Quick Start: 3-Point Debugging

Your application now has **3 comprehensive debugging systems** to diagnose video display issues:

### **Issue #1: Check if `remoteVideoRef.current` exists in the DOM**
### **Issue #2: Verify the stream is assigned to the video element**
### **Issue #3: Test browser autoplay/unmuted policies**

---

## 🎯 How to Debug

### **Method 1: UI Debug Panel (Easiest)**

1. Open the session page with two users (mentor and student)
2. Click the **🔧 Debug** button in the video controls
3. A debug panel appears showing:
   - ✅ DOM reference status
   - ✅ Stream assignment status
   - ✅ Playback policy compatibility
   - ✅ Browser console commands to run

### **Method 2: Browser Console (Most Detailed)**

Open Developer Tools (`F12`) and run these commands:

```javascript
// Check if video element exists in DOM
window.videoDebug.checkDOM()
// Returns: { exists: boolean, details: string }

// Check if stream is assigned to video
window.videoDebug.checkStream()
// Returns: { hasStream: boolean, trackCount: number, details: string }

// Check browser autoplay policies
window.videoDebug.checkPolicy()
// Returns: { autoplayAllowed, unmutedAllowed, recommendations: [] }

// Get complete snapshot of all debug info
window.videoDebug.snapshot()
// Returns: DebugInfo object with all properties

// Force play the video element
window.videoDebug.play()
// Useful for testing browser play policies

// Check mobile-specific requirements
window.videoDebug.mobile()
// Returns: string[] of issues found

// Generate detailed text report
window.videoDebug.report()
// Prints formatted report to console
```

---

## 🔍 What Each Debug Check Shows

### **1️⃣ DOM Reference Check**

**What it tests:**
- Does `remoteVideoRef.current` exist? (is it null?)
- Is the video element actually in the DOM?
- Does it have proper dimensions (width x height)?

**Example output:**
```
✅ remoteVideoRef.current exists and IS in DOM
   - Video Element Mounted: true
   - In Document Body: true
   - Dimensions: 320x240px
```

**If it fails:**
```
❌ remoteVideoRef.current is NULL - video element doesn't exist at all!
❌ remoteVideoRef.current exists but is NOT in DOM - orphaned element!
```

**Fix if fails:**
- Check that the `<video ref={remoteVideoRef} />` element is actually rendered (not conditionally hidden)
- Verify no CSS is hiding it (display: none, visibility: hidden, etc.)

---

### **2️⃣ Stream Assignment Check**

**What it tests:**
- Is a MediaStream assigned to `srcObject`?
- How many tracks does it have (video + audio)?
- Are the tracks enabled and live?

**Example output:**
```
✅ Stream assigned to video element:
   - Total Tracks: 2 (1 video + 1 audio)
   - Video Track Status: LIVE and ENABLED
   - Audio Track Status: LIVE and ENABLED
```

**If it fails:**
```
❌ srcObject is NULL - no stream assigned to video element!
❌ Stream has NO VIDEO TRACKS - only audio!
⚠️ Some video tracks are DISABLED
```

**Fix if fails:**
- Check that `webrtcService.setOnRemoteStream()` callback is being called
- Verify the `ontrack` event fires in WebRTC (logs should show "✅✅✅ ONTRACK FIRED!")
- Ensure stream has at least 1 video track

---

### **3️⃣ Browser Autoplay/Policy Check**

**What it tests:**
- Does the video element have `autoplay` attribute?
- Is it muted (required for autoplay in most browsers)?
- Does it have `playsinline` attribute (required for iOS)?
- Is the element visible to the user?

**Example output:**
```
Chrome: Autoplay ALLOWED
   - Muted Required: YES
   - Has autoplay attr: ✓
   - Has playsinline attr: ✓
   - Visible: ✓
```

**If it fails:**
```
Safari: Autoplay RESTRICTED
   - Missing webkit-playsinline attribute
   - Video element is not visible (display: none)
   - Video has no dimensions
```

**Fixes:**
- Add `autoplay`, `playsInline`, and `webkit-playsinline` attributes
- Make sure video element is not hidden with CSS
- For Chrome/Firefox: Video can be unmuted (no restriction)
- For Safari: Video should be muted and have webkit-playsinline
- For mobile: Always use playsinline

---

## 🚀 Step-by-Step Debugging Process

### **Step 1: Verify DOM Reference**
```javascript
window.videoDebug.checkDOM()
```
- ✅ If returns `exists: true` → Go to Step 2
- ❌ If returns `exists: false` → **FIX: Check render conditions**
  - Is `<video ref={remoteVideoRef} />` always rendered?
  - Check CSS visibility

---

### **Step 2: Verify Stream Assignment**
```javascript
window.videoDebug.checkStream()
```
- ✅ If returns `hasStream: true` with tracks → Go to Step 3
- ❌ If returns `hasStream: false` → **FIX: Check WebRTC callbacks**
  - Look for "✅✅✅ ONTRACK FIRED!" in console
  - Verify `setOnRemoteStream()` is called
  - Check if mentor/student can establish connection

Example fix:
```typescript
webrtcService.setOnRemoteStream((stream, peerId) => {
  console.log('Stream received:', stream);
  if (remoteVideoRef.current) {
    remoteVideoRef.current.srcObject = stream;  // 🔑 This is critical
  }
});
```

---

### **Step 3: Verify Playback Policy**
```javascript
window.videoDebug.checkPolicy()
```
- ✅ If all recommendations are met → Video should play
- ❌ If violations found → **FIX: Apply recommendations**

**Common fixes:**
```html
<!-- For all browsers -->
<video
  ref={remoteVideoRef}
  autoPlay        ← Required for auto playback
  playsInline     ← Required for iOS
  webkit-playsinline  ← Required for older iOS
  muted          ← Required for autoplay without user gesture
  className="w-full h-full object-cover"  ← Make sure it has dimensions
/>
```

---

### **Step 4: Force Play Test (If still not working)**
```javascript
window.videoDebug.play()
```
- ✅ If plays successfully → Video element works, issue is elsewhere
- ❌ If fails with NotAllowedError → Browser autoplay policy blocking
  - Try muting: `remoteVideoRef.current.muted = true`
  - Try getting user gesture first
  - Check browser autoplay settings

---

## 📊 Full Debug Report

For a comprehensive overview of all 3 checks:
```javascript
window.videoDebug.report()
```

This prints a formatted report like:
```
╔════════════════════════════════════════════════════════════════╗
║                 WEBRTC VIDEO DEBUG REPORT                      ║
╚════════════════════════════════════════════════════════════════╝

📊 TIME: 2024-03-24T10:30:45.123Z

┌─ ISSUE #1: DOM Reference ─────────────────────────────────────┐
✅ Video element is properly mounted in DOM
   - Dimensions: 320x240px

┌─ ISSUE #2: Stream Assignment ────────────────────────────────┐
✅ Stream assigned with 1 video + 1 audio tracks
   - Video track: LIVE and ENABLED
   
┌─ ISSUE #3: Playback Policies ────────────────────────────────┐
   - Autoplay Allowed: true
   - Has autoplay attr: ✓
   - Has playsinline attr: ✓
   - Visible: ✓

┌─ Recommendations ─────────────────────────────────────────────┐
   No issues found!
════════════════════════════════════════════════════════════════
```

---

## 🎬 Console Output Interpretation

### **Look for these GOOD signs:**
```
✅✅✅ ONTRACK FIRED! ✅✅✅
🔍 Callback function exists: true
✅ onRemoteStream callback called
💾 [CRITICAL] Setting remote stream to video element!
✅ remoteVideoRef exists, setting srcObject
```

### **Look for these BAD signs:**
```
❌ CALLBACK SET for onRemoteStream is: null
❌ NO CALLBACK SET! this.onRemoteStream is: null
❌ remoteVideoRef.current is NULL!
⚠️ Remote track received but no streams array
```

---

## 🔧 Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| **Remote video ref is null** | Element not rendered | Make `<video>` unconditional, not inside `{remoteUserName && ...}` |
| **Stream doesn't assign** | Callback not set in time | Set callbacks BEFORE async operations (line 1 of initializeVideo) |
| **ontrack never fires** | WebRTC connection not established | Check mentor/student can establish connection |
| **Video stays paused** | Browser autoplay policy | Add `autoplay` and `muted` attributes |
| **iOS shows black screen** | Missing playsinline | Add `playsinline` and `webkit-playsinline` attributes |
| **Chrome mutes video** | Autoplay policy | Must be muted for autoplay, OR requires user gesture |

---

## 🧪 Test Scenarios

### **Scenario 1: Video element not in DOM**
```bash
# Expected debug output:
❌ remoteVideoRef.current is NULL - video element doesn't exist at all!
```

### **Scenario 2: Stream not assigned**
```bash
# Expected debug output:
❌ NO CALLBACK SET! this.onRemoteStream is: null
❌ srcObject is NULL - no stream assigned to video element!
```

### **Scenario 3: Autoplay policy blocking**
```bash
# Expected debug output:
⚠️ Video is currently paused
❌ NotAllowedError - browser autoplay policy
# Fix: Add muted attribute
```

### **Scenario 4: Everything works!**
```bash
✅ Video element is properly mounted in DOM
✅ Stream assigned with 1 video + 1 audio tracks
✅ All browser policies satisfied
# Result: Remote video should display
```

---

## 📱 Mobile-Specific Debugging

For iOS/iPad users:
```javascript
window.videoDebug.mobile()
```

Returns array of mobile-specific issues:
- Missing `playsinline` attribute
- Missing `webkit-playsinline` attribute
- Video not muted (reduces compatibility)

---

## 💬 Debug Output Reference

### **networkState values:**
- 0 = NETWORK_EMPTY (no data)
- 1 = NETWORK_IDLE (nothing loaded)
- 2 = NETWORK_LOADING (loading)
- 3 = NETWORK_NO_SOURCE (no source)

### **readyState values:**
- 0 = HAVE_NOTHING (not enough data to play)
- 1 = HAVE_METADATA (have dimensions)
- 2 = HAVE_CURRENT_DATA (can play current frame)
- 3 = HAVE_FUTURE_DATA (can play ahead)
- 4 = HAVE_ENOUGH_DATA (can play to end)

### **connectionState values:**
- `connecting` → Building connection
- `connected` → Connected and working
- `disconnected` → Intentionally closed
- `failed` → Connection failed
- `closed` → Closed

---

## 🎯 Quick Checklist

Use this when debugging video display issues:

- [ ] Check DOM reference: `window.videoDebug.checkDOM()` returns true
- [ ] Check stream assignment: `window.videoDebug.checkStream()` returns hasStream: true
- [ ] Check browser policies: `window.videoDebug.checkPolicy()` has no recommendations
- [ ] Check console for "✅✅✅ ONTRACK FIRED!" message
- [ ] Check for callback error: "❌ NO CALLBACK SET!"
- [ ] Check if video element is visible (not hidden by CSS)
- [ ] Check if video has dimensions (width x height > 0)
- [ ] Check if video tracks are enabled (not disabled remotely)
- [ ] Try force play: `window.videoDebug.play()`
- [ ] Check mobile requirements: `window.videoDebug.mobile()`

---

## 📞 Still Not Working?

1. Run full report: `window.videoDebug.report()`
2. Check console for error messages (red text)
3. Look for "❌" symbols indicating failures
4. Follow specific fix recommendations for your browser
5. Check individual 3-point debug checks are all passing ✅

**Key files to review:**
- `frontend/src/services/webrtcDebug.ts` - Debug utilities
- `frontend/src/services/webrtc.ts` - WebRTC service (check ontrack handler)
- `frontend/src/app/session/[id]/page.tsx` - Session page (check callback setup in initializeVideo)

