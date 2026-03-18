# Deployment Guide

## Frontend Deployment (Netlify)

### 1. Connect Repository
- Push code to GitHub
- Go to [Netlify](https://netlify.com)
- Click "New site from Git"
- Select your repository

### 2. Build Settings
```
Build command: npm run build
Publish directory: .next
```

### 3. Environment Variables
Set in Netlify dashboard:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_key
NEXT_PUBLIC_API_URL=your_render_backend_url
NEXT_PUBLIC_SOCKET_URL=your_render_backend_url
```

### 4. Deploy
Click "Deploy site" and wait for build to complete

---

## Backend Deployment (Render)

### 1. Create New Service
- Go to [Render](https://render.com)
- Click "New +"
- Select "Web Service"
- Connect GitHub repository

### 2. Configure Service
```
Name: mentor-backend
Runtime: Node
Build Command: npm install && npm run build
Start Command: npm start
```

### 3. Environment Variables
Add to dashboard:
```
DATABASE_URL=your_neon_database_url
SUPABASE_URL=your_supabase_url
SUPABASE_API_KEY=your_supabase_api_key
SUPABASE_JWT_SECRET=your_jwt_secret
JWT_SECRET=your_secret_key
CLIENT_URL=your_netlify_frontend_url
NODE_ENV=production
PORT=5000
```

### 4. Deploy
Push changes to trigger automatic deployment

---

## Database Setup (Neon)

### 1. Create Project
- Go to [Neon](https://neon.tech)
- Create new project
- Get connection string

### 2. Run Migrations
```bash
DATABASE_URL=your_connection_string npm run migrate
DATABASE_URL=your_connection_string npm run seed
```

---

## Post-Deployment Checklist

- [ ] Test login/signup
- [ ] Test session creation
- [ ] Test real-time code sync
- [ ] Test video call
- [ ] Test chat
- [ ] Test code execution
- [ ] Verify database backups
- [ ] Setup error monitoring (Sentry)
- [ ] Setup analytics

---

## Troubleshooting

### WebSocket Connection Issues
- Ensure CORS is properly configured
- Check Socket.io version compatibility
- Verify NEXT_PUBLIC_SOCKET_URL environment variable

### Database Connection Errors
- Verify DATABASE_URL format
- Check IP whitelist on Neon
- Test connection with psql

### Build Failures
- Check Node version compatibility
- Clear node_modules and reinstall
- Check for TypeScript errors

---

## Monitoring & Logs

### Netlify
- Built-in analytics and logs
- Function logs available in dashboard

### Render
- View logs in dashboard
- Enable "Auto-Redeploy" for automatic updates

### Neon
- Query insights available
- Monitor connections and usage
