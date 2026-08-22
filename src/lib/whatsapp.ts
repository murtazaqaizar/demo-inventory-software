// Build a wa.me link that opens a WhatsApp chat with a prefilled message (spec feature 33).
// Per §5: this opens the chat ready to send (tap send) — not fully automatic. The PDF is
// produced via the browser's Print / Save-as-PDF on the same page and attached by the user.

// Normalise a Pakistani number to international digits for wa.me (e.g. 0300-1234567 -> 923001234567).
export function normalizePkPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("92")) return d;
  if (d.startsWith("0")) return "92" + d.slice(1);
  if (d.length === 10) return "92" + d; // 3001234567
  return d;
}

export function waLink(phone: string | null | undefined, text: string): string {
  const num = normalizePkPhone(phone);
  const q = `?text=${encodeURIComponent(text)}`;
  return num ? `https://wa.me/${num}${q}` : `https://wa.me/${q}`;
}
