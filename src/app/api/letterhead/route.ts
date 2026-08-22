// Serves the uploaded letterhead artwork.
//
// It lives in Postgres (see prisma/schema.prisma) rather than on disk, so this
// route is how the <img> on a print page gets at it. Signed-in users only — the
// letterhead is the shop's branding, not public content.
//
// Callers add ?v=<timestamp> so a newly uploaded letterhead is fetched
// immediately while the bytes themselves cache hard.

import { prisma } from "@/lib/prisma";
import { requireUserApi } from "@/lib/guards";
import { SETTINGS_ID } from "@/lib/settings";

export async function GET() {
  await requireUserApi();

  const row = await prisma.businessSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { letterheadImage: true, letterheadMime: true },
  });

  if (!row?.letterheadImage || !row.letterheadMime) {
    return new Response("No letterhead uploaded", { status: 404 });
  }

  return new Response(new Uint8Array(row.letterheadImage), {
    headers: {
      "Content-Type": row.letterheadMime,
      "Content-Length": String(row.letterheadImage.length),
      // Private: it is behind a login. Immutable is safe because the URL carries
      // the upload timestamp — a new upload is a different URL.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
