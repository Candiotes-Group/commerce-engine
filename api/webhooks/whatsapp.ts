import type { VercelRequest, VercelResponse } from '@vercel/node';
import { readRawBody, verifyMetaSignature } from '../../lib/verify';
import { getClientByPhoneNumberId } from '../../lib/clients';
import {
  getOrCreateConversation,
  getRecentMessages,
  saveMessage,
} from '../../lib/conversations';
import { getBotReply } from '../../lib/claude';
import { sendWhatsAppText } from '../../lib/whatsapp';

/**
 * One shared endpoint for every client. Meta's apps (one per client, or one
 * shared with Ledgerly as discussed for Belora) all point their webhook at
 * this same URL; the incoming payload's phone_number_id tells us which
 * client it belongs to, and each client's own App Secret verifies the
 * signature — so one tenant can never forge messages for another.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    // Meta's webhook verification handshake, run once when you click
    // "Verify and save" in Meta's Configuration > Webhook screen.
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      res.status(200).send(challenge as string);
      return;
    }
    res.status(403).send('Verification failed');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const rawBody = await readRawBody(req);
  let payload: any;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    res.status(400).send('Invalid JSON');
    return;
  }

  // IMPORTANT: do all the work before responding. Vercel can freeze/tear
  // down a serverless function right after the HTTP response is sent, so
  // responding early and then "continuing in the background" is not safe
  // here — it silently drops everything after the response. Our full
  // pipeline (Supabase lookups + one Claude call + a WhatsApp send) is a
  // couple of seconds at most, well inside what Meta tolerates before it
  // would consider retrying.
  try {
    const value = payload?.entry?.[0]?.changes?.[0]?.value;
    const phoneNumberId = value?.metadata?.phone_number_id;
    if (!phoneNumberId) {
      res.status(200).send('EVENT_RECEIVED');
      return;
    }

    const client = await getClientByPhoneNumberId(phoneNumberId);
    if (!client) {
      console.error('No client configured for phone_number_id', phoneNumberId);
      res.status(200).send('EVENT_RECEIVED');
      return;
    }

    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    if (!verifyMetaSignature(rawBody, signature, client.meta_app_secret)) {
      console.error('Invalid webhook signature for client', client.slug);
      res.status(200).send('EVENT_RECEIVED');
      return;
    }

    const messages = value?.messages;
    if (!messages?.length) {
      // a status update (delivered/read), not a message
      res.status(200).send('EVENT_RECEIVED');
      return;
    }

    for (const msg of messages) {
      const from: string = msg.from;
      const text: string =
        msg.text?.body ?? msg.interactive?.button_reply?.title ?? msg.button?.text ?? null;

      const conversation = await getOrCreateConversation(client.id, from);

      if (!text) {
        // Image/voice/document etc. — log a placeholder so the thread stays
        // intact, but don't attempt to make Claude respond to it yet.
        await saveMessage(conversation.id, 'customer', '[unsupported message type]', msg.id);
        continue;
      }

      await saveMessage(conversation.id, 'customer', text, msg.id);

      if (conversation.status === 'human') {
        // A human has already taken this conversation over — stay silent.
        continue;
      }

      const history = await getRecentMessages(conversation.id);
      const claudeHistory = history.map((m) => ({
        role: (m.role === 'customer' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content,
      }));

      const reply = await getBotReply(client.system_prompt, claudeHistory);
      await sendWhatsAppText(client.whatsapp_phone_number_id, client.whatsapp_access_token, from, reply);
      await saveMessage(conversation.id, 'bot', reply);
    }

    res.status(200).send('EVENT_RECEIVED');
  } catch (err) {
    console.error('whatsapp webhook error', err);
    // Still 200 — Meta retries aggressively on non-200, and a retry here
    // would mean re-processing (and possibly double-replying to) the same
    // message rather than fixing whatever actually went wrong.
    res.status(200).send('EVENT_RECEIVED');
  }
}
