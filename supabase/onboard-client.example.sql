-- Template for onboarding one client (copy this, fill in real values, run in
-- the Supabase SQL editor). Never commit a filled-in copy of this file —
-- it holds real access tokens.

insert into clients (
  name,
  slug,
  whatsapp_phone_number_id,
  whatsapp_waba_id,
  whatsapp_access_token,
  meta_app_secret,
  shopify_domain,
  shopify_access_token,
  shopify_webhook_secret,
  order_confirmation_template,
  shipping_update_template,
  system_prompt
) values (
  'Belora',
  'belora',
  '153701712820883',              -- Phone number ID, from Meta API Setup
  '2152723835319532',             -- WhatsApp Business Account ID
  'PASTE_PERMANENT_SYSTEM_USER_TOKEN_HERE',
  'PASTE_META_APP_SECRET_HERE',
  'belora.myshopify.com',
  'PASTE_SHOPIFY_ADMIN_API_TOKEN_HERE',
  'PASTE_SHOPIFY_WEBHOOK_SIGNING_SECRET_HERE',
  'order_confirmation',           -- must already be an APPROVED template in Meta
  'shipping_update',              -- same
  'You are Belora''s WhatsApp assistant, a South African online beauty '
  || 'retailer selling skincare, makeup, hair tools and body care. '
  || 'Use South African English spelling, never ZAR 149.00 (write R149 '
  || 'instead), and never use emojis. Be warm, clear and brief. If you are '
  || 'not confident you know the answer — stock, delivery dates, or '
  || 'anything about a specific order — say a team member will follow up, '
  || 'rather than guessing.'
) on conflict (slug) do update set
  whatsapp_phone_number_id = excluded.whatsapp_phone_number_id,
  whatsapp_waba_id = excluded.whatsapp_waba_id,
  whatsapp_access_token = excluded.whatsapp_access_token,
  meta_app_secret = excluded.meta_app_secret,
  shopify_domain = excluded.shopify_domain,
  shopify_access_token = excluded.shopify_access_token,
  shopify_webhook_secret = excluded.shopify_webhook_secret,
  order_confirmation_template = excluded.order_confirmation_template,
  shipping_update_template = excluded.shipping_update_template,
  system_prompt = excluded.system_prompt;
