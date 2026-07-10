import * as crypto from 'crypto';
import { query } from '../database';

export interface AuditEvent {
    sessionId: string;
    eventType: string;
    eventData: any;
    userId?: string;
    timestamp?: Date;
}

export interface AuditLogEntry {
    id: string;
    sessionId: string;
    eventType: string;
    eventData: any;
    previousHash: string;
    currentHash: string;
    createdAt: Date;
}

export class AuditService {
    private static instance: AuditService;
    private eventQueue: AuditEvent[] = [];
    private isProcessing: boolean = false;

    private constructor() {}

    static getInstance(): AuditService {
        if (!AuditService.instance) {
            AuditService.instance = new AuditService();
        }
        return AuditService.instance;
    }

    /**
     * Log an event with hash chaining
     */
    async logEvent(event: AuditEvent): Promise<AuditLogEntry> {
        const startTime = Date.now();
        
        try {
            // Get the last event's hash for this session
            const lastHash = await this.getLastHash(event.sessionId);
            
            // Generate hash for this event
            const currentHash = this.generateHash(lastHash, event);
            
            // Insert into database
            const result = await query(
                `INSERT INTO session_audit_logs (
                    session_id,
                    event_type,
                    event_data,
                    previous_hash,
                    current_hash,
                    created_at
                ) VALUES ($1, $2, $3, $4, $5, NOW())
                RETURNING *`,
                [
                    event.sessionId,
                    event.eventType,
                    JSON.stringify({
                        ...event.eventData,
                        userId: event.userId,
                        timestamp: event.timestamp || new Date()
                    }),
                    lastHash,
                    currentHash
                ]
            );
            
            const entry = result.rows[0];
            const endTime = Date.now();
            const latency = endTime - startTime;
            
            if (latency > 10) {
                console.warn(`⚠️ Audit log latency: ${latency}ms (threshold: 10ms)`);
            }
            
            return {
                id: entry.id,
                sessionId: entry.session_id,
                eventType: entry.event_type,
                eventData: entry.event_data,
                previousHash: entry.previous_hash,
                currentHash: entry.current_hash,
                createdAt: entry.created_at
            };
        } catch (error) {
            console.error('Failed to log audit event:', error);
            throw error;
        }
    }

    /**
     * Get last hash for a session
     */
    private async getLastHash(sessionId: string): Promise<string> {
        const result = await query(
            `SELECT current_hash 
             FROM session_audit_logs 
             WHERE session_id = $1 
             ORDER BY created_at DESC 
             LIMIT 1`,
            [sessionId]
        );
        
        return result.rows.length > 0 ? result.rows[0].current_hash : '0';
    }

    /**
     * Generate SHA-256 hash
     */
    private generateHash(previousHash: string, event: AuditEvent): string {
        const payload = `${previousHash}|${JSON.stringify(event.eventData)}|${event.userId || 'system'}|${Date.now()}`;
        return crypto.createHash('sha256').update(payload).digest('hex');
    }

    /**
     * Verify audit chain integrity
     */
    async verifyChain(sessionId: string): Promise<{
        isValid: boolean;
        tamperedEvents: string[];
        totalEvents: number;
        chainLength: number;
    }> {
        const result = await query(
            `SELECT 
                id,
                event_type,
                event_data,
                previous_hash,
                current_hash,
                created_at
             FROM session_audit_logs
             WHERE session_id = $1
             ORDER BY created_at ASC`,
            [sessionId]
        );
        
        if (result.rows.length === 0) {
            return {
                isValid: true,
                tamperedEvents: [],
                totalEvents: 0,
                chainLength: 0
            };
        }
        
        let previousHash = '0';
        const tamperedEvents: string[] = [];
        
        for (const row of result.rows) {
            // Check if previous_hash matches
            if (row.previous_hash !== previousHash) {
                tamperedEvents.push(row.id);
            }
            
            // Verify current_hash
            const expectedHash = this.generateHash(
                previousHash,
                {
                    sessionId: row.session_id,
                    eventType: row.event_type,
                    eventData: row.event_data,
                    userId: row.event_data?.userId,
                    timestamp: row.created_at
                }
            );
            
            if (row.current_hash !== expectedHash) {
                tamperedEvents.push(row.id);
            }
            
            previousHash = row.current_hash;
        }
        
        return {
            isValid: tamperedEvents.length === 0,
            tamperedEvents,
            totalEvents: result.rows.length,
            chainLength: result.rows.length
        };
    }

    /**
     * Get audit log for a session
     */
    async getAuditLog(sessionId: string): Promise<AuditLogEntry[]> {
        const result = await query(
            `SELECT 
                id,
                session_id,
                event_type,
                event_data,
                previous_hash,
                current_hash,
                created_at
             FROM session_audit_logs
             WHERE session_id = $1
             ORDER BY created_at ASC`,
            [sessionId]
        );
        
        return result.rows.map((row: any) => ({
            id: row.id,
            sessionId: row.session_id,
            eventType: row.event_type,
            eventData: row.event_data,
            previousHash: row.previous_hash,
            currentHash: row.current_hash,
            createdAt: row.created_at
        }));
    }

    /**
     * Export audit log as JSON for dispute resolution
     */
    async exportAuditLog(sessionId: string): Promise<string> {
        const logs = await this.getAuditLog(sessionId);
        const verification = await this.verifyChain(sessionId);
        
        const exportData = {
            sessionId,
            exportedAt: new Date().toISOString(),
            verification,
            logs,
            hash: this.generateHash('0', {
                sessionId,
                eventType: 'EXPORT',
                eventData: { exportedAt: new Date().toISOString() }
            })
        };
        
        return JSON.stringify(exportData, null, 2);
    }

    /**
     * Get statistics for a session
     */
    async getStats(sessionId: string): Promise<any> {
        const result = await query(
            `SELECT 
                COUNT(*) as total_events,
                COUNT(DISTINCT event_type) as unique_event_types,
                MIN(created_at) as first_event,
                MAX(created_at) as last_event,
                array_agg(DISTINCT event_type) as event_types
             FROM session_audit_logs
             WHERE session_id = $1`,
            [sessionId]
        );
        
        return result.rows[0];
    }

    /**
     * Queue event for async processing (for high-volume events)
     */
    async queueEvent(event: AuditEvent): Promise<void> {
        this.eventQueue.push(event);
        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    private async processQueue(): Promise<void> {
        if (this.isProcessing) return;
        this.isProcessing = true;
        
        while (this.eventQueue.length > 0) {
            const event = this.eventQueue.shift();
            if (event) {
                try {
                    await this.logEvent(event);
                } catch (error) {
                    console.error('Failed to process queued audit event:', error);
                }
            }
        }
        
        this.isProcessing = false;
    }
}

export default AuditService.getInstance();