/**
 * Verification for the letterhead / business settings.
 *
 *   npm run verify:letterhead
 *
 * Covers the two things that decide what actually comes out of the printer —
 * whether artwork is drawn and whether the app prints its own text header — plus
 * the round-trip of image bytes through Postgres, which is the part that would
 * silently corrupt a letterhead if it were wrong.
 *
 * Runs against the real database inside ONE interactive transaction that is
 * always rolled back, so the shop's own settings row is never touched.
 *
 * NOT covered: the server actions' auth/validation and the print CSS. Actions
 * live in "use server" files a script cannot import, and the fixed-position
 * print layer only exists once a browser paginates it.
 */
import "dotenv/config";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const isLocal = ["localhost", "127.0.0.1", "::1"].includes(new URL(url!).hostname);
process.env.DATABASE_URL = url;

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: url,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  }),
});

const { drawsArtwork, drawsTextHeader, contactLine, letterheadSrc, dateFieldOf } = await import(
  "../src/lib/letterhead.js"
);
const { pdfToLetterheadPng } = await import("../src/lib/pdf-letterhead.js");

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`  PASS  ${label} = ${a}`);
  else {
    failures++;
    console.error(`  FAIL  ${label}\n        expected ${e}\n        got      ${a}`);
  }
}

type Settings = Parameters<typeof drawsArtwork>[0];
const base: Settings = {
  name: "Shabbir Tools",
  tagline: null,
  address: null,
  phone: null,
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

class Rollback extends Error {}
const TAG = `vlh-${Date.now()}`;

// --- 1. what gets drawn -----------------------------------------------------
// The two booleans between them decide the whole printed header, so every
// combination is pinned down here rather than discovered on the shop's printer.
console.log("\n1. What actually gets drawn");
check("no letterhead: app draws its own text header", drawsTextHeader(base), true);
check("no letterhead: no artwork", drawsArtwork(base), false);

const imageOn: Settings = { ...base, mode: "IMAGE", hasImage: true };
check("letterhead uploaded and on: artwork drawn", drawsArtwork(imageOn), true);
check("...and the text header is suppressed, not printed twice", drawsTextHeader(imageOn), false);

// The dangerous case: mode says IMAGE but the image was removed. Falling back to
// the text header is right — a blank space where the shop's name belongs is worse.
const imageMissing: Settings = { ...base, mode: "IMAGE", hasImage: false };
check("IMAGE mode with nothing uploaded: no artwork", drawsArtwork(imageMissing), false);
check("...and the text header comes back rather than a blank space", drawsTextHeader(imageMissing), true);

const preprinted: Settings = { ...base, mode: "PREPRINTED" };
check("pre-printed pads: app draws nothing at all", [drawsArtwork(preprinted), drawsTextHeader(preprinted)], [false, false]);

// --- 2. small helpers -------------------------------------------------------
console.log("\n2. Header text and image URL");
check("contact line skips what the shop has not filled in", contactLine({ ...base, phone: "0300-1234567" }), "0300-1234567");
check(
  "both present are joined",
  contactLine({ ...base, address: "Shahalam Market, Lahore", phone: "0300-1234567" }),
  "Shahalam Market, Lahore · 0300-1234567"
);
check("nothing filled in gives an empty line, not a stray separator", contactLine(base), "");
// The filename never changes, so without the version token a replaced
// letterhead would keep showing the old artwork out of the browser cache.
check("image URL carries a cache-busting version", letterheadSrc({ ...imageOn, imageVersion: "1755300000000" }), "/api/letterhead?v=1755300000000");
check("...and a safe default when nothing was ever uploaded", letterheadSrc(base), "/api/letterhead?v=0");

// The letterhead's own "Date: ____" rule. Stationery leaves it blank for someone
// to write in; when the app prints the document it knows the answer, so it fills
// it and drops the date from its own header rather than contradicting itself.
const dated = { ...imageOn, dateFieldXMm: 180, dateFieldYMm: 44 };
check("a detected Date rule is used", dateFieldOf(dated), { xMm: 180, yMm: 44 });
check("no Date rule on the artwork: the document keeps its own date", dateFieldOf(imageOn), null);
// Guard rails: never print a date onto paper that has no artwork on it.
check("no artwork means no date field, even if coordinates linger", dateFieldOf({ ...dated, mode: "NONE" }), null);
check("...same when the image was removed", dateFieldOf({ ...dated, hasImage: false }), null);
check("pre-printed pads: the app does not print onto the shop's own rule", dateFieldOf({ ...dated, mode: "PREPRINTED" }), null);

// --- 3. bytes survive the round trip ---------------------------------------
console.log("\n3. Image bytes through Postgres");
try {
  await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      // A byte pattern that would break under any accidental text/utf-8 handling.
      const original = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe, 0x7f, 0x80, 0x0d, 0x0a, 0x1a]);

      await tx.businessSettings.create({
        data: {
          id: TAG,
          name: `${TAG} shop`,
          letterheadImage: original,
          letterheadMime: "image/png",
          letterheadName: "letterhead.png",
          letterheadUpdatedAt: new Date(),
          mode: "IMAGE",
        },
      });

      const back = await tx.businessSettings.findUniqueOrThrow({ where: { id: TAG } });
      check("bytes come back byte-for-byte", Buffer.from(back.letterheadImage!).equals(original), true);
      check("length is unchanged", back.letterheadImage!.length, original.length);
      check("mime type is kept, so the browser renders it", back.letterheadMime, "image/png");

      // Removing the artwork must also drop the mode, otherwise the settings say
      // "print the letterhead" while there is nothing to print.
      await tx.businessSettings.update({
        where: { id: TAG },
        data: { letterheadImage: null, letterheadMime: null, letterheadName: null, letterheadUpdatedAt: null, mode: "NONE" },
      });
      const cleared = await tx.businessSettings.findUniqueOrThrow({ where: { id: TAG } });
      check("removing clears the image and the mode together", [cleared.letterheadImage, cleared.mode], [null, "NONE"]);

      // Defaults matter: a shop that never opens this screen still prints.
      await tx.businessSettings.create({ data: { id: `${TAG}-2`, name: `${TAG} fresh` } });
      const fresh = await tx.businessSettings.findUniqueOrThrow({ where: { id: `${TAG}-2` } });
      check(
        "a fresh row defaults to no letterhead and 16mm margins",
        [fresh.mode, fresh.marginTopMm, fresh.marginBottomMm, fresh.marginSideMm],
        ["NONE", 16, 16, 16]
      );

      throw new Rollback();
    },
    { maxWait: 15_000, timeout: 60_000 }
  );
} catch (e) {
  if (!(e instanceof Rollback)) throw e;
}

// --- 4. PDF letterheads are cropped to the trim, not squashed ---------------
// The client's own letterhead arrived from a print shop as a 216x303mm PDF: A4
// plus a 3mm bleed on every edge. Rendering that whole page onto A4 would shrink
// the design ~3% and print the strip meant to be guillotined off — wrong in a
// way that looks almost right. Fixtures are built inline so this check never
// depends on anyone's file being present on disk.
console.log("\n4. PDF conversion");

function miniPdf(media: string, trim?: string): Uint8Array {
  const boxes = `/MediaBox [${media}]` + (trim ? ` /TrimBox [${trim}]` : "");
  const content = "0 0 1 rg 20 20 60 60 re f";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R ${boxes} /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.7\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += String(o).padStart(10, "0") + " 00000 n \n";
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

// 200x400pt page, trim inset 10pt on every side -> 180x380pt of finished paper.
const bled = await pdfToLetterheadPng(miniPdf("0 0 200 400", "10 10 190 390"), 72);
check("a plain PDF has no Date rule to find", bled.dateField, null);
check("a bleed PDF is cropped to its TrimBox", [bled.widthPx, bled.heightPx], [180, 380]);
check("...and reports how much it trimmed", bled.bleedMm, Math.round((10 / 72) * 25.4 * 10) / 10);
check("the output really is a PNG", bled.png.subarray(0, 4).toString("hex"), "89504e47");

// No TrimBox: crop nothing rather than invent a number.
const plain = await pdfToLetterheadPng(miniPdf("0 0 200 400"), 72);
check("a PDF with no TrimBox is left uncropped", [plain.widthPx, plain.heightPx], [200, 400]);
check("...and reports no bleed", plain.bleedMm, 0);

// DPI must scale the raster, never the paper.
const hi = await pdfToLetterheadPng(miniPdf("0 0 200 400", "10 10 190 390"), 144);
check("doubling DPI doubles the pixels", [hi.widthPx, hi.heightPx], [360, 760]);
check("...but the physical size is unchanged", [hi.widthMm, hi.heightMm], [bled.widthMm, bled.heightMm]);

// Anything that is not a PDF must throw, so the action can answer in plain words
// instead of storing a broken image.
let threw = false;
try {
  await pdfToLetterheadPng(new TextEncoder().encode("this is not a pdf"), 72);
} catch {
  threw = true;
}
check("a file that is not a PDF is rejected, not half-rendered", threw, true);

const leftover = await prisma.businessSettings.count({ where: { id: { startsWith: "vlh-" } } });
check("\nno fixture data left behind", leftover, 0);

await prisma.$disconnect();
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
