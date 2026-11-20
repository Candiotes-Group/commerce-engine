import type { VercelRequest, VercelResponse } from '@vercel/node';

/** Quick sanity check once this is deployed: GET /api/health should return 200. */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ ok: true, service: 'commerce-engine' });
}
