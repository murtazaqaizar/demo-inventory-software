"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label, Panel, Select } from "@/components/ui";
import {
  A4_HEIGHT_MM,
  A4_WIDTH_MM,
  drawsArtwork,
  letterheadSrc,
  type BusinessSettings,
} from "@/lib/letterhead";
import {
  removeLetterhead,
  saveBusinessInfo,
  saveLetterheadLayout,
  uploadLetterhead,
} from "./actions";

type Note = { kind: "ok" | "bad"; text: string } | null;

const MODE_HELP: Record<string, string> = {
  NONE: "No letterhead. Documents print the shop name and address as text, the way they do now.",
  IMAGE: "Print the uploaded artwork onto blank paper. Use this for printing at the shop on plain A4.",
  PREPRINTED:
    "You already have letterhead pads from a press. Nothing is printed at the top — the margins below just keep the text clear of what is already on the paper.",
};

export function SettingsForms({ settings }: { settings: BusinessSettings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<Note>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Held in state so the preview moves as the owner types, before anything is
  // saved — finding the right margins for a letterhead is pure trial and error.
  const [mode, setMode] = useState<BusinessSettings["mode"]>(settings.mode);
  const [top, setTop] = useState(String(settings.marginTopMm));
  const [bottom, setBottom] = useState(String(settings.marginBottomMm));
  const [side, setSide] = useState(String(settings.marginSideMm));

  const preview: BusinessSettings = {
    ...settings,
    mode,
    marginTopMm: Number(top) || 0,
    marginBottomMm: Number(bottom) || 0,
    marginSideMm: Number(side) || 0,
  };

  function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setNote(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setNote({ kind: "ok", text: res.message ?? "Saved." });
        router.refresh();
      } else {
        setNote({ kind: "bad", text: res.error ?? "That did not save." });
      }
    });
  }

  return (
    <div className="space-y-6">
      {note && (
        <p
          className={`rounded-control border px-3 py-2 text-[15px] ${
            note.kind === "ok"
              ? "border-ok/30 bg-ok-soft text-ok"
              : "border-bad/30 bg-bad-soft text-bad"
          }`}
        >
          {note.text}
        </p>
      )}

      {/* --- Shop details ---------------------------------------------------- */}
      <Panel pad>
        <h2 className="font-semibold text-ink">Shop details</h2>
        <p className="mb-4 text-[13px] text-ink-muted">
          Used on documents when there is no letterhead, and in the WhatsApp message either way.
        </p>
        <form
          action={(fd) => run(() => saveBusinessInfo(fd))}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <div>
            <Label htmlFor="name">Shop name</Label>
            <Input id="name" name="name" defaultValue={settings.name} required />
          </div>
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              name="phone"
              defaultValue={settings.phone ?? ""}
              placeholder="03xx-xxxxxxx"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="tagline">Line under the name</Label>
            <Input
              id="tagline"
              name="tagline"
              defaultValue={settings.tagline ?? ""}
              placeholder="Hardware, tools and industrial supplies"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              name="address"
              defaultValue={settings.address ?? ""}
              placeholder="Shop address, city"
            />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save shop details"}
            </Button>
          </div>
        </form>
      </Panel>

      {/* --- Letterhead file -------------------------------------------------- */}
      <Panel pad>
        <h2 className="font-semibold text-ink">Letterhead image</h2>
        <p className="mb-4 text-[13px] text-ink-muted">
          The PDF from your printer, or a PNG/JPG. One A4 page, portrait — header artwork at the
          top, footer at the bottom, empty in the middle where the bill goes. A PDF is converted to
          an image here, and if it was made with bleed the extra is trimmed off automatically.
        </p>

        {settings.hasImage ? (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-control border border-line bg-surface-alt px-3 py-2 text-[15px]">
            <span className="text-ink">
              Current file:{" "}
              <span className="font-medium">{settings.letterheadName ?? "letterhead"}</span>
            </span>
            <Button
              type="button"
              variant="secondary"
              className="px-3 py-1.5"
              disabled={pending}
              onClick={() => run(() => removeLetterhead())}
            >
              Remove
            </Button>
          </div>
        ) : (
          <p className="mb-4 text-sm text-ink-muted">Nothing uploaded yet.</p>
        )}

        <form
          action={(fd) => {
            run(() => uploadLetterhead(fd));
            if (fileRef.current) fileRef.current.value = "";
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <div>
            <Label htmlFor="file">{settings.hasImage ? "Replace it" : "Upload"}</Label>
            <input
              ref={fileRef}
              id="file"
              name="file"
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              required
              className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-2 file:text-sm file:text-white"
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Uploading…" : "Upload"}
          </Button>
        </form>
      </Panel>

      {/* --- Layout + preview -------------------------------------------------- */}
      <Panel pad>
        <h2 className="font-semibold text-ink">How documents print</h2>
        <p className="mb-4 text-[13px] text-ink-muted">
          Change the margins until the preview keeps the text clear of your artwork, then save.
        </p>

        <form
          action={(fd) => run(() => saveLetterheadLayout(fd))}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <Label htmlFor="mode">Letterhead</Label>
            <Select
              id="mode"
              name="mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as BusinessSettings["mode"])}
            >
              <option value="NONE">No letterhead — plain header</option>
              <option value="IMAGE">Print my uploaded letterhead</option>
              <option value="PREPRINTED">I print on pre-printed letterhead paper</option>
            </Select>
            <p className="mt-1.5 text-[13px] text-ink-muted">{MODE_HELP[mode]}</p>
            {mode === "IMAGE" && !settings.hasImage && (
              <p className="mt-1.5 text-[13px] text-bad">
                Upload an image above before saving this option.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="marginTopMm">Space at top (mm)</Label>
            <Input
              id="marginTopMm"
              name="marginTopMm"
              type="number"
              min={0}
              max={80}
              value={top}
              onChange={(e) => setTop(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="marginBottomMm">Space at bottom (mm)</Label>
            <Input
              id="marginBottomMm"
              name="marginBottomMm"
              type="number"
              min={0}
              max={80}
              value={bottom}
              onChange={(e) => setBottom(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="marginSideMm">Space at left & right (mm)</Label>
            <Input
              id="marginSideMm"
              name="marginSideMm"
              type="number"
              min={0}
              max={60}
              value={side}
              onChange={(e) => setSide(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save page layout"}
            </Button>
          </div>
        </form>

        <div className="mt-6 border-t border-line pt-5">
          <p className="mb-3 text-xs font-medium text-ink-muted">Preview — one A4 page</p>
          <SheetPreview settings={preview} />
        </div>
      </Panel>
    </div>
  );
}

/**
 * A scale drawing of the printed page: the artwork behind, and a hatched band
 * showing where the document's text will start and stop. Everything is a
 * percentage of A4, so it stays honest at any preview width.
 */
function SheetPreview({ settings }: { settings: BusinessSettings }) {
  const pct = (mm: number, of: number) => `${(mm / of) * 100}%`;
  const artwork = drawsArtwork(settings);

  return (
    <div
      className="relative mx-auto w-full max-w-[320px] overflow-hidden border border-line-strong bg-white shadow-sm"
      style={{ aspectRatio: `${A4_WIDTH_MM} / ${A4_HEIGHT_MM}` }}
    >
      {artwork && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={letterheadSrc(settings)}
          alt="Letterhead preview"
          className="absolute inset-0 h-full w-full"
        />
      )}
      <div
        className="absolute border border-dashed border-accent/70 bg-accent-soft"
        style={{
          top: pct(settings.marginTopMm, A4_HEIGHT_MM),
          bottom: pct(settings.marginBottomMm, A4_HEIGHT_MM),
          left: pct(settings.marginSideMm, A4_WIDTH_MM),
          right: pct(settings.marginSideMm, A4_WIDTH_MM),
        }}
      >
        <span className="absolute left-1 top-1 text-[9px] font-medium text-accent">
          document text goes here
        </span>
      </div>
    </div>
  );
}
