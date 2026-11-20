import { getSupabase } from './supabase';

export interface ClientConfig {
  id: string;
  name: string;
  slug: string;
  active: boolean;

  whatsapp_phone_number_id: string;
  whatsapp_waba_id: string | null;
  whatsapp_access_token: string;
  meta_app_secret: string;

  shopify_domain: string | null;
  shopify_access_token: string | null;
  shopify_webhook_secret: string | null;

  order_confirmation_template: string | null;
  shipping_update_template: string | null;

  system_prompt: string;
}

/**
 * Every incoming WhatsApp message carries the Meta phone_number_id it was
 * sent to. That's how one shared webhook serves every client: look the
 * number up here rather than using a different URL per client.
 */
export async function getClientByPhoneNumberId(
  phoneNumberId: string
): Promise<ClientConfig | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('whatsapp_phone_number_id', phoneNumberId)
    .eq('active', true)
    .maybeSingle();

  if (error) {
    console.error('getClientByPhoneNumberId error', error);
    return null;
  }
  return data as ClientConfig | null;
}

/**
 * Shopify webhooks don't carry anything client-identifying by default, so
 * the webhook URL itself carries a ?client=<slug> query param instead.
 */
export async function getClientBySlug(slug: string): Promise<ClientConfig | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('slug', slug)
    .eq('active', true)
    .maybeSingle();

  if (error) {
    console.error('getClientBySlug error', error);
    return null;
  }
  return data as ClientConfig | null;
}
