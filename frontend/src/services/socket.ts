import { io, Socket } from 'socket.io-client';
import { SocketEvents } from '@/types';
import { useAuthStore } from '@/store';

const rawSocketUrl = process.env.NEXT_PUBLIC_SOCKET_URL;
const apiUrl = process.env.NEXT_PUBLIC_API_URL;

const SOCKET_URL = rawSocketUrl
  ? rawSocketUrl.replace(/\/?$/, '')
  : apiUrl
  ? apiUrl.replace(/\/api\/?$/, '')
  : 'http://localhost:5000';

class SocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Function[]> = new Map();
  private currentSessionId: string | null = null;
  private connectionPromise: Promise<void> | null = null;
  private resolveConnection: (() => void) | null = null;

  connect(token: string): Promise<Socket> {
    if (this.socket?.connected) {
      console.log('Socket already connected:', this.socket.id);
      return Promise.resolve(this.socket);
    }

    if (this.connectionPromise) {
      console.log('🔌 Socket connection in progress, waiting...');
      return this.connectionPromise.then(() => this.socket as Socket);
    }

    // Create a promise for connection
    this.connectionPromise = new Promise((resolve) => {
      this.resolveConnection = () => {
        console.log('✅ Connection promise resolved');
        resolve();
      };
    });

    console.log('🔌 Connecting to socket at:', SOCKET_URL);
    this.socket = io(SOCKET_URL, {
      path: '/socket.io',
      transports: ['websocket'],
      upgrade: true,
      rememberUpgrade: true,
      withCredentials: true,
      auth: {
        token,
      },
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      reconnectionAttempts: 10,
    });

    this.socket.on('connect', () => {
      console.log('✅ Socket connected:', this.socket?.id);
      if (this.resolveConnection) {
        this.resolveConnection();
      }
      this.emit('connected');
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Socket disconnected');
      this.connectionPromise = null;
      this.resolveConnection = null;
      this.emit('disconnected');
    });

    this.socket.on('error', (error) => {
      console.error('❌ Socket error:', error);
      this.emit('error', error);
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ Socket connect_error:', error);
    });

    // Debug: Log all incoming events
    this.socket.onAny((eventName, ...args) => {
      console.log('🔔 Socket received event:', eventName, args);
    });

    // Screen share events
    this.socket.on('screen:started', (data) => {
      console.log('🖥️ Screen share started event received:', data);
      this.emit('screen:started', data);
    });

    this.socket.on('screen:stopped', (data) => {
      console.log('🛑 Screen share stopped event received:', data);
      this.emit('screen:stopped', data);
    });

    return this.connectionPromise.then(() => this.socket as Socket);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  async waitForConnection(timeoutMs: number = 10000): Promise<void> {
    if (this.socket?.connected) {
      return Promise.resolve();
    }

    if (!this.connectionPromise) {
      return Promise.reject(new Error('Socket not initialized'));
    }

    return Promise.race([
      this.connectionPromise,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Socket connection timeout')), timeoutMs)
      ),
    ]);
  }

  on<K extends keyof SocketEvents>(event: K, callback: (data: SocketEvents[K]) => void) {
    if (!this.socket) {
      console.warn(`Socket not initialized for event: ${event}`);
      return;
    }
    
    console.log(`🎧 Registering listener for event: ${event}`);
    
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    
    this.listeners.get(event)!.push(callback);
    this.socket.on(event as string, callback);
  }

  off<K extends keyof SocketEvents>(event: K, callback?: (data: SocketEvents[K]) => void) {
    if (!this.socket) return;
    
    if (callback) {
      this.socket.off(event as string, callback);
      const listeners = this.listeners.get(event);
      if (listeners) {
        const index = listeners.indexOf(callback);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    } else {
      // Remove all listeners for this event
      this.socket.off(event as string);
      this.listeners.delete(event);
    }
  }

  offAll<K extends keyof SocketEvents>(event: K) {
    if (!this.socket) return;
    this.socket.off(event as string);
    this.listeners.delete(event);
  }

  emit<K extends keyof SocketEvents>(event: K, data?: SocketEvents[K]) {
    if (!this.socket) {
      console.warn(`Socket not initialized for event: ${event}`);
      return;
    }
    
    if (!this.socket.connected) {
      console.warn(`Socket not connected yet for event: ${event}, queuing...`);
      // Wait briefly for connection
      if (this.connectionPromise) {
        this.connectionPromise.then(() => {
          if (this.socket?.connected) {
            console.log(`📤 Emitting queued event: ${event}`);
            this.socket!.emit(event as string, data);
          }
        });
      }
      return;
    }
    
    this.socket.emit(event as string, data);
  }

  // Session management
  joinSession(sessionId: string) {
    this.currentSessionId = sessionId;
    const user = useAuthStore.getState().user;
    this.emit('session:join', { sessionId, userId: user?.id, userName: user?.name } as any);
  }

  leaveSession(sessionId: string) {
    const user = useAuthStore.getState().user;
    this.emit('session:leave', { sessionId, userId: user?.id } as any);
    this.currentSessionId = null;
  }

  endSession(sessionId: string) {
    this.emit('session:end', { sessionId } as any);
  }

  // Chat
  sendMessage(content: string) {
    console.log('📤 SocketService.sendMessage called:', content);
    const user = useAuthStore.getState().user;
    const data = { 
      content, 
      sessionId: this.currentSessionId,
      userId: user?.id,
      type: 'text'
    };
    console.log('📡 Emitting message:send event:', data);
    this.emit('message:send', data as any);
  }

  // Code Editor
  sendCode(code: string, language: string, sessionId?: string) {
    const user = useAuthStore.getState().user;
    this.emit('code:update', { 
      code, 
      language, 
      sessionId: sessionId || this.currentSessionId,
      userId: user?.id 
    } as any);
  }

  moveCursor(line: number, column: number) {
    const user = useAuthStore.getState().user;
    this.emit('cursor:move', { 
      line, 
      column, 
      sessionId: this.currentSessionId,
      userId: user?.id
    } as any);
  }

  // Video
  toggleCamera() {
    const user = useAuthStore.getState().user;
    this.emit('video:toggle-camera', { userId: user?.id } as any);
  }

  toggleMic() {
    const user = useAuthStore.getState().user;
    this.emit('video:toggle-mic', { userId: user?.id } as any);
  }

  sendVideoOffer(offer: any) {
    this.emit('video:offer', { offer } as any);
  }

  sendVideoAnswer(answer: any) {
    this.emit('video:answer', { answer } as any);
  }

  sendICECandidate(candidate: any) {
    this.emit('video:ice-candidate', candidate as any);
  }

  // Screen Share
  startScreenShare() {
    const user = useAuthStore.getState().user;
    const data = { userId: user?.id, sessionId: this.currentSessionId } as any;
    console.log('📡 SocketService.startScreenShare emitting:', data);
    this.emit('screen:started', data);
  }

  stopScreenShare() {
    const user = useAuthStore.getState().user;
    this.emit('screen:stopped', { userId: user?.id, sessionId: this.currentSessionId } as any);
  }
}

export const socketService = new SocketService();
