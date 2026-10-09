import crypto from 'crypto';
import { Request } from 'express';

export function verifyWebhookSignature(req: Request, secret: string): boolean {
  if (!secret) return true; // If secret is not configured, bypass signature check (for dev/test)

  const signature = req.headers['x-hub-signature-256'] as string;
  if (!signature) {
    return false;
  }

  const rawBody = (req as any).rawBody || JSON.stringify(req.body);
  const hmac = crypto.createHmac('sha256', secret);
  const digest = `sha256=${hmac.update(rawBody).digest('hex')}`;

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch (err) {
    return false;
  }
}
