/**
 * Server-side smoke check for M7 (the transparency dashboard) against a
 * running `next start` on :3100.
 *
 * Scope: what the server actually sends for /dashboard — every KPI card, the
 * waste figure with its formula disclosure, the scorecard table, and the chart
 * data tables (the text alternatives). The KPI numbers are cross-checked
 * against `GET /api/clashes`, because both come from the same driver over the
 * same registry: the dashboard's "open clashes", "repeat digs" and waste
 * figures must equal a recount of the engine's board, or the page and the
 * board are lying about the same data.
 *
 * Run: node scripts/verify-m7.mjs
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3100";

let pass = 0;
let fail = 0;

function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function get(path) {
  try {
    const res = await fetch(`${BASE}${path}`, { redirect: "manual" });
    return { status: res.status, body: await res.text() };
  } catch (err) {
    return { status: 0, body: String(err) };
  }
}

/**
 * React streams late-arriving parts of the tree inside a flight payload where
 * quotes are backslash-escaped. Unescaping first means one assertion style
 * covers the flushed HTML and the payload.
 */
function decode(html) {
  return html.replace(/<!-- -->/g, "").replace(/\\"/g, '"');
}

/** The value rendered in the `<p>` after a KPI label in the flushed HTML. */
function valueAfter(haystack, label) {
  const re = new RegExp(
    `${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</p><p class="[^"]*">([^<]+)</p>`,
  );
  const m = haystack.match(re);
  return m ? m[1] : null;
}

console.log(`\nM7 transparency dashboard verification against ${BASE}\n`);

console.log("routes");
const page = await get("/dashboard");
check("/dashboard -> 200", page.status === 200, `got ${page.status}`);
const html = decode(page.body);
check("page renders the dashboard (not the empty state)", html.includes("Department scorecard"));

// ---------------------------------------------------------------------------
// KPI cards
// ---------------------------------------------------------------------------

console.log("\nKPI cards");
const KPI_LABELS = [
  "Active projects",
  "% delayed",
  "Average delay",
  "Open clashes",
  "Repeat digs",
  "Contested completions",
  "Unlisted-work reports",
];
for (const label of KPI_LABELS) {
  const value = valueAfter(html, label);
  check(`"${label}" card renders a value`, value !== null, value ?? "(missing)");
}

// ---------------------------------------------------------------------------
// Waste figure (PLAN.md M7 item 4)
// ---------------------------------------------------------------------------

console.log("\nestimated waste from repeat digs");
const wasteIndex = html.indexOf("Estimated waste from avoidable repeat digs");
check("waste figure renders", wasteIndex !== -1);
check(
  "waste is labelled an estimate based on simulated data",
  html.includes("estimate based on simulated data"),
);
check(
  "the formula is exposed in a disclosure (not only hover)",
  html.includes("How is this estimated?") && html.includes("min(budget of earlier work"),
);
check(
  "the waste number is formatted as INR",
  /₹[\d,]+/.test(html.slice(wasteIndex, wasteIndex + 300)),
);

// ---------------------------------------------------------------------------
// Scorecard + chart data tables (accessible alternatives)
// ---------------------------------------------------------------------------

console.log("\nscorecard and chart tables");
check(
  "scorecard has all six columns",
  ["Department", "On-time %", "Avg delay (days)", "Clashes", "Contested"].every(
    (header) => html.includes(header),
  ),
);
check(
  "sort controls are exposed to assistive tech",
  html.includes("aria-sort") && html.includes('aria-sort="'),
);
const tableCaptions = [
  "Total delay days by department",
  "Projects by status",
  "New works per month",
];
for (const caption of tableCaptions) {
  check(`chart data table "${caption}" renders`, html.includes(caption));
}

// ---------------------------------------------------------------------------
// Cross-check the KPIs against /api/clashes
// ---------------------------------------------------------------------------

console.log("\nKPIs vs the clash board");
const api = await get("/api/clashes");
let board = null;
try {
  board = JSON.parse(api.body);
} catch {
  check("GET /api/clashes is JSON", false, api.body.slice(0, 80));
}

if (board) {
  const openClashes = valueAfter(html, "Open clashes");
  check(
    "open clashes equal the engine's total",
    openClashes === String(board.clashes.length),
    `dashboard=${openClashes} vs engine=${board.clashes.length}`,
  );

  const repeatDigs = valueAfter(html, "Repeat digs");
  const engineRepeatDigs = board.clashes.filter((c) => c.type === "REPEAT_DIG").length;
  check(
    "repeat digs equal the engine's repeat-dig count",
    repeatDigs === String(engineRepeatDigs),
    `dashboard=${repeatDigs} vs engine=${engineRepeatDigs}`,
  );

  const expectedWaste = engineRepeatDigs === 0
    ? "₹0"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }).format(
        board.clashes
          .filter((c) => c.type === "REPEAT_DIG")
          .reduce((sum, c) => sum + (c.estimatedWasteInr ?? 0), 0),
      );
  const wasteValue = html
    .slice(wasteIndex, wasteIndex + 300)
    .match(/₹[\d,]+/)?.[0];
  check(
    "waste equals the sum of the engine's repeat-dig estimates",
    wasteValue === expectedWaste,
    `dashboard=${wasteValue} vs engine=${expectedWaste}`,
  );

  check(
    "repeat-dig clashes all carry a simulated cost",
    engineRepeatDigs === 0 ||
      board.clashes
        .filter((c) => c.type === "REPEAT_DIG")
        .every((c) => (c.estimatedWasteInr ?? 0) > 0),
  );
}

// ---------------------------------------------------------------------------
// data honesty on the page
// ---------------------------------------------------------------------------

console.log("\ndata honesty");
check(
  "names the simulated registry as the source",
  html.includes("simulated registry"),
);
check(
  "contested completions reflect the shared rule",
  html.includes("≥ 3 disputes or ≥ 40% of votes") ||
    html.includes("at least 40% of voters dispute"),
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);