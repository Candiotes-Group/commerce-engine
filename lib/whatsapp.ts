const GRAPH_VERSION = 'v21.0';

interface TemplateComponent {
  type: 'body' | 'header' | 'button';
  parameters: Array<{ type: 'text'; text: string }>;
}

async function postToGraph(phoneNumberId: string, accessToken: string, payload: unknown) {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`WhatsApp Graph API error ${res.status}: ${errText}`);
  }
  return res.json();
}

/**
 * Free-form reply. Only usable inside a 24-hour window after the customer
 * last messaged in — which is exactly the case here, since this always
 * fires in direct response to an inbound customer message.
 */
export async function sendWhatsAppText(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  body: string
) {
  return postToGraph(phoneNumberId, accessToken, {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body },
  });
}

/**
 * Template message — the only way to message a customer outside the 24-hour
 * window, which is exactly what order confirmations and shipping updates
 * are. The template name must already be approved in Meta Business Manager
 * for that client's WABA.
 */
export async function sendWhatsAppTemplate(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  templateName: string,
  languageCode: string,
  components: TemplateComponent[] = []
) {
  return postToGraph(phoneNumberId, accessToken, {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components,
    },
  });
}
