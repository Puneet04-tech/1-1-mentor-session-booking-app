import { Router, Request, Response } from 'express';
import { query } from '../database';
import { AuditService } from '../services/audit-service';

const router = Router();

// Middleware to check if user is session participant
const checkSessionAccess = async (req: Request, res: Response, next: any) => {
    try {
        const { sessionId } = req.params;
        const userId = (req as any).user.id;
        
        const result = await query(
            `SELECT mentor_id, student_id 
             FROM sessions 
             WHERE id = $1`,
            [sessionId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Session not found' });
        }
        
        const session = result.rows[0];
        if (session.mentor_id !== userId && session.student_id !== userId) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        
        next();
    } catch (error) {
        res.status(500).json({ error: 'Failed to verify access' });
    }
};

// GET /api/audit/:sessionId/verify
router.get('/:sessionId/verify', checkSessionAccess, async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const auditService = AuditService.getInstance();
        const verification = await auditService.verifyChain(sessionId);
        
        res.json({
            success: true,
            data: verification
        });
    } catch (error: any) {
        console.error('Error verifying audit chain:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/audit/:sessionId/logs
router.get('/:sessionId/logs', checkSessionAccess, async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const auditService = AuditService.getInstance();
        const logs = await auditService.getAuditLog(sessionId);
        
        res.json({
            success: true,
            data: logs
        });
    } catch (error: any) {
        console.error('Error fetching audit logs:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/audit/:sessionId/export
router.get('/:sessionId/export', checkSessionAccess, async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const auditService = AuditService.getInstance();
        const exportData = await auditService.exportAuditLog(sessionId);
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=audit_${sessionId}.json`);
        res.send(exportData);
    } catch (error: any) {
        console.error('Error exporting audit log:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/audit/:sessionId/stats
router.get('/:sessionId/stats', checkSessionAccess, async (req: Request, res: Response) => {
    try {
        const { sessionId } = req.params;
        const auditService = AuditService.getInstance();
        const stats = await auditService.getStats(sessionId);
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error: any) {
        console.error('Error fetching audit stats:', error);
        res.status(500).json({ error: error.message });
    }
});

export default router;