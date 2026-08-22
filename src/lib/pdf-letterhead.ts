// Turning an uploaded letterhead PDF into the PNG the print pages use.
//
// Print shops hand back a PDF, not an image, and usually with BLEED — the
// artwork is drawn 3mm oversize on every edge so the guillotine can cut through
// ink rather than leave a white sliver. The client's own letterhead is
// 216x303mm for a 210x297mm page. Scaling that whole thing onto A4 would shrink
// the design ~3% and print the part that was meant to be cut off, which looks
// almost right and is therefore the worst kind of wrong.
//
// So we crop to the TrimBox — the PDF's own record of where the paper gets cut —
// and rasterise that. Boxes are read from the page dictionary rather than
// guessed; a PDF without a TrimBox simply isn't cropped.
//
// Rasterising at upload time, once, is deliberate: the print pages stay a plain
// <img> with no PDF machinery anywhere near them, and a bill never waits on a
// renderer.

// Imported dynamically, and only when a PDF actually arrives: mupdf is a WASM
// module with top-level await, so a static import drags the whole renderer into
// module init for every request that touches this file.
type MuPdf = typeof import("mupdf");
let mupdfPromise: Promise<MuPdf> | null = null;
function loadMuPdf(): Promise<MuPdf> {
  mupdfPromise ??= import("mupdf");
  return mupdfPromise;
}

// 200 DPI puts an A4 page at 1654x2339px. Plenty for a laser printer, and the
// client's vector letterhead lands in well under 100KB at this size. 300 would
// be four times the bytes on every print page for detail nobody can see.
export const LETTERHEAD_DPI = 200;

const PT_PER_INCH = 72;
const MM_PER_INCH = 25.4;

export type LetterheadRender = {
  png: Buffer<ArrayBuffer>;
  widthPx: number;
  heightPx: number;
  /** Finished page size in millimetres, after any bleed was cropped off. */
  widthMm: number;
  heightMm: number;
  /** How much was cropped from each edge, 0 when the PDF carried no TrimBox. */
  bleedMm: number;
  pageCount: number;
  /**
   * Where the letterhead's own "Date: ____" rule is, in millimetres from the
   * top-left of the trimmed page — null when the artwork has no such field.
   * A stationery letterhead leaves that blank for someone to write in; when the
   * app is printing the document it should fill it rather than print a second
   * date lower down.
   */
  dateField: { xMm: number; yMm: number } | null;
};

const ptToMm = (pt: number) => (pt / PT_PER_INCH) * MM_PER_INCH;

function readBox(page: import("mupdf").PDFPage, key: string): [number, number, number, number] | null {
  try {
    const obj = page.getObject().get(key);
    if (!obj || !obj.isArray() || obj.length !== 4) return null;
    const out = [0, 1, 2, 3].map((i) => obj.get(i).asNumber());
    if (out.some((n) => !Number.isFinite(n))) return null;
    return out as [number, number, number, number];
  } catch {
    return null;
  }
}

/**
 * Look for a "Date" label in the artwork and return the point just after it,
 * where a written-in date would go. Matches the label alone (with or without a
 * colon) so it cannot fire on the word inside a sentence.
 */
function findDateField(
  page: import("mupdf").PDFPage,
  offX: number,
  offY: number
): { xMm: number; yMm: number } | null {
  try {
    const json = JSON.parse(page.toStructuredText("preserve-whitespace").asJSON()) as {
      blocks?: { lines?: { text?: string; bbox: { x: number; y: number; w: number; h: number } }[] }[];
    };
    for (const block of json.blocks ?? []) {
      for (const line of block.lines ?? []) {
        if (!/^\s*date\s*:?\s*$/i.test(line.text ?? "")) continue;
        const b = line.bbox;
        return {
          // Just past the label, onto the blank rule that follows it.
          xMm: Math.round(ptToMm(b.x + b.w - offX)) + 3,
          yMm: Math.round(ptToMm(b.y - offY)),
        };
      }
    }
  } catch {
    // Structured text is a nicety, never a reason to fail an upload.
  }
  return null;
}

export async function pdfToLetterheadPng(
  bytes: Uint8Array,
  dpi = LETTERHEAD_DPI
): Promise<LetterheadRender> {
  const mupdf = await loadMuPdf();
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  const pageCount = doc.countPages();
  if (pageCount < 1) throw new Error("That PDF has no pages.");

  // Only the first page: a letterhead is one sheet by definition.
  const page = doc.loadPage(0) as import("mupdf").PDFPage;

  const media = readBox(page, "MediaBox") ?? [0, 0, 595.28, 841.89];
  const trim = readBox(page, "TrimBox");

  // Fall back to the full page when there is no TrimBox — better to print the
  // whole artwork than to crop by a number we invented.
  const box = trim ?? media;
  const insetLeft = box[0] - media[0];
  // PDF boxes are bottom-left origin; MuPDF's page space is top-down, so the
  // top inset is measured from the media box's top edge.
  const insetTop = media[3] - box[3];

  const scale = dpi / PT_PER_INCH;
  const widthPx = Math.max(1, Math.round((box[2] - box[0]) * scale));
  const heightPx = Math.max(1, Math.round((box[3] - box[1]) * scale));

  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, widthPx, heightPx], false);
  // White, not transparent: this sits behind the bill and must print as paper.
  pixmap.clear(255);

  const device = new mupdf.DrawDevice(mupdf.Matrix.identity, pixmap);
  try {
    page.run(
      device,
      mupdf.Matrix.concat(mupdf.Matrix.scale(scale, scale), mupdf.Matrix.translate(-insetLeft, -insetTop))
    );
  } finally {
    device.close();
  }

  return {
    png: Buffer.from(pixmap.asPNG()) as Buffer<ArrayBuffer>,
    widthPx,
    heightPx,
    widthMm: Math.round(ptToMm(box[2] - box[0]) * 10) / 10,
    heightMm: Math.round(ptToMm(box[3] - box[1]) * 10) / 10,
    bleedMm: trim ? Math.round(ptToMm(insetLeft) * 10) / 10 : 0,
    pageCount,
    dateField: findDateField(page, insetLeft, insetTop),
  };
}

/** A one-line summary for the owner, so the conversion is not a black box. */
export function describeRender(r: LetterheadRender, dpi = LETTERHEAD_DPI): string {
  const bleed = r.bleedMm > 0 ? `, ${r.bleedMm}mm bleed trimmed off each edge` : "";
  const pages = r.pageCount > 1 ? ` Only page 1 of ${r.pageCount} was used.` : "";
  const dated = r.dateField ? " Found the letterhead's own Date line — the bill's date will be printed on it." : "";
  return `Converted your PDF to a ${r.widthMm} x ${r.heightMm}mm image at ${dpi} DPI${bleed}.${pages}${dated}`;
}
