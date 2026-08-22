"use client";

import { waLink } from "@/lib/whatsapp";

// Opens WhatsApp with a prefilled message. The user saves the PDF (Print button) and
// attaches it in the chat, then taps send (spec feature 33, §5 confirmation).
export function WhatsAppButton({
  phone,
  text,
}: {
  phone?: string | null;
  text: string;
}) {
  return (
    <a
      href={waLink(phone, text)}
      target="_blank"
      rel="noopener noreferrer"
      className="no-print inline-flex h-10 items-center justify-center rounded-control border border-line-strong bg-surface px-5 text-[15px] font-semibold text-ink transition-colors duration-[140ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-surface-alt"
    >
      Share on WhatsApp
    </a>
  );
}
