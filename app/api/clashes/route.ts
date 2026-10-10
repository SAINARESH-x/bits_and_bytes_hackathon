import { NextResponse } from "next/server";
import { loadClashBoard, summarizeBoard } from "@/lib/clashes";

/**
 * GET /api/clashes — the computed clash board, as JSON.
 *
 * The pages compute their board in-process (a pure function over rows they
 * already have), so this route exists for the "refresh" action and for anyone
 * who wants the engine's output without a browser. Both paths run the same
 * `summarizeBoard`, so the JSON and the HTML cannot disagree.
 *
 * `revalidate` is a literal because Next reads route segment config
 * statically, and 60 s is the caching horizon chosen in lib/clashes.ts.
 * Detection is a pure function of the registry, so caching for a minute only
 * avoids repeated work — it never serves a stale answer for changed data.
 */
export const revalidate = 60;

export async function GET() {
  try {
    const board = await loadClashBoard();
    const payload = summarizeBoard(board);

    return NextResponse.json(payload, {
      headers: {
        "cache-control":
          "public, s-maxage=60, stale-while-revalidate=300, max-age=0",
      },
    });
  } catch (error) {
    // The data layer already falls back to demo mode, so reaching here means
    // the seed itself is unreadable. Say so instead of returning a 500 page:
    // the client shows the last board it had plus this message.
    return NextResponse.json(
      {
        error: "clash_board_unavailable",
        message:
          "The clash board could not be computed. The registry did not respond.",
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 503 },
    );
  }
}
