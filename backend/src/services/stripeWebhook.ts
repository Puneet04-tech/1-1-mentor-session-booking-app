import crypto from 'crypto';

/**
 * Minimal, dependency-free implementation of Stripe webhook signature
 * verification. This mirrors what `stripe.webhooks.constructEvent()` does
 * internally so we can verify events without pulling in the Stripe SDK.
 *
 * Security context (issue #140): payment completion must NEVER be driven by a
 * client-supplied flag. The only trusted signal that money actually changed
 * hands is a webhook whose signature is verified against our webhook signing
 * secret. Any request that fails verification is rejected.
 *
 * Signature scheme (see https://stripe.com/docs/webhooks/signatures):
 *   Stripe-Signature: t=<timestamp>,v1=<hex hmac>[,v1=<hex hmac>...]
 *   signed_payload   = `${t}.${rawBody}`
 *   expected         = HMAC_SHA256(signed_payload, signing_secret)  (hex)
 */

export interface StripeEvent {
  id?: string;
  type: string;
  data: {
    object: any;
  };
  [key: string]: any;
}

// Default clock-skew tolerance, matching Stripe's SDK default (5 minutes).
export const DEFAULT_TOLERANCE_SECONDS = 300;

/** True when a webhook signing secret is configured. */
export function isStripeConfigured(secret: string | undefined | null): secret is string {
  return typeof secret === 'string' && secret.trim().length > 0;
}

interface ParsedSignatureHeader {
  timestamp: number;
  signatures: string[];
}

function parseSignatureHeader(header: string): ParsedSignatureHeader {
  const result: ParsedSignatureHeader = { timestamp: -1, signatures: [] };

  for (const part of header.split(',')) {
    const [key, value] = part.split('=', 2);
    if (key === 't') {
      result.timestamp = parseInt(value, 10);
    } else if (key === 'v1') {
      result.signatures.push(value);
    }
  }

  return result;
}

function computeSignature(payload: string, timestamp: number, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`, 'utf8')
    .digest('hex');
}

/** Constant-time comparison of two hex signatures of equal length. */
function secureCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verify a Stripe webhook signature and return the parsed event.
 * Throws an Error if the signature, timestamp, or payload is invalid — callers
 * should treat any throw as an authentication failure (HTTP 400).
 *
 * @param payload   The raw request body, exactly as received (string or Buffer).
 * @param header    The value of the `Stripe-Signature` request header.
 * @param secret    The webhook signing secret (`whsec_...`).
 * @param toleranceSeconds  Max allowed difference between the header timestamp
 *                          and now, to defend against replay attacks.
 * @param nowSeconds  Current unix time (injectable for testing).
 */
export function verifyStripeSignature(
  payload: string | Buffer,
  header: string | undefined | null,
  secret: string,
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): StripeEvent {
  if (!header || typeof header !== 'string') {
    throw new Error('Missing Stripe-Signature header');
  }

  const payloadStr = Buffer.isBuffer(payload) ? payload.toString('utf8') : payload;
  const { timestamp, signatures } = parseSignatureHeader(header);

  if (timestamp === -1 || Number.isNaN(timestamp) || signatures.length === 0) {
    throw new Error('Unable to extract timestamp and signatures from header');
  }

  const expected = computeSignature(payloadStr, timestamp, secret);
  const matched = signatures.some((sig) => secureCompare(sig, expected));

  if (!matched) {
    throw new Error('No signatures found matching the expected signature for payload');
  }

  // Reject webhooks with timestamps in the future
  if (timestamp > nowSeconds) {
    throw new Error("Timestamp is in the future");
  }

  if (toleranceSeconds > 0 && nowSeconds - timestamp > toleranceSeconds) {
    throw new Error("Timestamp outside the tolerance zone");
  }

  try {
    const event = JSON.parse(payloadStr);

    if (
      typeof event !== "object" ||
      event === null ||
      typeof event.type !== "string" ||
      typeof event.data !== "object" ||
      event.data === null ||
      typeof event.data.object !== "object" ||
      event.data.object === null
    ) {
      throw new Error("Invalid Stripe event payload");
    }

    return event as StripeEvent;
  } catch (err) {
    if (err instanceof Error && err.message === "Invalid Stripe event payload") {
      throw err;
    }

    throw new Error("Invalid JSON payload");
  }
}
