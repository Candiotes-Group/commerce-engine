import crypto from 'node:crypto';
import type { IncomingMessage } from 'node:http';

/**
 * Reads the raw, unparsed request body. Needed because both Meta's and
 * Shopify's webhook signatures are computed over the exact bytes sent on
 * the wire — parsing to JSON first and re-serializing would not match.
 */
export async function readRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Meta signs every webhook POST with X-Hub-Signature-256: sha256=<hex hmac>,
 * keyed with the Meta app's App Secret. Verifying this stops anyone who
 * finds the callback URL from injecting fake "customer" messages.
 */
export function verifyMetaSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  appSecret: string
): boolean {
  if (!signatureHeader) return false;
  const expected =
    'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
  } catch {
    return false;
  }
}

/**
 * Shopify signs webhooks with X-Shopify-Hmac-Sha256: <base64 hmac>, keyed
 * with that webhook subscription's signing secret (different from the
 * Admin API access token).
 */
export function verifyShopifySignature(
  rawBody: Buffer,
  hmacHeader: string | undefined,
  secret: string
): boolean {
  if (!hmacHeader) return false;
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}
