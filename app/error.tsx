"use client";

/**
 * Global error boundary. Rendered by the root layout, so it must supply its
 * own <html>/<body> and cannot rely on the nav or banner.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "Arial, Helvetica, sans-serif",
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          padding: "2rem",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: "32rem" }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#555", marginBottom: "1rem" }}>
            The page could not be loaded. This does not affect the
            &ldquo;Simulated demo data&rdquo; notice — no real project data is
            shown anywhere in this app.
          </p>
          {error.digest ? (
            <p
              style={{
                color: "#777",
                fontFamily: "monospace",
                fontSize: "0.75rem",
                marginBottom: "1rem",
              }}
            >
              Reference: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "0.5rem 1rem",
              border: "1px solid #999",
              borderRadius: "4px",
              background: "transparent",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
