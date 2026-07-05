import crypto from 'crypto';
import {
  isStripeConfigured,
  verifyStripeSignature,
  DEFAULT_TOLERANCE_SECONDS,
} from './stripeWebhook';

const SECRET = 'whsec_test_secret';

/** Build a valid Stripe-Signature header for a payload, the way Stripe would. */
function sign(payload: string, secret = SECRET, timestamp = Math.floor(Date.now() / 1000)): string {
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`, 'utf8')
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

describe('isStripeConfigured', () => {
  it('is false when the secret is missing or blank', () => {
    expect(isStripeConfigured('')).toBe(false);
    expect(isStripeConfigured('   ')).toBe(false);
    expect(isStripeConfigured(undefined)).toBe(false);
    expect(isStripeConfigured(null)).toBe(false);
  });

  it('is true when a secret is present', () => {
    expect(isStripeConfigured('whsec_abc')).toBe(true);
  });
});

describe('verifyStripeSignature', () => {
  const payload = JSON.stringify({
    type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_123', metadata: { paymentId: 'pay_1' } } },
  });

  it('accepts and parses a correctly signed payload', () => {
    const event = verifyStripeSignature(payload, sign(payload), SECRET);
    expect(event.type).toBe('payment_intent.succeeded');
    expect(event.data.object.id).toBe('pi_123');
  });

  it('accepts a raw Buffer body', () => {
    const buf = Buffer.from(payload, 'utf8');
    const event = verifyStripeSignature(buf, sign(payload), SECRET);
    expect(event.data.object.metadata.paymentId).toBe('pay_1');
  });

  // --- The core of issue #140: forged/unauthorized completions must be rejected ---

  it('rejects a payload signed with the wrong secret (forged completion)', () => {
    const forged = sign(payload, 'whsec_attacker_guess');
    expect(() => verifyStripeSignature(payload, forged, SECRET)).toThrow(
      /No signatures found matching/
    );
  });

  it('rejects a tampered payload whose signature no longer matches', () => {
    const header = sign(payload);
    const tampered = payload.replace('pay_1', 'pay_victim');
    expect(() => verifyStripeSignature(tampered, header, SECRET)).toThrow(
      /No signatures found matching/
    );
  });

  it('rejects a request with no signature header', () => {
    expect(() => verifyStripeSignature(payload, undefined, SECRET)).toThrow(
      /Missing Stripe-Signature header/
    );
  });

  it('rejects a malformed signature header', () => {
    expect(() => verifyStripeSignature(payload, 'not-a-real-header', SECRET)).toThrow(
      /Unable to extract timestamp and signatures/
    );
  });

  it('rejects a replayed event outside the tolerance window', () => {
    const now = 1_000_000_000;
    const oldTimestamp = now - (DEFAULT_TOLERANCE_SECONDS + 60);
    const header = sign(payload, SECRET, oldTimestamp);
    expect(() =>
      verifyStripeSignature(payload, header, SECRET, DEFAULT_TOLERANCE_SECONDS, now)
    ).toThrow(/Timestamp outside the tolerance zone/);
  });

  it('accepts an event within the tolerance window', () => {
    const now = 1_000_000_000;
    const header = sign(payload, SECRET, now - 10);
    const event = verifyStripeSignature(payload, header, SECRET, DEFAULT_TOLERANCE_SECONDS, now);
    expect(event.type).toBe('payment_intent.succeeded');
  });
});
