import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readRawBody, verifyShopifySignature } from '../../lib/verify';
import { getClientBySlug } from '../../lib/clients';
import { getSupabase } from '../../lib/supabase';
import { sendWhatsAppTemplate } from '../../lib/whatsapp';
import { normalizePhone } from '../../lib/phone';

/**
 * Shopify "orders/create" webhook. Configure this per client at
 * /api/webhooks/shopify-order?client=<slug> — Shopify webhooks don't carry
 * a client identifier on their own, so the URL itself does.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const slug = req.query.client as string | undefined;
  if (!slug) {
    res.status(400).send('Missing ?client= query param');
    return;
  }

  const client = await getClientBySlug(slug);
  if (!client) {
    res.status(404).send('Unknown client');
    return;
  }

  const rawBody = await readRawBody(req);
  const hmac = req.headers['x-shopify-hmac-sha256'] as string | undefined;

  if (!client.shopify_webhook_secret || !verifyShopifySignature(rawBody, hmac, client.shopify_webhook_secret)) {
    res.status(401).send('Invalid signature');
    return;
  }

  // Do all the work before responding — see the comment in
  // api/webhooks/whatsapp.ts for why "respond early, keep working after" is
  // not safe on Vercel.
  try {
    const order = JSON.parse(rawBody.toString('utf8'));
    const rawPhone: string | undefined = order?.customer?.phone || order?.shipping_address?.phone;
    if (!rawPhone) {
      console.error('Order has no phone number, cannot WhatsApp it', order?.id);
      res.status(200).send('OK');
      return;
    }
    const phone = normalizePhone(rawPhone);

    if (!client.order_confirmation_template) {
      console.error('No order_confirmation_template configured for client', slug);
      res.status(200).send('OK');
      return;
    }

    const orderNumber: string = order.name ?? String(order.order_number ?? '');
    const total: string = order.total_price ?? '';

    await sendWhatsAppTemplate(
      client.whatsapp_phone_number_id,
      client.whatsapp_access_token,
      phone,
      client.order_confirmation_template,
      'en',
      [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: orderNumber },
            { type: 'text', text: total },
          ],
        },
      ]
    );

    const supabase = getSupabase();
    await supabase.from('orders').upsert(
      {
        client_id: client.id,
        shopify_order_id: String(order.id),
        customer_phone: phone,
        status: 'confirmed',
      },
      { onConflict: 'client_id,shopify_order_id' }
    );

    res.status(200).send('OK');
  } catch (err) {
    console.error('shopify-order webhook error', err);
    res.status(200).send('OK');
  }
}
