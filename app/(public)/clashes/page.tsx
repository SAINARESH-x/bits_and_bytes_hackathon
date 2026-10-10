import { ClashesScreen } from "@/components/clashes-screen";
import { ClashBoardSkeleton } from "@/components/states";
import { Suspense } from "react";
import { loadClashBoard, summarizeBoard } from "@/lib/clashes";

export const metadata = { title: "Clash board — DigSync" };

// The data-mode selection reads env at request time, so this page must never
// be statically cached at build time.
export const dynamic = "force-dynamic";

/**
 * Server shell for the clash board. The engine runs here, once, over the whole
 * registry — the client only filters and re-reads the API, so the first paint
 * is already the real answer rather than a spinner.
 */
export default async function ClashesPage() {
  const board = await loadClashBoard();

  return (
    <Suspense fallback={<ClashBoardSkeleton />}>
      <ClashesScreen initial={summarizeBoard(board)} />
    </Suspense>
  );
}
