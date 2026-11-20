/**
 * Strip everything except digits and a leading +, so the same customer's
 * number compares equal however Shopify or Meta happened to format it
 * (spaces, dashes, parentheses, missing +).
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}
