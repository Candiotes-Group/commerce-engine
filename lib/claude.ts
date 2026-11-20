import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

function getClaude(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('Missing ANTHROPIC_API_KEY env var');
    client = new Anthropic({ apiKey });
  }
  return client;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const FALLBACK_REPLY =
  "Sorry, I couldn't process that just now — a member of our team will follow up with you shortly.";

/**
 * One Claude call per customer message. systemPrompt carries the client's
 * brand voice, product knowledge and rules (built per-client, same shape as
 * the Belora Client Pack); history is that one customer's own thread only.
 */
export async function getBotReply(
  systemPrompt: string,
  history: ChatMessage[]
): Promise<string> {
  const anthropic = getClaude();
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

  try {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 500,
      system: systemPrompt,
      messages: history,
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (textBlock && 'text' in textBlock && textBlock.text.trim()) {
      return textBlock.text.trim();
    }
    return FALLBACK_REPLY;
  } catch (err) {
    console.error('Claude call failed', err);
    return FALLBACK_REPLY;
  }
}
