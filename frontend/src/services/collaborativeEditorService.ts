import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

/**
 * Collaborative Editor Service
 * Manages real-time code synchronization using CRDT (Yjs)
 */
class CollaborativeEditorService {
  private ydoc: Y.Doc | null = null;
  private yText: Y.Text | null = null;
  private provider: WebsocketProvider | null = null;
  private sessionId: string | null = null;
  private userId: string | null = null;

  /**
   * Initialize the collaborative editor for a session
   * @param sessionId - Room identifier
   * @param userId - Current user's ID for presence tracking
   * @param wsUrl - WebSocket server URL (e.g., ws://localhost:1234)
   */
  async initialize(sessionId: string, userId: string, wsUrl: string = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:1234') {
    try {
      console.log('🚀 [COLLAB] Initializing collaborative editor:', { sessionId, userId, wsUrl });

      // Create new Y.Doc for shared state
      this.ydoc = new Y.Doc();
      this.sessionId = sessionId;
      this.userId = userId;

      // Create text type for code content
      this.yText = this.ydoc.getText('monaco');
      console.log('✅ [COLLAB] Y.Doc and Y.Text created');

      // Create WebSocket provider
      this.provider = new WebsocketProvider(
        wsUrl,
        `session:${sessionId}`, // Room name
        this.ydoc
      );

      // Set user awareness (for presence + cursor tracking)
      this.provider.awareness?.setLocalState({
        user: {
          name: userId,
          id: userId,
          color: this.generateUserColor(userId),
        },
      });

      console.log('✅ [COLLAB] WebSocket provider connected:', `session:${sessionId}`);

      // Listen to provider events
      this.provider.on('connection-error', (error: Error) => {
        console.error('❌ [COLLAB] Provider connection error:', error);
      });

      this.provider.on('connection-close', () => {
        console.warn('⚠️ [COLLAB] Provider connection closed');
      });

      this.provider.on('sync', (isSynced: boolean) => {
        console.log('🔄 [COLLAB] Sync state changed:', isSynced);
        if (isSynced) {
          console.log('✅ [COLLAB] Initial sync complete');
          // Optional: Initialize state or fetch existing code
        }
      });

      return this;
    } catch (error) {
      console.error('❌ [COLLAB] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Get the shared text (Y.Text) for Monaco binding
   */
  getSharedText(): Y.Text | null {
    return this.yText;
  }

  /**
   * Get the Y.Doc
   */
  getYDoc(): Y.Doc | null {
    return this.ydoc;
  }

  /**
   * Get the WebSocket provider
   */
  getProvider(): WebsocketProvider | null {
    return this.provider;
  }

  /**
   * Set user presence (name, color, cursor position)
   */
  setUserPresence(presence: {
    name?: string;
    color?: string;
    line?: number;
    column?: number;
  }) {
    if (this.provider?.awareness) {
      const currentState = this.provider.awareness.getLocalState() || {};
      this.provider.awareness.setLocalState({
        ...currentState,
        user: {
          ...currentState.user,
          ...presence,
          id: this.userId,
        },
      });
      console.log('✅ [COLLAB] User presence updated:', presence);
    }
  }

  /**
   * Observe changes to code (for logging/debugging)
   */
  observeTextChanges(callback: (event: Y.YTextEvent) => void) {
    if (this.yText) {
      this.yText.observe(callback);
      console.log('✅ [COLLAB] Text observer registered');
    }
  }

  /**
   * Get current code content
   */
  getCurrentCode(): string {
    if (this.yText) {
      return this.yText.toString();
    }
    return '';
  }

  /**
   * Set initial code (only if empty)
   */
  initializeCode(code: string) {
    if (this.yText && this.yText.length === 0) {
      this.yText.insert(0, code);
      console.log('✅ [COLLAB] Initial code set');
    }
  }

  /**
   * Cleanup and disconnect
   */
  destroy() {
    try {
      if (this.provider) {
        this.provider.disconnect();
        console.log('✅ [COLLAB] Provider disconnected');
      }
      if (this.ydoc) {
        this.ydoc.destroy();
        console.log('✅ [COLLAB] Y.Doc destroyed');
      }
    } catch (error) {
      console.error('❌ [COLLAB] Error during cleanup:', error);
    }
    this.yText = null;
    this.ydoc = null;
    this.provider = null;
  }

  /**
   * Generate consistent user color from ID
   */
  private generateUserColor(userId: string): string {
    const colors = [
      '#FF6B6B', // Red
      '#4ECDC4', // Teal
      '#45B7D1', // Blue
      '#FFA07A', // Light Salmon
      '#98D8C8', // Mint
      '#F7DC6F', // Yellow
      '#BB8FCE', // Purple
      '#85C1E2', // Sky Blue
    ];

    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = userId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % colors.length;
    return colors[index];
  }

  /**
   * Get awareness (for other users' presence)
   */
  getRemoteAwareness() {
    if (this.provider?.awareness) {
      const states = this.provider.awareness.getStates();
      const remoteUsers: any[] = [];

      states.forEach((state, clientId) => {
        if (clientId !== this.provider?.awareness?.clientID) {
          remoteUsers.push(state);
        }
      });

      return remoteUsers;
    }
    return [];
  }

  /**
   * Listen to remote user presence changes
   */
  observeRemoteAwareness(callback: (remoteUsers: any[]) => void) {
    if (this.provider?.awareness) {
      const handleAwarenessChange = () => {
        callback(this.getRemoteAwareness());
      };

      this.provider.awareness.on('change', handleAwarenessChange);
      console.log('✅ [COLLAB] Remote awareness observer registered');

      // Return unsubscribe function
      return () => {
        this.provider?.awareness?.off('change', handleAwarenessChange);
      };
    }
  }
}

// Singleton instance
let instance: CollaborativeEditorService | null = null;

export function getCollaborativeEditorService(): CollaborativeEditorService {
  if (!instance) {
    instance = new CollaborativeEditorService();
  }
  return instance;
}

export function createNewCollaborativeEditorService(): CollaborativeEditorService {
  return new CollaborativeEditorService();
}

export default CollaborativeEditorService;
