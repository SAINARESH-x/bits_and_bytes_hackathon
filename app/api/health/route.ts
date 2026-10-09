import { NextResponse } from "next/server";
import { getDataMode } from "@/lib/data";

// Always evaluate per request — mode depends on env and must never be cached.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      mode: getDataMode(),
      timestamp: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
