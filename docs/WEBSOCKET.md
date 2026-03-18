# WebSocket Events Documentation

## Connection

### Connect
```javascript
socketService.connect(token);
```

### Disconnect
```javascript
socketService.disconnect();
```

### Connection Status
```javascript
socketService.isConnected(); // Boolean
```

---

## Session Management

### Join Session
```javascript
socketService.joinSession(sessionId);
```

### Leave Session
```javascript
socketService.leaveSession(sessionId);
```

---

## Code Editor Events

### Send Code Update
```javascript
socketService.sendCode(code, language, userId);

// Received on
socketService.on('code:update', (data) => {
  console.log(data.code);      // Updated code
  console.log(data.language);  // Language
  console.log(data.user_id);   // Who changed it
});
```

### Send Language Change
```javascript
socketService.emit('language:change', { sessionId, language });

// Received on
socketService.on('language:change', (data) => {
  console.log(data.language);
});
```

### Cursor Position
```javascript
socketService.moveCursor(line, column, userId);

// Received on
socketService.on('cursor:move', (data) => {
  console.log(data.line, data.column);
});
```

---

## Chat Events

### Send Message
```javascript
socketService.sendMessage(content, type);

// Received on
socketService.on('message:receive', (message) => {
  console.log(message);
});
```

---

## Video Call Events

### Initiate Call
```javascript
socketService.initiateVideoCall(initiatorId);

// Received on
socketService.on('video:incoming-call', (data) => {
  console.log('Call from:', data.initiatorId);
});
```

### Accept Call
```javascript
socketService.acceptVideoCall(acceptorId);
```

### Decline Call
```javascript
socketService.declineVideoCall(reason);

// Received on
socketService.on('video:declined', (data) => {
  console.log('Reason:', data.reason);
});
```

### Send Offer (SDP)
```javascript
socketService.sendVideoOffer(offerSDP);

// Received on
socketService.on('video:offer', (data) => {
  console.log(data.offer); // SDP
});
```

### Send Answer (SDP)
```javascript
socketService.sendVideoAnswer(answerSDP);

// Received on
socketService.on('video:answer', (data) => {
  console.log(data.answer); // SDP
});
```

### Send ICE Candidate
```javascript
socketService.sendICECandidate(candidate);

// Where candidate is:
{
  candidate: "candidate:...",
  sdpMLineIndex: 0,
  sdpMid: "0"
}

// Received on
socketService.on('video:ice-candidate', (candidate) => {
  peerConnection.addIceCandidate(candidate);
});
```

### End Call
```javascript
socketService.emit('video:end');

// Received on
socketService.on('video:ended', () => {
  console.log('Call ended');
});
```

---

## Presence & Status

### Update Presence
```javascript
socketService.emit('presence:update', {
  status: 'online', // 'online', 'away', 'typing'
  user_id: userId
});

// Received on
socketService.on('presence:updated', (data) => {
  console.log(data.status);
});
```

### User Joined
```javascript
socketService.on('presence:user-joined', (data) => {
  console.log(data.userId, 'joined');
  console.log(data.userName);
});
```

### User Left
```javascript
socketService.on('presence:user-left', (data) => {
  console.log(data.userId, 'left');
});
```

---

## Error Handling

```javascript
socketService.on('error', (error) => {
  console.error('Socket error:', error);
});

socketService.on('connected', () => {
  console.log('Connected!');
});

socketService.on('disconnected', () => {
  console.log('Disconnected!');
});
```

---

## Example: Complete Video Call Flow

```javascript
import { socketService } from '@/services/socket';

// 1. Initiate call
socketService.initiateVideoCall(myId);

// 2. Wait for offer or create one
const peerConnection = new RTCPeerConnection();

peerConnection.onicecandidate = (event) => {
  if (event.candidate) {
    socketService.sendICECandidate(event.candidate);
  }
};

const offer = await peerConnection.createOffer();
await peerConnection.setLocalDescription(offer);
socketService.sendVideoOffer(offer);

// 3. Receive answer from other user
socketService.on('video:answer', async (data) => {
  const answer = new RTCSessionDescription(data.answer);
  await peerConnection.setRemoteDescription(answer);
});

// 4. Handle ICE candidates
socketService.on('video:ice-candidate', async (candidate) => {
  try {
    await peerConnection.addIceCandidate(candidate);
  } catch (e) {
    console.error('Error adding ice candidate', e);
  }
});

// 5. Handle streams
peerConnection.ontrack = (event) => {
  // Render remote stream
  remoteVideo.srcObject = event.streams[0];
};

// 6. End call
socketService.emit('video:end');
```

---

## Namespace Handling

Sessions use room-based architecture:
```
Rooms: session:{sessionId}

Only users in the same session receive each other's messages.
```

---

## Throttling & Optimization

- Code updates: 300ms throttle
- Cursor moves: 200ms throttle
- Presence updates: 30s heartbeat
- Messages: No throttle (immediate)
