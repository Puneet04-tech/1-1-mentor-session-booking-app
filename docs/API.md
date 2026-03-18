# API Reference

## Authentication Endpoints

### Sign Up
```
POST /api/auth/signup

Request:
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe",
  "role": "mentor" | "student"
}

Response:
{
  "success": true,
  "data": {
    "user": { id, email, name, role },
    "token": "jwt_token"
  }
}
```

### Sign In
```
POST /api/auth/login

Request:
{
  "email": "user@example.com",
  "password": "password123"
}

Response:
{
  "success": true,
  "data": {
    "user": { id, email, name, role },
    "token": "jwt_token"
  }
}
```

### Get Current User
```
GET /api/auth/me
Headers: Authorization: Bearer {token}

Response:
{
  "success": true,
  "data": { id, email, name, role, avatar_url, bio }
}
```

### Logout
```
POST /api/auth/logout
Headers: Authorization: Bearer {token}

Response:
{
  "success": true,
  "message": "Logged out"
}
```

---

## Session Endpoints

### Create Session
```
POST /api/sessions
Headers: Authorization: Bearer {token}

Request:
{
  "title": "React Basics",
  "description": "Learn React fundamentals",
  "topic": "Web Development",
  "scheduled_at": "2024-01-20T10:00:00Z",
  "duration_minutes": 60,
  "language": "javascript",
  "code_language": "javascript"
}

Response:
{
  "success": true,
  "data": { ...session }
}
```

### Get Session
```
GET /api/sessions/:id
Headers: Authorization: Bearer {token}

Response:
{
  "success": true,
  "data": { ...session }
}
```

### Join Session
```
POST /api/sessions/:id/join
Headers: Authorization: Bearer {token}

Response:
{
  "success": true,
  "data": { ...session with student_id }
}
```

### End Session
```
POST /api/sessions/:id/end
Headers: Authorization: Bearer {token}

Response:
{
  "success": true,
  "data": { ...session with status: "completed" }
}
```

### Get Active Sessions
```
GET /api/sessions/active
Headers: Authorization: Bearer {token}

Response:
{
  "success": true,
  "data": [ ...sessions ]
}
```

---

## User Endpoints

### Get User Profile
```
GET /api/users/:id

Response:
{
  "success": true,
  "data": { id, email, name, role, avatar_url, bio }
}
```

### Update Profile
```
PUT /api/users/profile
Headers: Authorization: Bearer {token}

Request:
{
  "name": "Jane Doe",
  "bio": "Full-stack developer",
  "avatar_url": "url"
}

Response:
{
  "success": true,
  "data": { ...updated_user }
}
```

### Get All Mentors
```
GET /api/users

Response:
{
  "success": true,
  "data": [ ...mentors ]
}
```

---

## Message Endpoints

### Get Session Messages
```
GET /api/messages/:sessionId
Headers: Authorization: Bearer {token}

Response:
{
  "success": true,
  "data": [ ...messages ]
}
```

### Send Message
```
POST /api/messages/:sessionId
Headers: Authorization: Bearer {token}

Request:
{
  "content": "Hello!",
  "type": "text", // | "code_snippet" | "system"
  "code_snippet": "optional code"
}

Response:
{
  "success": true,
  "data": { ...message }
}
```

---

## Code Endpoints

### Get Code Snapshot
```
GET /api/code/:sessionId
Headers: Authorization: Bearer {token}

Response:
{
  "success": true,
  "data": { id, code, language, version, saved_at }
}
```

### Save Code Snapshot
```
POST /api/code/:sessionId
Headers: Authorization: Bearer {token}

Request:
{
  "code": "console.log('hello');",
  "language": "javascript"
}

Response:
{
  "success": true,
  "data": { ...snapshot }
}
```

### Execute Code
```
POST /api/code/execute
Headers: Authorization: Bearer {token}

Request:
{
  "code": "console.log('hello');",
  "language": "javascript"
}

Response:
{
  "success": true,
  "data": {
    "output": "hello",
    "error": null
  }
}
```

---

## WebSocket Events

### Code Editor
```
Emit: code:update
{
  code: string,
  language: string,
  user_id: string
}

On: code:update
{
  code: string,
  language: string,
  userId: string,
  timestamp: number
}
```

### Cursor
```
Emit: cursor:move
{
  line: number,
  column: number,
  user_id: string
}

On: cursor:move
{
  line: number,
  column: number,
  userId: string,
  timestamp: number
}
```

### Messages
```
Emit: message:send
{
  content: string,
  type: 'text' | 'code_snippet'
}

On: message:receive
{
  id: string,
  sessionId: string,
  userId: string,
  content: string,
  type: string,
  created_at: string
}
```

### Video
```
Emit: video:initiate
{ initiator_id: string, receiver_id: string }

Emit: video:offer
{ offer: SDP }

Emit: video:answer
{ answer: SDP }

Emit: video:ice-candidate
{ candidate: string, sdpMLineIndex?: number }

On: video:incoming-call
{ initiatorId: string }

On: video:offer
{ offer: SDP }

On: video:answer
{ answer: SDP }

On: video:ice-candidate
{ candidate: string }
```

### Presence
```
Emit: presence:update
{ status: 'online' | 'away' | 'typing', user_id: string }

On: presence:updated
{ userId: string, status: string, timestamp: number }

On: presence:user-joined
{ userId: string, userName: string }

On: presence:user-left
{ userId: string }
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "Invalid request",
  "message": "Email and password required"
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Missing or invalid authorization header"
}
```

### 404 Not Found
```json
{
  "error": "Not Found",
  "path": "/api/sessions/invalid-id"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal Server Error",
  "message": "Something went wrong"
}
```

---

## Rate Limiting

- API Rate Limit: 100 requests per minute per IP
- WebSocket Messages: 10 per second per user
- File Upload: 10MB max

---

## Authentication

All protected endpoints require:
```
Authorization: Bearer {jwt_token}
```

Token is valid for 7 days. After expiration, user must login again.
