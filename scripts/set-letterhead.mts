/**
 * Install a letterhead from the command line.
 *
 *   npm run letterhead:set -- "C:/path/to/letterhead.pdf" [topMm] [bottomMm] [sideMm]
 *
 * The Shop details page does the same thing, but this exists for setup: it can
 * measure the artwork and work out the margins itself, which is otherwise a
 * fiddly bit of trial and error against the preview.
 *
 * Accepts a PDF (cropped to its TrimBox, so print-shop bleed is removed) or a
 * PNG/JPG/WebP. Anything already stored is replaced.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DATABASE_URL;
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(new URL(url!).hostname);
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: url,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  }),
});

const { pdfToLetterheadPng, describeRender } = await import("../src/lib/pdf-letterhead.js");

const [file, topArg, bottomArg, sideArg] = process.argv.slice(2);
if (!file) {
  console.error('Usage: npm run letterhead:set -- "path/to/letterhead.pdf" [top] [bottom] [side]');
  process.exit(1);
}
if (!fs.existsSync(file)) {
  console.error(`No such file: ${file}`);
  process.exit(1);
}

const ext = path.extname(file).toLowerCase();
const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

let bytes = fs.readFileSync(file);
let mime = MIME[ext];
let name = path.basename(file);
let widthPx = 0;
let heightPx = 0;
let dateField: { xMm: number; yMm: number } | null = null;

if (ext === ".pdf") {
  const render = await pdfToLetterheadPng(new Uint8Array(bytes));
  bytes = render.png;
  mime = "image/png";
  name = path.basename(file).replace(/\.pdf$/i, "") + ".png";
  widthPx = render.widthPx;
  heightPx = render.heightPx;
  dateField = render.dateField;
  console.log(describeRender(render));
} else if (!mime) {
  console.error("Unsupported file. Use a PDF, PNG, JPG or WebP.");
  process.exit(1);
}

/**
 * Find the largest rectangle on the page with no ink in it, and turn that into
 * margins. Every letterhead puts its logo and footer somewhere different, so the
 * alternative is guessing numbers and reprinting until they look right.
 *
 * Only possible for a PDF, where we can re-render at a known scale.
 */
async function measureMargins(pdfBytes: Uint8Array) {
  const mupdf = await import("mupdf");
  const doc = mupdf.Document.openDocument(pdfBytes, "application/pdf");
  const page = doc.loadPage(0) as import("mupdf").PDFPage;
  const box = (key: string) => {
    const a = page.getObject().get(key);
    return a && a.isArray() ? [0, 1, 2, 3].map((i) => a.get(i).asNumber()) : null;
  };
  const media = box("MediaBox")!;
  const trim = box("TrimBox") ?? media;
  const dpi = 100; // enough to find blank space; keeps the scan quick
  const s = dpi / 72;
  const w = Math.round((trim[2] - trim[0]) * s);
  const h = Math.round((trim[3] - trim[1]) * s);
  const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, w, h], false);
  pix.clear(255);
  const dev = new mupdf.DrawDevice(mupdf.Matrix.identity, pix);
  page.run(
    dev,
    mupdf.Matrix.concat(
      mupdf.Matrix.scale(s, s),
      mupdf.Matrix.translate(-(trim[0] - media[0]), -(media[3] - trim[3]))
    )
  );
  dev.close();

  const px = pix.getPixels();
  const comps = pix.getNumberOfComponents();
  const stride = pix.getStride();
  const WHITE = 248;
  const free: Uint8Array[] = [];
  for (let y = 0; y < h; y++) {
    const row = new Uint8Array(w);
    for (let x = 0; x < w; x++) {
      const o = y * stride + x * comps;
      row[x] = px[o] >= WHITE && px[o + 1] >= WHITE && px[o + 2] >= WHITE ? 1 : 0;
    }
    free.push(row);
  }

  // Largest all-empty rectangle, by the usual histogram method.
  const heights = new Int32Array(w);
  let best = { area: 0, x0: 0, x1: 0, y0: 0, y1: 0 };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) heights[x] = free[y][x] ? heights[x] + 1 : 0;
    const stack: number[] = [];
    for (let x = 0; x <= w; x++) {
      const cur = x < w ? heights[x] : 0;
      while (stack.length && heights[stack[stack.length - 1]] >= cur) {
        const ht = heights[stack.pop()!];
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        const area = ht * (x - left);
        if (area > best.area) best = { area, x0: left, x1: x - 1, y0: y - ht + 1, y1: y };
      }
      stack.push(x);
    }
  }
  const mm = (p: number) => (p / dpi) * 25.4;
  const pageW = mm(w);
  const pageH = mm(h);
  return {
    top: Math.ceil(mm(best.y0)),
    bottom: Math.ceil(pageH - mm(best.y1)),
    side: Math.max(Math.ceil(mm(best.x0)), Math.ceil(pageW - mm(best.x1))),
    usable: `${mm(best.x1 - best.x0).toFixed(0)} x ${mm(best.y1 - best.y0).toFixed(0)}mm`,
  };
}

let margins = { top: 16, bottom: 16, side: 16, usable: "(not measured)" };
if (topArg && bottomArg && sideArg) {
  margins = { top: +topArg, bottom: +bottomArg, side: +sideArg, usable: "(given on the command line)" };
} else if (ext === ".pdf") {
  margins = await measureMargins(new Uint8Array(fs.readFileSync(file)));
  console.log(`Measured the empty area: ${margins.usable} of usable space.`);
}

const data = {
  letterheadImage: bytes,
  letterheadMime: mime!,
  letterheadName: name,
  letterheadUpdatedAt: new Date(),
  mode: "IMAGE" as const,
  marginTopMm: margins.top,
  marginBottomMm: margins.bottom,
  marginSideMm: margins.side,
  dateFieldXMm: dateField?.xMm ?? null,
  dateFieldYMm: dateField?.yMm ?? null,
};

await prisma.businessSettings.upsert({
  where: { id: "default" },
  create: { id: "default", ...data },
  update: data,
});

console.log("");
console.log(`Stored ${name} — ${(bytes.length / 1024).toFixed(0)} KB${widthPx ? `, ${widthPx}x${heightPx}px` : ""}`);
console.log(`Mode: IMAGE   Margins: top ${margins.top}mm · bottom ${margins.bottom}mm · sides ${margins.side}mm`);
if (dateField) {
  console.log(`Date rule found at ${dateField.xMm}mm, ${dateField.yMm}mm — the document date prints there.`);
}
console.log("Bills, challans and statements will now print on this letterhead.");

await prisma.$disconnect();
