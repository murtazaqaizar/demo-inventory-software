"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { safeAction } from "@/lib/action-errors";
import { requireOwnerApi } from "@/lib/guards";
import { audit } from "@/lib/audit";
import { SETTINGS_ID } from "@/lib/settings";
import { describeRender, pdfToLetterheadPng } from "@/lib/pdf-letterhead";

export type ActionResult = { ok: boolean; error?: string; message?: string };

// Kept well under Next's server-action body limit (raised to 8mb in
// next.config.ts). A letterhead is artwork for one A4 page — anything bigger is
// a photo that was never resized, and it would slow every print page down.
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = ["image/png", "image/jpeg", "image/webp"] as const;
const PDF = "application/pdf";

// Every print page reads these, so they all have to be re-rendered on a change.
const PRINT_PATHS = ["/billing", "/customers", "/settings"];
function revalidatePrintPages() {
  for (const p of PRINT_PATHS) revalidatePath(p, "layout");
}

const infoSchema = z.object({
  name: z.string().min(1, "The shop name is required"),
  tagline: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
});

export async function saveBusinessInfo(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireOwnerApi();
    const parsed = infoSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
    const d = parsed.data;

    const data = {
      name: d.name.trim(),
      tagline: d.tagline?.trim() || null,
      address: d.address?.trim() || null,
      phone: d.phone?.trim() || null,
    };
    await prisma.businessSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...data },
      update: data,
    });

    await audit(user, "SETTINGS_BUSINESS", "BusinessSettings", SETTINGS_ID, `Updated shop details (${data.name})`);
    revalidatePrintPages();
    return { ok: true, message: "Shop details saved." };
  }, (error) => ({ ok: false, error }));
}

const layoutSchema = z.object({
  mode: z.enum(["NONE", "IMAGE", "PREPRINTED"]),
  // 0 is allowed (edge-to-edge artwork); 60mm is already a third of the page.
  marginTopMm: z.coerce.number().int().min(0).max(80),
  marginBottomMm: z.coerce.number().int().min(0).max(80),
  marginSideMm: z.coerce.number().int().min(0).max(60),
});

export async function saveLetterheadLayout(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireOwnerApi();
    const parsed = layoutSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
    const d = parsed.data;

    const existing = await prisma.businessSettings.findUnique({
      where: { id: SETTINGS_ID },
      select: { letterheadMime: true },
    });
    if (d.mode === "IMAGE" && !existing?.letterheadMime) {
      return { ok: false, error: "Upload a letterhead image first, then switch to this option." };
    }

    await prisma.businessSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...d },
      update: d,
    });

    await audit(
      user,
      "SETTINGS_LETTERHEAD",
      "BusinessSettings",
      SETTINGS_ID,
      `Letterhead set to ${d.mode}, margins ${d.marginTopMm}/${d.marginBottomMm}/${d.marginSideMm}mm`
    );
    revalidatePrintPages();
    return { ok: true, message: "Page layout saved." };
  }, (error) => ({ ok: false, error }));
}

export async function uploadLetterhead(formData: FormData): Promise<ActionResult> {
  return safeAction(async () => {
    const user = await requireOwnerApi();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Choose a letterhead image to upload." };
    }
    const isPdf = file.type === PDF || file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf && !ALLOWED.includes(file.type as (typeof ALLOWED)[number])) {
      return { ok: false, error: "The letterhead must be a PDF, PNG, JPG or WebP." };
    }
    if (file.size > MAX_BYTES) {
      return {
        ok: false,
        error: `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. Save it under 4 MB — an A4 letterhead does not need more.`,
      };
    }

    let bytes = Buffer.from(await file.arrayBuffer());
    let mime = file.type;
    let name = file.name;
    // Null unless the artwork turns out to carry its own "Date: ____" rule.
    let dateFieldXMm: number | null = null;
    let dateFieldYMm: number | null = null;
    let note = "Letterhead uploaded. Check the preview below before printing.";

    // A print shop hands over a PDF, usually with bleed. Rasterise it here, once,
    // so the print pages stay a plain <img> and a bill never waits on a renderer.
    if (isPdf) {
      try {
        const render = await pdfToLetterheadPng(bytes);
        bytes = render.png;
        mime = "image/png";
        name = file.name.replace(/\.pdf$/i, "") + ".png";
        dateFieldXMm = render.dateField?.xMm ?? null;
        dateFieldYMm = render.dateField?.yMm ?? null;
        note = `${describeRender(render)} Check the preview below before printing.`;
      } catch {
        return {
          ok: false,
          error: "That PDF could not be read. Try exporting it again, or upload a PNG instead.",
        };
      }
      if (bytes.length > MAX_BYTES) {
        return { ok: false, error: "That PDF made an image too large to store. Export it as a PNG at a lower resolution." };
      }
    }

    // Uploading is also the point where the shop clearly wants the artwork used,
    // so switch the mode on rather than making them find a second control.
    await prisma.businessSettings.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        letterheadImage: bytes,
        letterheadMime: mime,
        letterheadName: name,
        letterheadUpdatedAt: new Date(),
        mode: "IMAGE",
        dateFieldXMm,
        dateFieldYMm,
      },
      update: {
        letterheadImage: bytes,
        letterheadMime: mime,
        letterheadName: name,
        letterheadUpdatedAt: new Date(),
        mode: "IMAGE",
        dateFieldXMm,
        dateFieldYMm,
      },
    });

    await audit(
      user,
      "SETTINGS_LETTERHEAD_UPLOAD",
      "BusinessSettings",
      SETTINGS_ID,
      `Uploaded letterhead ${name} (${Math.round(bytes.length / 1024)} KB${isPdf ? ", converted from PDF" : ""})`
    );
    revalidatePrintPages();
    return { ok: true, message: note };
  }, (error) => ({ ok: false, error }));
}

export async function removeLetterhead(): Promise<ActionResult> {
  return safeAction(async (): Promise<ActionResult> => {
    const user = await requireOwnerApi();
    await prisma.businessSettings.update({
      where: { id: SETTINGS_ID },
      data: {
        letterheadImage: null,
        letterheadMime: null,
        letterheadName: null,
        letterheadUpdatedAt: null,
        // Nothing to draw any more, so fall back to the app's own header.
        mode: "NONE",
        dateFieldXMm: null,
        dateFieldYMm: null,
      },
    });

    await audit(user, "SETTINGS_LETTERHEAD_REMOVE", "BusinessSettings", SETTINGS_ID, "Removed the letterhead image");
    revalidatePrintPages();
    return { ok: true, message: "Letterhead removed. Documents print with the plain header again." };
  }, (error) => ({ ok: false, error }));
}
