import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readRawBody, verifyShopifySignature } from '../../lib/verify';
import { getClientBySlug } from '../../lib/clients';
import { getSupabase } from '../../lib/supabase';
import { sendWhatsAppTemplate } from '../../lib/whatsapp';
import { normalizePhone } from '../../lib/phone';

/**
 * Shopify "fulfillments/create" webhook — fires when an order ships.
 * Configure per client at /api/webhooks/shopify-fulfillment?client=<slug>.
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
    const fulfillment = JSON.parse(rawBody.toString('utf8'));
    const rawPhone: string | undefined = fulfillment?.destination?.phone;
    if (!rawPhone) {
      console.error('Fulfillment has no phone number, cannot WhatsApp it', fulfillment?.id);
      res.status(200).send('OK');
      return;
    }
    const phone = normalizePhone(rawPhone);

    if (!client.shipping_update_template) {
      console.error('No shipping_update_template configured for client', slug);
      res.status(200).send('OK');
      return;
    }

    const trackingNumber: string = fulfillment.tracking_number ?? 'N/A';
    const trackingUrl: string =
      fulfillment.tracking_url ?? (Array.isArray(fulfillment.tracking_urls) ? fulfillment.tracking_urls[0] : '') ?? '';

    await sendWhatsAppTemplate(
      client.whatsapp_phone_number_id,
      client.whatsapp_access_token,
      phone,
      client.shipping_update_template,
      'en',
      [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: trackingNumber },
            { type: 'text', text: trackingUrl },
          ],
        },
        // Same "Track my order" button as the confirmation template — once
        // this fires, /api/track for this order starts resolving to the
        // real courier tracking_url instead of the Shopify order-status page.
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: String(fulfillment.order_id) }],
        },
      ]
    );

    const supabase = getSupabase();
    await supabase
      .from('orders')
      .update({ status: 'shipped', tracking_number: trackingNumber, tracking_url: trackingUrl || null })
      .eq('client_id', client.id)
      .eq('shopify_order_id', String(fulfillment.order_id));

    res.status(200).send('OK');
  } catch (err) {
    console.error('shopify-fulfillment webhook error', err);
    res.status(200).send('OK');
  }
}
