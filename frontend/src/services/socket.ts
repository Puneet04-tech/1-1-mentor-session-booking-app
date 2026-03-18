import { io, Socket } from 'socket.io-client';
import { SocketEvents } from '@/types';
import { useAuthStore } from '@/store';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

class SocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Function[]> = new Map();
  private currentSessionId: string | null = null;

  connect(token: string): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    this.socket = io(SOCKET_URL, {
      auth: {
        token,
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket?.id);
      this.emit('connected');
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
      this.emit('disconnected');
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
      this.emit('error', error);
    });

    return this.socket;
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

  on<K extends keyof SocketEvents>(event: K, callback: (data: SocketEvents[K]) => void) {
    if (!this.socket) {
      console.warn(`Socket not initialized for event: ${event}`);
      return;
    }
    
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    
    this.listeners.get(event)!.push(callback);
    this.socket.on(event as string, callback);
  }

  off<K extends keyof SocketEvents>(event: K, callback: (data: SocketEvents[K]) => void) {
    if (!this.socket) return;
    this.socket.off(event as string, callback);
  }

  emit<K extends keyof SocketEvents>(event: K, data?: SocketEvents[K]) {
    if (!this.socket?.connected) {
      console.warn(`Socket not connected for event: ${event}`);
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
    const user = useAuthStore.getState().user;
    this.emit('message:send', { 
      content, 
      sessionId: this.currentSessionId,
      userId: user?.id,
      type: 'text'
    } as any);
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
}

export const socketService = new SocketService();
