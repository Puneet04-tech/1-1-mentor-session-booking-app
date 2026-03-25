/**
 * WebRTC Diagnostics - Comprehensive debugging for video streaming issues
 * Tracks: peer connections, tracks, ICE candidates, state transitions
 */

export interface DiagnosticEvent {
  timestamp: number;
  type: string;
  message: string;
  data: any;
}

class WebRTCDiagnostics {
  private events: DiagnosticEvent[] = [];
  private maxEvents = 500; // Keep last 500 events
  private originalConsoleLog: typeof console.log | null = null;

  constructor() {
    console.log('🔧 WebRTC Diagnostics initialized');
  }

  /**
   * Log a diagnostic event
   */
  log(type: string, message: string, data: any = {}) {
    const event: DiagnosticEvent = {
      timestamp: Date.now(),
      type,
      message,
      data: {
        ...data,
        timestamp: new Date().toLocaleTimeString(),
      },
    };

    this.events.push(event);

    // Keep only last 500 events
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    // Log to console with emoji for easy filtering
    const emoji = this.getEmoji(type);
    console.log(`${emoji} [${type.toUpperCase()}] ${message}`, data);
  }

  private getEmoji(type: string): string {
    const emojis: { [key: string]: string } = {
      'peer-connection': '🔗',
      'track-add': '📹',
      'track-receive': '📥',
      'stream-set': '💾',
      'callback-fire': '🎯',
      'ice-candidate': '❄️',
      'offer-answer': '📤',
      'error': '❌',
      'state-change': '📊',
    };
    return emojis[type] || '📝';
  }

  /**
   * Get all events
   */
  getEvents(): DiagnosticEvent[] {
    return [...this.events];
  }

  /**
   * Get events by type
   */
  getEventsByType(type: string): DiagnosticEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  /**
   * Clear all events
   */
  clear() {
    this.events = [];
    console.log('🧹 Diagnostics cleared');
  }

  /**
   * Export diagnostics as JSON string for sharing
   */
  export(): string {
    return JSON.stringify(
      {
        exportTime: new Date().toISOString(),
        eventCount: this.events.length,
        events: this.events,
      },
      null,
      2
    );
  }

  /**
   * Print summary to console
   */
  printSummary() {
    console.log('\n=== WebRTC DIAGNOSTICS SUMMARY ===\n');

    const byType = new Map<string, number>();
    for (const event of this.events) {
      byType.set(event.type, (byType.get(event.type) || 0) + 1);
    }

    console.log('📊 Events by type:');
    for (const [type, count] of byType) {
      console.log(`  ${type}: ${count}`);
    }

    console.log('\n📋 Recent 10 events:');
    const recent = this.events.slice(-10);
    recent.forEach((e, idx) => {
      console.log(
        `  ${idx + 1}. [${e.type}] ${e.message} at ${e.data.timestamp}`
      );
    });

    console.log('\n=== END SUMMARY ===\n');
  }
}

export const webrtcDiagnostics = new WebRTCDiagnostics();
