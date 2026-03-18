import { io, Socket } from 'socket.io-client';
import { SocketEvents } from '@/types';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

class SocketService {
  private socket: Socket | null = null;
  private listeners: Map<string, Function[]> = new Map();

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

  on<K extends keyof SocketEvents>(event: K, callback: (data: SocketEvents[K]) => void) {
    if (!this.socket) return;
    
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
    if (!this.socket) {
      console.warn('Socket not connected');
      return;
    }
    this.socket.emit(event as string, data);
  }

  joinSession(sessionId: string) {
    this.emit('session:join', { sessionId } as any);
  }

  leaveSession(sessionId: string) {
    this.emit('session:leave', { sessionId } as any);
  }

  sendCode(code: string, language: string, userId: string) {
    this.emit('code:update', { code, language, user_id: userId });
  }

  sendMessage(content: string, type: string = 'text') {
    this.emit('message:send', { content, type } as any);
  }

  moveCursor(line: number, column: number, userId: string) {
    this.emit('cursor:move', { line, column, user_id: userId });
  }

  initiateVideoCall(initiatorId: string) {
    this.emit('video:initiate', { initiator_id: initiatorId });
  }

  acceptVideoCall(acceptorId: string) {
    this.emit('video:accept', { acceptor_id: acceptorId });
  }

  declineVideoCall(reason?: string) {
    this.emit('video:decline', { reason } as any);
  }

  sendVideoOffer(offer: any) {
    this.emit('video:offer', { offer });
  }

  sendVideoAnswer(answer: any) {
    this.emit('video:answer', { answer });
  }

  sendICECandidate(candidate: any) {
    this.emit('video:ice-candidate', candidate);
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

export const socketService = new SocketService();
