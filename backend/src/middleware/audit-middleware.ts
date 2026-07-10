import { Request, Response, NextFunction } from 'express';
import { AuditService } from '../services/audit-service';

const auditService = AuditService.getInstance();

export function auditLog(eventType: string) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Store original send function
            const originalSend = res.send;
            
            // Override send to log after response
            res.send = function(data: any) {
                // Log the event
                const event = {
                    sessionId: req.params.id || req.params.sessionId || req.body.sessionId,
                    eventType,
                    eventData: {
                        method: req.method,
                        path: req.path,
                        query: req.query,
                        body: req.body,
                        responseStatus: res.statusCode,
                        responseData: data ? JSON.parse(JSON.stringify(data)) : null,
                        ip: req.ip,
                        userAgent: req.get('user-agent')
                    },
                    userId: (req as any).user?.id || 'system'
                };
                
                // Log asynchronously (don't block response)
                auditService.queueEvent(event).catch(console.error);
                
                // Call original send
                return originalSend.call(this, data);
            };
            
            next();
        } catch (error) {
            console.error('Audit middleware error:', error);
            next();
        }
    };
}

// Middleware to log session joins
export const logSessionJoin = auditLog('SESSION_JOIN');

// Middleware to log session leaves
export const logSessionLeave = auditLog('SESSION_LEAVE');

// Middleware to log code changes
export const logCodeChange = auditLog('CODE_CHANGE');

// Middleware to log chat messages
export const logChatMessage = auditLog('CHAT_MESSAGE');

// Middleware to log video events
export const logVideoEvent = auditLog('VIDEO_EVENT');