-- Adds the columns needed for the "Track my order" template button.
-- Run once in the Supabase SQL editor — safe to re-run (IF NOT EXISTS).

alter table orders add column if not exists order_status_url text; -- Shopify's own order-status page for this order
alter table orders add column if not exists tracking_url text;     -- courier tracking link, set once fulfilled

comment on column orders.order_status_url is 'Shopify order-status page URL, captured from the orders/create webhook. Used as the fallback destination for the "Track my order" button before the order has shipped.';
comment on column orders.tracking_url is 'Courier tracking URL, captured from the fulfillments/create webhook. Once set, the "Track my order" button points here instead of the Shopify order-status page.';
