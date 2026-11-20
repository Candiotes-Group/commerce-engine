# Commerce Engine

Candiotes Group's multi-tenant WhatsApp commerce bot. One deployment, one
database, every client (Belora first) added as a row of config — not as a
new deployment or a new codebase.

## What it does

- Answers customer WhatsApp messages using Claude, in that client's brand
  voice (their `system_prompt`), remembering the conversation per customer.
- Sends an order confirmation and a shipping update automatically, via
  Shopify webhooks, as pre-approved WhatsApp template messages.
- Stays out of the way the moment a human takes a conversation over — set
  `conversations.status = 'human'` for that thread and the bot goes quiet
  on it, permanently, until you set it back.
- All on the *same* WhatsApp number a business already uses for its human
  inbox (e.g. Belora's Ledgerly inbox) — customers never see a seam between
  bot and human.

## Architecture in one paragraph

Every webhook Meta or Shopify calls hits this one Vercel deployment.
Meta's payload carries the `phone_number_id` it was sent to; Shopify's
webhook URL carries a `?client=<slug>` query param. Either way, the first
thing every handler does is look up *which client* this event belongs to
in Supabase, then does everything else (verifying the signature, calling
Claude, sending the WhatsApp reply, logging to the database) using that
client's own credentials. Onboarding client #2 is a SQL insert, not a
redeploy.

## Repo layout

```
api/webhooks/whatsapp.ts            - incoming WhatsApp messages (GET = Meta verification, POST = messages)
api/webhooks/shopify-order.ts       - Shopify "orders/create" -> WhatsApp order confirmation
api/webhooks/shopify-fulfillment.ts - Shopify "fulfillments/create" -> WhatsApp shipping update
api/health.ts                       - GET /api/health sanity check
lib/                                 - shared code every webhook calls into
supabase/schema.sql                  - run once in the Supabase SQL editor
supabase/onboard-client.example.sql  - copy, fill in, run per new client
```

## One-time setup

### 1. Supabase

- Open your Supabase project > SQL Editor > New query
- Paste and run `supabase/schema.sql`
- That creates `clients`, `conversations`, `messages`, `orders`

### 2. Vercel

- Import this repo into Vercel (New Project > pick `Candiotes-Group/commerce-engine`)
- Under Project Settings > Environment Variables, set (see `.env.example`):
  - `ANTHROPIC_API_KEY`
  - `ANTHROPIC_MODEL` (optional, defaults to `claude-sonnet-5-5`)
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` (the **service role** key, not `anon` — Settings > API in Supabase)
  - `WHATSAPP_VERIFY_TOKEN` (make one up — any random string; every client's
    Meta app will be told to use this same value)
- Deploy. Note the resulting URL, e.g. `https://commerce-engine.vercel.app`

### 3. Onboard a client (e.g. Belora)

1. Copy `supabase/onboard-client.example.sql`, fill in the real values, run
   it in the Supabase SQL editor. **Never commit the filled-in version** —
   it holds real access tokens.
2. In that client's Meta app (WhatsApp > Configuration > Webhook):
   - Callback URL: `https://<your-vercel-url>/api/webhooks/whatsapp`
   - Verify token: the same `WHATSAPP_VERIFY_TOKEN` you set in Vercel
   - Click Verify and save, then subscribe to the `messages` field
3. In Shopify admin (Settings > Notifications > Webhooks, or via the
   Shopify Admin API):
   - `orders/create` → `https://<your-vercel-url>/api/webhooks/shopify-order?client=<slug>`
   - `fulfillments/create` → `https://<your-vercel-url>/api/webhooks/shopify-fulfillment?client=<slug>`
   - Copy that webhook subscription's signing secret into the client's
     `shopify_webhook_secret` column
4. In Meta Business Manager, create and get approval for two message
   templates (names must match what you put in `order_confirmation_template`
   and `shipping_update_template`), each with two body variables
   (order number + total; tracking number + tracking link).

### 4. Handing a conversation to a human

The bot checks `conversations.status` before replying. To take a thread
over by hand (e.g. from inside Ledgerly, or any other inbox watching the
same number), update that one row:

```sql
update conversations set status = 'human'
where client_id = (select id from clients where slug = 'belora')
  and customer_phone = '+27821234567';
```

Set it back to `'bot'` to hand it back.

## Local development

```
npm install
vercel dev
```

Needs a `.env.local` with the same variables as `.env.example`. Meta and
Shopify can't reach `localhost` directly — use `vercel dev` with a tunnel,
or just test against a deployed preview URL.

<!-- trigger initial Vercel deployment -->
