"use client";

// Last line of defence: an error in the root layout itself, where the normal
// error boundary and the app's own styling aren't available. This replaces the
// whole document, so it ships its own <html>/<body> and inline styles.

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Fatal error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f4f1ea",
          fontFamily: "'IBM Plex Sans', system-ui, -apple-system, Segoe UI, sans-serif",
          color: "#1a1814",
        }}
      >
        <div
          style={{
            maxWidth: 460,
            padding: 28,
            background: "#ffffff",
            border: "1px solid #e6e0d5",
            borderRadius: 14,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>The app couldn&apos;t start</h1>
          <p style={{ marginTop: 10, fontSize: 15, color: "#5f584c", lineHeight: 1.5 }}>
            Something failed before the page could load. Your data is safe — nothing is saved from
            this screen.
          </p>
          <p style={{ marginTop: 10, fontSize: 15, color: "#5f584c", lineHeight: 1.5 }}>
            Reload the page. If it still fails, check your internet connection.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 18,
              padding: "9px 16px",
              fontSize: 15,
              fontWeight: 600,
              color: "#fff",
              background: "#0f5f6b",
              border: "none",
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          {error.digest && (
            <p style={{ marginTop: 18, fontSize: 13, color: "#8f8778" }}>
              Reference {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
