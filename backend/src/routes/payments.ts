import express, { Request, Response } from 'express';
import * as db from '../database';
import { authMiddleware } from '../middleware/auth';
import { isStripeConfigured, verifyStripeSignature } from '../services/stripeWebhook';

const router = express.Router();

// Stripe webhook signing secret (whsec_...). Payment completion is only ever
// driven by signature-verified webhooks — never by a client request.
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

// Create payment intent for session
router.post('/create-payment-intent', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { sessionId, amount } = req.body;
    const userId = (req as any).user.id;

    if (typeof amount !== 'number' || Number.isNaN(amount)) {
      return res.status(400).json({
        error: 'Amount must be a valid number',
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        error: 'Amount must be greater than zero',
      });
    }

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
      data: {
        paymentId: paymentResult.rows[0].id,
        clientSecret: 'test_secret_' + paymentResult.rows[0].id,
      },
      paymentId: paymentResult.rows[0].id,
      clientSecret: 'test_secret_' + paymentResult.rows[0].id,
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});

// Confirm payment (DISABLED)
//
// SECURITY (issue #140): this endpoint previously let any authenticated user
// mark their own session as paid simply by POSTing a paymentId — no money ever
// had to change hands. Clients must NEVER be able to complete a payment.
// Payment completion now happens exclusively through the signature-verified
// Stripe webhook below. This route is kept only to return a clear error to any
// legacy caller.
router.post('/confirm', authMiddleware, async (_req: Request, res: Response) => {
  return res.status(501).json({
    error: 'Client-side payment confirmation is disabled',
    message:
      'Payments are confirmed automatically via a signature-verified Stripe webhook ' +
      '(POST /api/payments/webhook). Clients cannot mark a payment as completed.',
  });
});

/**
 * Stripe webhook — the ONLY trusted way a payment is marked completed.
 *
 * Stripe signs each delivery with our webhook secret; we verify that signature
 * before touching the database. No auth middleware here: authenticity comes
 * from the signature, not a user session. Requires the raw request body
 * (captured in index.ts) so the signature can be recomputed byte-for-byte.
 */
router.post('/webhook', async (req: Request, res: Response) => {
  // If no signing secret is configured, we cannot verify anything — refuse
  // rather than trusting the payload.
  if (!isStripeConfigured(STRIPE_WEBHOOK_SECRET)) {
    return res.status(501).json({
      error: 'Stripe webhooks are not configured',
      message: 'Set STRIPE_WEBHOOK_SECRET to enable payment confirmation.',
    });
  }

  const rawBody = (req as any).rawBody ?? JSON.stringify(req.body ?? {});
  const signature = req.headers['stripe-signature'];

  let event;
  try {
    event = verifyStripeSignature(
      rawBody,
      Array.isArray(signature) ? signature[0] : signature,
      STRIPE_WEBHOOK_SECRET
    );
  } catch (err: any) {
    console.warn('Rejected Stripe webhook:', err.message);
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  try {
    if (event.type === 'payment_intent.succeeded' || event.type === 'checkout.session.completed') {
      const object = event.data?.object ?? {};
      const stripePaymentId: string | undefined = object.id;
      const internalPaymentId: string | undefined = object.metadata?.paymentId;

      // Resolve our payment record by the internal id we attached as metadata
      // when creating the intent, falling back to a previously stored Stripe id.
      const result = await db.query(
        `UPDATE payments
            SET status = 'completed',
                stripe_payment_id = COALESCE($2, stripe_payment_id),
                updated_at = NOW()
          WHERE (id = $1 OR stripe_payment_id = $2)
            AND status <> 'completed'
        RETURNING *`,
        [internalPaymentId ?? null, stripePaymentId ?? null]
      );

      if (result.rows.length > 0) {
        await db.query(
          `UPDATE sessions SET status = 'confirmed' WHERE id = $1`,
          [result.rows[0].session_id]
        );
        console.log(`Payment ${result.rows[0].id} marked completed via Stripe webhook`);
      } else {
        console.log('Stripe webhook: no matching pending payment found (already processed?)');
      }
    }

    // Acknowledge receipt so Stripe stops retrying.
    return res.json({ received: true });
  } catch (error) {
    console.error('Error handling Stripe webhook:', error);
    return res.status(500).json({ error: 'Failed to process webhook' });
  }
});

// Get payment history
router.get('/history', authMiddleware, async (req: Request, res: Response) => {
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
      data: result.rows,
      payments: result.rows,
    });
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

// Get earnings (for mentors)
router.get('/earnings', authMiddleware, async (req: Request, res: Response) => {
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
      data: earningsResult.rows[0],
      earnings: earningsResult.rows[0],
    });
  } catch (error) {
    console.error('Error fetching earnings:', error);
    res.status(500).json({ error: 'Failed to fetch earnings' });
  }
});

export default router;
