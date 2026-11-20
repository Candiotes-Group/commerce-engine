import { getSupabase } from './supabase';

export type MessageRole = 'customer' | 'bot' | 'human';
export type ConversationStatus = 'bot' | 'human' | 'closed';

export interface Conversation {
  id: string;
  client_id: string;
  customer_phone: string;
  status: ConversationStatus;
}

/**
 * One row per (client, customer phone) — the whole point of a "same number,
 * one thread" experience. Creates it on the customer's first message.
 */
export async function getOrCreateConversation(
  clientId: string,
  customerPhone: string
): Promise<Conversation> {
  const supabase = getSupabase();

  const { data: existing, error: findError } = await supabase
    .from('conversations')
    .select('*')
    .eq('client_id', clientId)
    .eq('customer_phone', customerPhone)
    .maybeSingle();

  if (findError) throw findError;
  if (existing) return existing as Conversation;

  const { data: created, error: insertError } = await supabase
    .from('conversations')
    .insert({ client_id: clientId, customer_phone: customerPhone, status: 'bot' })
    .select()
    .single();

  if (insertError) throw insertError;
  return created as Conversation;
}

/** Oldest-first, ready to hand straight to Claude as conversation history. */
export async function getRecentMessages(
  conversationId: string,
  limit = 12
): Promise<Array<{ role: MessageRole; content: string }>> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []).reverse() as Array<{ role: MessageRole; content: string }>;
}

export async function saveMessage(
  conversationId: string,
  role: MessageRole,
  content: string,
  metaMessageId?: string
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('messages').insert({
    conversation_id: conversationId,
    role,
    content,
    meta_message_id: metaMessageId || null,
  });
  if (error) throw error;

  await supabase
    .from('conversations')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', conversationId);
}

/** Flips a conversation to human-handled — the bot stops auto-replying. */
export async function markHandedToHuman(conversationId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('conversations')
    .update({ status: 'human' })
    .eq('id', conversationId);
  if (error) throw error;
}
