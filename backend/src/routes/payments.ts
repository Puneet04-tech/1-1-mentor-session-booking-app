import express, { Request, Response } from 'express';
import { db } from '../database';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';

// Initialize Stripe (you'll need to install stripe package)
// import Stripe from 'stripe';
// const stripe = new Stripe(STRIPE_SECRET_KEY);

// Create payment intent for session
router.post('/create-payment-intent', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { sessionId, amount } = req.body;
    const userId = (req as any).user.id;

    // Validate session belongs to user
    const sessionResult = await db.query(
      `SELECT * FROM sessions WHERE id = $1 AND (mentor_id = $2 OR student_id = $2)`,
      [sessionId, userId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Create payment record
    const paymentResult = await db.query(
      `INSERT INTO payments (session_id, user_id, amount, status, created_at)
       VALUES ($1, $2, $3, 'pending', NOW())
       RETURNING id`,
      [sessionId, userId, amount]
    );

    // In production, create actual Stripe payment intent here
    // const paymentIntent = await stripe.paymentIntents.create({
    //   amount: amount * 100, // Amount in cents
    //   currency: 'usd',
    //   metadata: {
    //     sessionId,
    //     userId,
    //   },
    // });

    res.json({
      success: true,
      paymentId: paymentResult.rows[0].id,
      clientSecret: 'test_secret_' + paymentResult.rows[0].id, // Mock for now
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});

// Confirm payment
router.post('/confirm', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { paymentId } = req.body;
    const userId = (req as any).user.id;

    // Update payment status
    const result = await db.query(
      `UPDATE payments SET status = 'completed', updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [paymentId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Update session status to 'confirmed'
    await db.query(
      `UPDATE sessions SET status = 'confirmed' 
       WHERE id = $1`,
      [result.rows[0].session_id]
    );

    res.json({
      success: true,
      message: 'Payment confirmed',
      payment: result.rows[0],
    });
  } catch (error) {
    console.error('Error confirming payment:', error);
    res.status(500).json({ error: 'Failed to confirm payment' });
  }
});

// Get payment history
router.get('/history', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const result = await db.query(
      `SELECT p.*, s.title as session_title
       FROM payments p
       JOIN sessions s ON p.session_id = s.id
       WHERE p.user_id = $1
       ORDER BY p.created_at DESC`,
      [userId]
    );

    res.json({
      success: true,
      payments: result.rows,
    });
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

// Get earnings (for mentors)
router.get('/earnings', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    // Check if user is mentor
    const userResult = await db.query('SELECT role FROM users WHERE id = $1', [userId]);
    if (userResult.rows[0]?.role !== 'mentor') {
      return res.status(403).json({ error: 'Only mentors can view earnings' });
    }

    // Get total earnings
    const earningsResult = await db.query(
      `SELECT 
        COALESCE(SUM(p.amount), 0) as total_earnings,
        COUNT(DISTINCT p.session_id) as total_sessions,
        COUNT(CASE WHEN p.status = 'completed' THEN 1 END) as completed_payments
       FROM payments p
       JOIN sessions s ON p.session_id = s.id
       WHERE s.mentor_id = $1 AND p.status = 'completed'`,
      [userId]
    );

    res.json({
      success: true,
      earnings: earningsResult.rows[0],
    });
  } catch (error) {
    console.error('Error fetching earnings:', error);
    res.status(500).json({ error: 'Failed to fetch earnings' });
  }
});

export default router;
