// Shown for an unknown URL, and whenever a page calls notFound() — an invoice,
// purchase, customer or product id that doesn't exist, usually because the
// record was deleted or a link is out of date.

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-md rounded-panel border border-line bg-surface p-6">
        <h1 className="text-lg font-semibold text-ink">Not found</h1>
        <p className="mt-2 text-[15px] text-ink-muted">
          This page doesn&apos;t exist, or the record it points to has been deleted.
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex h-10 items-center rounded-control bg-accent px-5 text-[15px] font-semibold text-white transition-colors duration-150 hover:bg-accent-hover"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
