// Shape of the letterhead settings, plus the small decisions that depend on it.
//
// Deliberately free of any database import so that client components (the
// settings preview) and server components (the print pages) can both use it.
// Reading the row lives in src/lib/settings.ts.

import type { LetterheadMode } from "@/generated/prisma/enums";

export type BusinessSettings = {
  name: string;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  mode: LetterheadMode;
  hasImage: boolean;
  letterheadName: string | null;
  // Cache-busting token for the image URL: the filename never changes, so
  // without this the browser would keep showing the previous letterhead.
  imageVersion: string | null;
  /**
   * Where the letterhead's own "Date: ____" rule sits, in mm from the top-left
   * of the page. Null when the artwork has no such field.
   */
  dateFieldXMm: number | null;
  dateFieldYMm: number | null;
  marginTopMm: number;
  marginBottomMm: number;
  marginSideMm: number;
};

export const A4_WIDTH_MM = 210;
export const A4_HEIGHT_MM = 297;

/**
 * Is artwork actually going to be drawn? IMAGE mode with nothing uploaded is
 * treated as NONE, so the shop never gets a blank space where a header belongs.
 */
export function drawsArtwork(s: BusinessSettings): boolean {
  return s.mode === "IMAGE" && s.hasImage;
}

/**
 * Should the app draw its own text header (shop name, address, phone)? Not when
 * a letterhead is in play — the paper already carries the shop's identity, and
 * printing it twice looks like a mistake.
 */
export function drawsTextHeader(s: BusinessSettings): boolean {
  return !drawsArtwork(s) && s.mode !== "PREPRINTED";
}

/**
 * Should the document's date be printed onto the letterhead's own Date rule?
 * Only when there is artwork to print it on and a position to print it at —
 * otherwise the date stays in the document's own header, as it always was.
 */
export function dateFieldOf(s: BusinessSettings): { xMm: number; yMm: number } | null {
  if (!drawsArtwork(s)) return null;
  if (s.dateFieldXMm == null || s.dateFieldYMm == null) return null;
  return { xMm: s.dateFieldXMm, yMm: s.dateFieldYMm };
}

export function letterheadSrc(s: BusinessSettings): string {
  return `/api/letterhead?v=${s.imageVersion ?? "0"}`;
}

/** Address and phone on one line, skipping whichever the shop has not filled in. */
export function contactLine(s: BusinessSettings): string {
  return [s.address, s.phone].filter(Boolean).join(" · ");
}
