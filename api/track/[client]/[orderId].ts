import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase } from '../../../lib/supabase';
import { getClientBySlug } from '../../../lib/clients';

/**
 * The destination behind every "Track my order" template button.
 *
 * WhatsApp template buttons only support a dynamic URL suffix on a fixed
 * base (e.g. https://<deployment>/track/<slug>/{{1}}) — not an arbitrary
 * full URL per message, which is what Shopify's own order-status and
 * courier tracking links are. So the template button always points here,
 * and this just looks up and 302s to whichever real link applies right now:
 * the courier tracking URL once the order has shipped, otherwise the
 * Shopify order-status page.
 *
 * Configure the button's base URL in Meta Business Manager as
 * https://<this-deployment>/api/track/<slug>/ for that client's templates.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const slug = req.query.client as string | undefined;
  const orderId = req.query.orderId as string | undefined;

  if (!slug || !orderId) {
    res.status(400).send('Missing client or order id');
    return;
  }

  const client = await getClientBySlug(slug);
  if (!client) {
    res.status(404).send('Unknown client');
    return;
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('orders')
    .select('tracking_url, order_status_url')
    .eq('client_id', client.id)
    .eq('shopify_order_id', orderId)
    .maybeSingle();

  if (error) {
    console.error('track lookup error', error);
    res.status(500).send('Could not look up this order');
    return;
  }

  const destination = data?.tracking_url || data?.order_status_url;
  if (!destination) {
    res.status(404).send('No tracking link available for this order yet');
    return;
  }

  res.writeHead(302, { Location: destination });
  res.end();
}
