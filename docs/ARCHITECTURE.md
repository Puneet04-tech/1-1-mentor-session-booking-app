# 🏗️ System Architecture

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (Netlify)                   │
│                    Next.js + React + Tailwind               │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Auth UI    │  │  Dashboard   │  │ Session Page │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │   Editor     │  │ Video Call   │  │    Chat      │    │
│  │  (Monaco)    │  │  (WebRTC)    │  │ (Socket.io)  │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              ↕ WebSocket / HTTP
                              ↕ Socket.io / Fetch
┌─────────────────────────────────────────────────────────────┐
│                   BACKEND (Render)                          │
│               Node.js + Express + Socket.io                 │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │              REST API Routes                         │ │
│  │  Auth | Sessions | Users | Chat | Code Execution   │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │         WebSocket (Socket.io) Handlers              │ │
│  │  Code Sync | Chat | Video Signaling | Presence     │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │         Services Layer                              │ │
│  │  Auth | Session | Code | CodeExec | Messaging      │ │
│  └──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              ↕ SQL Queries
┌─────────────────────────────────────────────────────────────┐
│           DATABASE (PostgreSQL - Neon)                      │
│                                                             │
│  Users │ Sessions │ Messages │ Code Snapshots │ Presence   │
└─────────────────────────────────────────────────────────────┘
```

## Component Architecture

### Frontend Components

```
App/
├── Layout
│   ├── Navbar/Header
│   ├── Sidebar
│   └── Footer
├── Auth/
│   ├── LoginPage
│   ├── SignupPage
│   └── RolePage
├── Dashboard/
│   ├── MentorDashboard
│   ├── StudentDashboard
│   └── SessionsList
├── Session/
│   ├── SessionCreator
│   ├── SessionJoiner
│   └── ActiveSession/
│       ├── CodeEditor
│       ├── VideoPanel
│       ├── ChatPanel
│       └── ControlPanel
├── Profile/
│   ├── UserProfile
│   └── ProfileSettings
└── Shared/
    ├── Avatar
    ├── Badge
    ├── Button
    └── Modal
```

## Backend Module Architecture

```
Express App
├── Middleware/
│   ├── Auth (JWT verification)
│   ├── ErrorHandler
│   ├── Logger
│   └── CORS
├── Routes/
│   ├── auth.ts
│   ├── users.ts
│   ├── sessions.ts
│   ├── messages.ts
│   └── code.ts
├── Controllers/
│   ├── authController.ts
│   ├── userController.ts
│   ├── sessionController.ts
│   ├── messageController.ts
│   └── codeController.ts
├── Services/
│   ├── authService.ts
│   ├── sessionService.ts
│   ├── codeService.ts
│   ├── codeExecutionService.ts
│   └── messagingService.ts
├── Socket/
│   ├── codeHandler.ts
│   ├── chatHandler.ts
│   ├── videoHandler.ts
│   └── presenceHandler.ts
├── Database/
│   ├── connection.ts
│   └── queries.ts
└── Utils/
    ├── validators.ts
    ├── helpers.ts
    └── constants.ts
```

## Data Flow

### Code Editing Flow

```
User Types Code
      ↓
Monaco Editor onChange
      ↓
Socket.io emit 'code:update'
      ↓
Backend receives event
      ↓
Throttle & validate
      ↓
Broadcast to paired user
      ↓
Update DB snapshot
      ↓
Other user's editor updates
```

### Video Call Flow

```
Mentor initiates call
      ↓
Emit 'video:initiate' via Socket.io
      ↓
Student receives notification
      ↓
Student accepts
      ↓
Generate SDP offer (Mentor)
      ↓
Send via Socket.io signaling
      ↓
Generate SDP answer (Student)
      ↓
Exchange ICE candidates
      ↓
RTCPeerConnection established
      ↓
Video/Audio streams flowing
```

### Message Flow

```
User types message
      ↓
Submit in chat UI
      ↓
Socket.io emit 'message:send'
      ↓
Backend validates
      ↓
Save to database
      ↓
Broadcast 'message:receive'
      ↓
Both users see message
```

## Real-time Sync Strategy

### Code Editor Sync
- **Strategy**: Last-Write-Wins (LWW)
- **Throttle**: 300ms debounce
- **Conflict**: Latest timestamp wins
- **Storage**: Store snapshots every 30 seconds

### Cursor Sync
- **Event**: `cursor:move` with position {line, column}
- **Throttle**: 200ms
- **Display**: Show other user's cursor in real-time

### Presence
- **Heartbeat**: Every 30 seconds
- **Status**: Online, Away, Typing
- **Display**: User avatars with status indicator

## Security Architecture

```
┌─────────────────┐
│   Frontend      │
│  (Token stored  │
│   in memory)    │
└────────┬────────┘
         │
         ↓ (Attach JWT token)
┌──────────────────────┐
│  Backend             │
│  ├─ Auth Middleware  │
│  ├─ JWT Verify       │
│  ├─ Role Check       │
│  └─ Rate Limit       │
└──────────────────────┘
         │
         ↓ (Authorized request)
┌──────────────────────┐
│  Route Handler       │
│  ├─ Validate input   │
│  ├─ Check ownership  │
│  └─ Execute action   │
└──────────────────────┘
```

## Database Architecture

```
┌─────────────┐      ┌──────────────┐      ┌───────────┐
│   Users     │◄────►│  Sessions    │◄────►│ Messages  │
├─────────────┤      ├──────────────┤      ├───────────┤
│ id (PK)     │      │ id (PK)      │      │ id (PK)   │
│ email       │      │ mentor_id    │      │ session_id│
│ role        │      │ student_id   │      │ user_id   │
│ profile     │      │ status       │      │ content   │
│ created_at  │      │ created_at   │      │ timestamp │
└─────────────┘      └──────────────┘      └───────────┘
         ▲                    ▲
         │                    │
         │                    ▼
    ┌────────────────────────────────┐
    │   Code Snapshots               │
    ├────────────────────────────────┤
    │ id, session_id, code, language │
    │ saved_at, user_id              │
    └────────────────────────────────┘
```

## Scalability Considerations

1. **Database**: 
   - Proper indexing on frequently queried fields
   - Connection pooling via Neon

2. **WebSocket**:
   - Use Socket.io namespaces for isolation
   - Implement room-based broadcasting

3. **Code Sync**:
   - Debouncing to reduce message frequency
   - Store snapshots instead of every keystroke

4. **Video**:
   - Use STUN servers for NAT traversal
   - TURN servers if needed (for complex networks)

## Deployment Architecture

```
┌─────────────────────────────────────────┐
│           GitHub Repository             │
└────────┬──────────────────┬─────────────┘
         │                  │
         ↓                  ↓
    ┌────────────┐     ┌────────────┐
    │  Netlify   │     │  Render    │
    │ (Frontend) │     │ (Backend)  │
    └────────────┘     └────────────┘
         ↓                  ↓
      CI/CD               CI/CD
```

---

**Architecture is designed for scalability, real-time collaboration, and secure communication.**
