// Business identity and letterhead, read from the single BusinessSettings row.
//
// Everything here degrades to the old hardcoded behaviour: if the row is missing
// (fresh install, migration not yet run) or the shop has uploaded nothing, the
// documents print exactly as they did before this feature existed. A print page
// must never fail because a setting is absent.

import { prisma } from "@/lib/prisma";
import { BUSINESS } from "@/lib/business";


export type { BusinessSettings } from "@/lib/letterhead";
import type { BusinessSettings } from "@/lib/letterhead";

export const SETTINGS_ID = "default";


const FALLBACK: BusinessSettings = {
  name: BUSINESS.name,
  tagline: BUSINESS.tagline,
  address: BUSINESS.address,
  phone: BUSINESS.phone,
  mode: "NONE",
  hasImage: false,
  letterheadName: null,
  imageVersion: null,
  dateFieldXMm: null,
  dateFieldYMm: null,
  marginTopMm: 16,
  marginBottomMm: 16,
  marginSideMm: 16,
};

// The image itself is deliberately NOT selected here — it is served by
// /api/letterhead instead. Pulling a few hundred KB of bytes into every print
// page render (and into the React payload) would be wasted work.
export async function getBusinessSettings(): Promise<BusinessSettings> {
  try {
    const row = await prisma.businessSettings.findUnique({
      where: { id: SETTINGS_ID },
      select: {
        name: true,
        tagline: true,
        address: true,
        phone: true,
        mode: true,
        letterheadMime: true,
        letterheadName: true,
        letterheadUpdatedAt: true,
        dateFieldXMm: true,
        dateFieldYMm: true,
        marginTopMm: true,
        marginBottomMm: true,
        marginSideMm: true,
      },
    });
    if (!row) return FALLBACK;
    return {
      name: row.name,
      tagline: row.tagline,
      address: row.address,
      phone: row.phone,
      mode: row.mode,
      hasImage: Boolean(row.letterheadMime),
      letterheadName: row.letterheadName,
      imageVersion: row.letterheadUpdatedAt ? String(row.letterheadUpdatedAt.getTime()) : null,
      dateFieldXMm: row.dateFieldXMm,
      dateFieldYMm: row.dateFieldYMm,
      marginTopMm: row.marginTopMm,
      marginBottomMm: row.marginBottomMm,
      marginSideMm: row.marginSideMm,
    };
  } catch {
    // Table not there yet (migration pending) — print the old way rather than 500.
    return FALLBACK;
  }
}
