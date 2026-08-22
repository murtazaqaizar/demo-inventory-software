// The A4 sheet every printed document sits on, with the shop's letterhead
// behind it.
//
// Two things here are less obvious than they look:
//
// 1. The artwork is a real <img>, never a CSS background. Browsers drop
//    background images from printouts unless the user ticks "Background
//    graphics" in the print dialog, which shop staff will not do. An <img>
//    always prints.
//
// 2. It is `position: fixed`, which in print means it repaints on EVERY page —
//    so a bill that runs onto a second sheet still lands on letterhead. A fixed
//    element is positioned against the page's content box (inside the @page
//    margins), so it is pulled back out by exactly those margins and sized to
//    the full 210x297mm sheet. That is what lets the artwork bleed to the paper
//    edge while the text stays inside the margins.
//
// The margins come from settings because every letterhead puts its logo and
// footer somewhere different, and the owner needs to nudge the text clear of
// them without waiting for a code change.

import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  dateFieldOf,
  drawsArtwork,
  letterheadSrc,
  type BusinessSettings,
} from "@/lib/letterhead";

export function PrintSheet({
  settings,
  documentDate,
  children,
}: {
  settings: BusinessSettings;
  /**
   * The document's own date. Printed onto the letterhead's "Date: ____" rule
   * when the artwork has one — stationery leaves that blank for someone to
   * write in, and the app knows the answer.
   */
  documentDate?: Date;
  children: React.ReactNode;
}) {
  const { marginTopMm: top, marginBottomMm: bottom, marginSideMm: side } = settings;
  const artwork = drawsArtwork(settings);
  const dateField = dateFieldOf(settings);
  const showDate = Boolean(dateField && documentDate);

  return (
    <>
      <style>{`
        @page { size: A4; margin: ${top}mm ${side}mm ${bottom}mm; }
        @media print {
          .letterhead-layer {
            display: block !important;
            position: fixed;
            top: -${top}mm;
            left: -${side}mm;
            width: ${A4_WIDTH_MM}mm;
            height: ${A4_HEIGHT_MM}mm;
            z-index: -1;
          }
          /* The sheet is forced opaque white for print in globals.css, which
             would paint straight over the artwork behind it. */
          .print-sheet.has-letterhead { background: transparent !important; }
          /* Fixed like the artwork, so it lands on the rule on every page. */
          .letterhead-date {
            position: fixed;
            top: ${dateField ? dateField.yMm - top : 0}mm;
            left: ${dateField ? dateField.xMm - side : 0}mm;
          }
        }
      `}</style>

      <div className="relative mx-auto max-w-[794px]">
        {artwork && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={letterheadSrc(settings)}
            alt=""
            aria-hidden="true"
            // On screen it fills the preview sheet; the print rules above take
            // over the positioning when it actually goes to paper.
            className="letterhead-layer pointer-events-none absolute inset-0 h-full w-full"
          />
        )}
        {showDate && (
          <span
            className="letterhead-date absolute z-10 whitespace-nowrap text-[10pt] leading-none text-black"
            style={{ top: `${dateField!.yMm}mm`, left: `${dateField!.xMm}mm` }}
          >
            {documentDate!.toLocaleDateString("en-PK", { year: "numeric", month: "short", day: "numeric" })}
          </span>
        )}
        <div
          className={`print-sheet relative bg-transparent p-8 text-ink ${
            artwork ? "has-letterhead" : "rounded-panel border border-line bg-surface shadow-sm"
          }`}
          style={
            // On screen, mirror the paper's proportions so what the owner sees
            // in the preview is what comes out of the printer.
            artwork
              ? { minHeight: `calc(794px * ${A4_HEIGHT_MM} / ${A4_WIDTH_MM})`, padding: `${top}mm ${side}mm ${bottom}mm` }
              : undefined
          }
        >
          {children}
        </div>
      </div>
    </>
  );
}
