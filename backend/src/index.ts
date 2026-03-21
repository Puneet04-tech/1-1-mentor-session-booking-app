import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config';
import { healthCheck, query } from './database';
import authRoutes from './routes/auth';
import sessionRoutes, { setSocketIO as setSessionSocketIO } from './routes/sessions';
import userRoutes from './routes/users';
import messageRoutes from './routes/messages';
import codeRoutes, { setSocketIO as setCodeSocketIO } from './routes/code';
import profileRoutes from './routes/profile';
import ratingsRoutes from './routes/ratings';
import sessionHistoryRoutes from './routes/sessionHistory';
import notificationsRoutes from './routes/notifications';
import availabilityRoutes from './routes/availability';
import paymentRoutes from './routes/payments';
import recordingRoutes from './routes/recordings';
import adminRoutes from './routes/admin';
import { setupSocketHandlers } from './socket/handlers';
import { setupRealtimeHandlers } from './socket/realtimeHandlers';

const app: Express = express();
const httpServer = createServer(app);

// Socket.io setup
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: config.CLIENT_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Set Socket.io instance for routes that need it
setSessionSocketIO(io);
setCodeSocketIO(io);

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: config.CLIENT_URL,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Request logging
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/users', userRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/code', codeRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/ratings', ratingsRoutes);
app.use('/api/sessions/history', sessionHistoryRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/recordings', recordingRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/health', async (req: Request, res: Response) => {
  const dbHealthy = await healthCheck();
  res.status(dbHealthy ? 200 : 503).json({
    status: dbHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
  });
});

// Error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(config.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// Socket.io handlers
setupSocketHandlers(io);
setupRealtimeHandlers(io);

// Run migrations
async function runMigrations() {
  try {
    console.log('🔧 Running database migrations...');
    
    // Add video_link_token column for link-based video conferencing
    await query(`
      ALTER TABLE sessions 
      ADD COLUMN IF NOT EXISTS video_link_token VARCHAR(32) UNIQUE,
      ADD COLUMN IF NOT EXISTS video_link_expires_at TIMESTAMP WITH TIME ZONE;
    `);
    
    // Create index for quick lookup by link token
    await query(`
      CREATE INDEX IF NOT EXISTS idx_sessions_video_link_token ON sessions(video_link_token);
    `);
    
    console.log('✅ Database migrations completed successfully');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    // Don't throw - allow server to start even if migration fails (might be redundant)
    // This ensures backward compatibility when columns already exist
  }
}

// Start server
const PORT = config.PORT;
httpServer.listen(PORT, async () => {
  console.log(`🚀 Backend server running on port ${PORT}`);
  console.log(`Environment: ${config.NODE_ENV}`);
  console.log(`Client URL: ${config.CLIENT_URL}`);
  
  // Run migrations after server starts
  await runMigrations();
});

export { app, httpServer, io };
