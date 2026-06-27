<div align="center">

  # 🚀 1-on-1 Mentor-Student Collaboration Platform
  
  ### A real-time web application for mentors and students to collaborate with video calls, **collaborative code editing with CRDT**, and instant messaging.

</div>

----

## 🎯 Project Features

### ✅ Core Features 
- **🛡️ Authentication & Authorization**: Supabase-based auth with Mentor/Student roles
- **🔗 Session Management**: Create, join, and manage 1-on-1 sessions.
- **🆕 Collaborative Code Editor**: Real-time code sync using Yjs CRDT (NO CONFLICTS!)
  - Multiple users can edit simultaneously
  - Automatic conflict resolution
  - Cursor tracking with user presence
  - Offline support (changes sync on reconnect)
- **📹 Video Conferencing**: WebRTC-based 1-on-1 video calls
- **🖥️ Screen Sharing**: Share your screen during sessions
- **💬 Instant Messaging**: Socket.io powered session-based chat
- **</> Code Execution**: Run code in a sandboxed environment
- **👥 User Presence**: See who's online and active


### ✨ What Makes Collaborative Editor Special

| Feature | Benefit |
|---------|---------|
| **CRDT (Yjs)** | Automatic conflict resolution - no manual merges needed |
| **Character-level ops** | Only sends changed characters (bandwidth efficient) |
| **Offline support** | Changes queue locally, sync when reconnected |
| **Cursor tracking** | See exactly where collaborators are editing |
| **Instant sync** | ~50-100ms updates, feels like Google Docs |
| **Scalable** | Works with any number of simultaneous editors |

----

## Tech Stack

### **Frontend**
- ![Next.js](https://img.shields.io/badge/Next.js-000000?style=flat-square&logo=nextdotjs&logoColor=white) Next.js 14+ with TypeScript
- ![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black) React 18+
- ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white) Tailwind CSS with custom theme
- ![Monaco Editor](https://img.shields.io/badge/Monaco_Editor-007ACC?style=flat-square&logo=visualstudiocode&logoColor=white) Monaco Editor (VS Code)
- ![Yjs](https://img.shields.io/badge/Yjs-FFCC00?style=flat-square&logo=javascript&logoColor=black) Yjs + y-monaco for CRDT collaboration
- ![WebSockets](https://img.shields.io/badge/y--websocket-010101?style=flat-square&logo=websocket&logoColor=white) y-websocket for real-time sync
- ![shadcn/ui](https://img.shields.io/badge/shadcn/ui-000000?style=flat-square&logo=shadcnui&logoColor=white) shadcn/ui components
- ![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=flat-square&logo=socketdotio&logoColor=white) Socket.io client
- ![WebRTC](https://img.shields.io/badge/WebRTC-333333?style=flat-square&logo=webrtc&logoColor=white) WebRTC for video

### **Backend**
- ![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white) ![Express.js](https://img.shields.io/badge/Express.js-000000?style=flat-square&logo=express&logoColor=white) Node.js + Express.js
- Y-WebSocket Server: ![WebSockets](https://img.shields.io/badge/Y--WebSocket_Server-010101?style=flat-square&logo=websocket&logoColor=white) for CRDT synchronization
- ![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=flat-square&logo=socketdotio&logoColor=white) for real-time sync
- ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=black) PostgreSQL
- ![Neon](https://img.shields.io/badge/Neon-00E599?style=flat-square&logo=neon&logoColor=black) Neon
- ![Supabase](https://img.shields.io/badge/Supabase_Auth-3ECF8E?style=flat-square&logo=supabase&logoColor=black) Supabase Auth
- ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white) TypeScript

### **Infrastructure**
- **Database:** ![PostgreSQL](https://img.shields.io/badge/PostgreSQL_on_Neon-00E599?style=flat-square&logo=neon&logoColor=black) PostgreSQL on Neon
- **Frontend:** ![Netlify](https://img.shields.io/badge/Netlify-00C7B7?style=flat-square&logo=netlify&logoColor=black) Netlify
- **Backend:** ![Render](https://img.shields.io/badge/Render-46E3B7?style=flat-square&logo=render&logoColor=black) Render
- **Collaborative Editor Server:** ![WebSockets](https://img.shields.io/badge/Server-Collaborative_Editor-FFCC00?style=flat-square&logo=websocket&logoColor=black) Separate WebSocket for CRDT (port 1234)

----

## 📁 Project Structure

```
1-1-mentor-session-booking-app/
├── frontend/              # Next.js application
├── backend/               # Express.js server
├── database/              # Schema & migrations
├── docs/                  # Architecture & docs
│   ├── COLLAB_EDITOR_SETUP.md    # 📖 Comprehensive setup guide
│   ├── COLLAB_QUICK_START.md     # ⚡ Quick reference
│   └── ARCHITECTURE.md           # System architecture
└── README.md
```

----

## 🚀 How to Run

### Prerequisites
- Node.js 16+ & npm/yarn
- PostgreSQL/Neon account
- Supabase account

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Visit `http://localhost:3000`

### Backend Setup
```bash
cd backend
npm install
npm run dev
```
Backend runs on `http://localhost:5000`

### 🗄️ Database

Initialize PostgreSQL database:
```bash
cd database
npm run migrate
npm run seed
```

----

## 📋 API Endpoints

### Auth
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

### Sessions
- `POST /api/sessions` - Create session (Mentor only)
- `GET /api/sessions/:id` - Get session details
- `POST /api/sessions/:id/join` - Join session
- `POST /api/sessions/:id/end` - End session
- `GET /api/sessions/active` - Get active sessions

### Users
- `GET /api/users/mentors` - List all mentors
- `GET /api/users/profile/:id` - Get user profile
- `PUT /api/users/profile` - Update profile

----

## 🔌 WebSocket Events

### Code Editor
- `code:update` - Code content changed
- `cursor:move` - User cursor moved
- `language:change` - Language selection changed

### Chat
- `message:send` - Send message
- `message:receive` - Receive message

### Video
- `offer:send` - WebRTC offer
- `answer:send` - WebRTC answer
- `ice:candidate` - ICE candidate

----

## 🎨 Theme

Purple, Green, and Yellow glowing theme with modern glassmorphism effects.

```css
Primary: #8B5CF6 (Purple)
Secondary: #22C55E (Green)
Accent: #EAB308 (Yellow)
```

----

## 📦 Deployment

### Frontend (Netlify)
```bash
npm run build
```
Connect to Netlify CI/CD

### Backend (Render)
```bash
npm run build
```
Connect to Render with environment variables

----

## 🔐 Environment Variables

Create `.env.local` for frontend and `.env` for backend.

See `docs/ENVIRONMENT.md` for details.

----

## 📚 Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Database Schema](docs/DATABASE.md)
- [API Reference](docs/API.md)
- [WebSocket Events](docs/WEBSOCKET.md)
- [Deployment Guide](docs/DEPLOYMENT.md)

----

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md)

----

## 📝 License

This project is under the MIT License, and is free for users to modify, distribute, and sell, provided they include the original copyright and license notice.
See the license [here.](docs/LICENSE.md)

----

## 🎥 Demo

[Live Demo Link]

----

## 👨‍💼 Resume Description

Built a real-time 1-on-1 mentorship platform with authentication, session management, live collaborative code editing using Socket.io, integrated messaging, WebRTC video calling, and screen sharing. Deployed on Netlify (frontend) and Render (backend) with PostgreSQL on Neon.

----

**Built with ❤️ for mentors and students worldwide**
