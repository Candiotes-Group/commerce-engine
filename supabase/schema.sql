-- Candiotes Group Commerce Engine — database schema
-- Multi-tenant from day one: every table keys off clients.id, so Belora and
-- every future client share one deployment without their data ever mixing.
--
-- Run this once in the Supabase SQL editor (Dashboard > SQL Editor > New query).

create extension if not exists pgcrypto; -- for gen_random_uuid()

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  active boolean not null default true,

  -- WhatsApp / Meta. One row here = one business's WhatsApp number.
  whatsapp_phone_number_id text not null unique,
  whatsapp_waba_id text,
  whatsapp_access_token text not null,   -- permanent System User token
  meta_app_secret text not null,         -- verifies this client's webhook signature

  -- Shopify (optional — a client without Shopify just leaves these null)
  shopify_domain text,
  shopify_access_token text,
  shopify_webhook_secret text,           -- signing secret for THIS client's webhook subscriptions

  -- Message templates, pre-approved in Meta Business Manager for this client's WABA
  order_confirmation_template text,
  shipping_update_template text,

  -- Bot behaviour: brand voice, product knowledge, rules — the system prompt
  -- Claude is given for every message on this client's number.
  system_prompt text not null default 'You are a helpful, friendly assistant for an online store.',

  created_at timestamptz not null default now()
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  customer_phone text not null,          -- normalised, digits + leading + only
  status text not null default 'bot' check (status in ('bot', 'human', 'closed')),
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  unique (client_id, customer_phone)     -- one thread per customer per client
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('customer', 'bot', 'human')),
  content text not null,
  meta_message_id text,                  -- Meta's own message id, for dedup/debugging
  created_at timestamptz not null default now()
);

create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  shopify_order_id text not null,
  customer_phone text,
  status text not null default 'confirmed' check (status in ('confirmed', 'shipped', 'delivered', 'cancelled')),
  tracking_number text,
  created_at timestamptz not null default now(),
  unique (client_id, shopify_order_id)
);

create index if not exists idx_messages_conversation on messages (conversation_id, created_at);
create index if not exists idx_conversations_client_phone on conversations (client_id, customer_phone);
create index if not exists idx_orders_client_shopify_id on orders (client_id, shopify_order_id);

-- Row Level Security is left OFF here deliberately: this schema is only ever
-- read/written through the Supabase service-role key from the server-side
-- webhook code, never from a browser, so RLS policies would add nothing.
-- If that ever changes, turn RLS on before exposing anon/public access.
