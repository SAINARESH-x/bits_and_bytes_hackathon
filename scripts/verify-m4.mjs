/**
 * Server-side smoke check for M4 (the clash board) against a running
 * `next start` on :3100.
 *
 * Scope: what the server actually sends — the /clashes HTML, the cached
 * `GET /api/clashes` JSON, the derived badges on /map and /projects, and the
 * clash section on a project page. The interactivity (severity filter buttons,
 * the Refresh button, the lazy Leaflet mini-maps) is covered separately in
 * scripts/verify-browser.mjs.
 *
 * Run: node scripts/verify-m4.mjs
 */
const BASE = process.env.BASE_URL ?? "http://localhost:3100";

// Seed anchors used below. All data is simulated; these are fixed ids from
// data/seed.json so the assertions cannot drift with the fixture.
const SEGMENT_AMBER = "b0000002-0000-4000-8000-000000000004";
const PROJECT_AMBER_WATER = "c0000003-0000-4000-8000-000000000007"; // completed first
const PROJECT_AMBER_POWER = "c0000003-0000-4000-8000-000000000008"; // digs it up again

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

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
    return { status: res.status, headers: res.headers, body: await res.text() };
  } catch (err) {
    return { status: 0, headers: new Headers(), body: String(err) };
  }
}

/**
 * React streams late-arriving parts of the tree inside a flight payload where
 * `<`, `>`, `&` and `"` are `\uXXXX`-escaped, and separates adjacent text nodes
 * with `<!-- -->`. Decoding first means one assertion style covers the flushed
 * HTML and the payload.
 */
function decode(html) {
  return html
    .replace(/<!-- -->/g, "")
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">")
    .replace(/\\u0026/g, "&")
    .replace(/\\u0022/g, '"')
    .replace(/\\u0027/g, "'");
}

const count = (haystack, needle) => haystack.split(needle).length - 1;

console.log(`\nM4 clash-board verification against ${BASE}\n`);

// ---------------------------------------------------------------------------
// routes
// ---------------------------------------------------------------------------

console.log("routes");
const clashesPage = await get("/clashes");
check("/clashes -> 200", clashesPage.status === 200, `got ${clashesPage.status}`);
const clashesHtml = decode(clashesPage.body);

// ---------------------------------------------------------------------------
// GET /api/clashes
// ---------------------------------------------------------------------------

console.log("\nGET /api/clashes");
const api = await get("/api/clashes");
check("api -> 200", api.status === 200, `got ${api.status}`);
check(
  "api is served from a shared cache",
  /s-maxage=\d+/.test(api.headers.get("cache-control") ?? ""),
  api.headers.get("cache-control") ?? "(no cache-control)",
);

let board = null;
try {
  board = JSON.parse(api.body);
} catch (err) {
  check("api body is JSON", false, String(err));
}

if (board) {
  check("api body is JSON", true);
  check(
    "payload carries clashes, clusters and skipped",
    Array.isArray(board.clashes) &&
      Array.isArray(board.clusters) &&
      Array.isArray(board.skipped),
  );
  check(
    "payload carries the registry needed to render each clash",
    Array.isArray(board.projects) &&
      board.projects.length > 0 &&
      Array.isArray(board.segments) &&
      board.segments.length > 0 &&
      Array.isArray(board.departments) &&
      board.departments.length > 0,
    `${board.projects?.length} projects / ${board.segments?.length} segments`,
  );
  check("timestamp is reported", typeof board.generatedAt === "string");

  const counts = board.counts ?? {};
  check(
    "counts.total equals the number of clashes",
    counts.total === board.clashes.length,
    `${counts.total} vs ${board.clashes.length}`,
  );
  check(
    "severity bands sum to the total",
    counts.high + counts.medium + counts.low === counts.total,
    `${counts.high}/${counts.medium}/${counts.low}`,
  );
  check(
    "severity bands match a recount of the array",
    counts.high === board.clashes.filter((c) => c.severity === "high").length &&
      counts.medium === board.clashes.filter((c) => c.severity === "medium").length &&
      counts.low === board.clashes.filter((c) => c.severity === "low").length,
  );
  check(
    "cluster and skipped counts match their arrays",
    counts.clusters === board.clusters.length &&
      counts.skipped === board.skipped.length,
    `${counts.clusters}/${counts.skipped}`,
  );

  check(
    "every clash uses one of the two documented rules",
    board.clashes.every(
      (c) => c.type === "CONCURRENT_OVERLAP" || c.type === "REPEAT_DIG",
    ),
  );
  check(
    "every clash has an explanation and a suggestion",
    board.clashes.every(
      (c) =>
        typeof c.explanation === "string" &&
        c.explanation.length > 0 &&
        typeof c.suggestion === "string" &&
        c.suggestion.length > 0,
    ),
  );
  check(
    "every clash names two different projects",
    board.clashes.every((c) => c.projectA.id !== c.projectB.id),
  );
  check(
    "no unordered pair appears twice",
    new Set(
      board.clashes.map((c) => [c.projectA.id, c.projectB.id].sort().join("|")),
    ).size === board.clashes.length,
  );
  check(
    "overlaps report overlapDays and repeat digs report gapDays",
    board.clashes.every((c) =>
      c.type === "CONCURRENT_OVERLAP"
        ? typeof c.overlapDays === "number" && c.overlapDays >= 1
        : typeof c.gapDays === "number" && c.gapDays >= 1,
    ),
  );
  check(
    "repeat digs carry a positive simulated cost",
    board.clashes
      .filter((c) => c.type === "REPEAT_DIG")
      .every((c) => typeof c.estimatedWasteInr === "number" && c.estimatedWasteInr > 0),
  );
  check(
    "overlaps propose a merged window the two works can share",
    board.clashes
      .filter((c) => c.type === "CONCURRENT_OVERLAP")
      .every(
        (c) =>
          typeof c.proposedStart === "string" &&
          typeof c.proposedEnd === "string" &&
          c.proposedStart <= c.proposedEnd,
      ),
  );
  check(
    "the board is ordered by severity, then by cost",
    board.clashes.every((c, i) => {
      if (i === 0) return true;
      const prev = board.clashes[i - 1];
      // Positive means a less urgent card was listed first — the only failure.
      const byRank = SEVERITY_ORDER[prev.severity] - SEVERITY_ORDER[c.severity];
      if (byRank > 0) return false;
      if (byRank < 0) return true;
      return (prev.estimatedWasteInr ?? 0) >= (c.estimatedWasteInr ?? 0);
    }),
  );
  check(
    "a 3+ way conflict is reported as one cluster, not three cards",
    board.clusters.some((cl) => cl.projectIds.length >= 3),
  );
  check(
    "clusters do not repeat a pair",
    board.clusters.every(
      (cl) => new Set(cl.clashIds).size === cl.clashIds.length,
    ),
  );
  check(
    "money is never claimed as real",
    board.clashes
      .filter((c) => typeof c.estimatedWasteInr === "number")
      .every((c) => c.suggestion.includes("simulated estimate")),
  );

  // Determinism: the engine must be a pure function of the registry, so two
  // reads a moment apart have to produce byte-identical clashes.
  const again = await get("/api/clashes");
  let second = null;
  try {
    second = JSON.parse(again.body);
  } catch {
    /* reported below */
  }
  check(
    "two reads produce the same board",
    second !== null &&
      JSON.stringify(second.clashes) === JSON.stringify(board.clashes) &&
      JSON.stringify(second.clusters) === JSON.stringify(board.clusters),
  );

  // The flagship seed story: a completed water pipeline on Amber Garden Road
  // and a power cable that opens the same stretch 91 days later.
  const flagship = board.clashes.find(
    (c) =>
      c.type === "REPEAT_DIG" &&
      [c.projectA.id, c.projectB.id].includes(PROJECT_AMBER_WATER) &&
      [c.projectA.id, c.projectB.id].includes(PROJECT_AMBER_POWER),
  );
  check("flagship water -> power repeat dig is detected", Boolean(flagship));
  if (flagship) {
    check(
      "flagship uses the completed water dates, not its plan",
      flagship.gapDays === 91,
      `gapDays=${flagship.gapDays}`,
    );
    check(
      "flagship is cross-department and high severity",
      flagship.projectA.department_id !== flagship.projectB.department_id &&
        flagship.severity === "high",
      `${flagship.severity}`,
    );
    check(
      "flagship carries a simulated cost estimate",
      typeof flagship.estimatedWasteInr === "number" &&
        flagship.estimatedWasteInr > 0,
      String(flagship.estimatedWasteInr),
    );
    check(
      "flagship sits on the shared road segment",
      flagship.segmentId === SEGMENT_AMBER,
      flagship.segmentId,
    );
  }
}

// ---------------------------------------------------------------------------
// /clashes (server HTML)
// ---------------------------------------------------------------------------

console.log("\n/clashes (server HTML)");
check("heading renders", clashesHtml.includes("Clash board"));
check(
  "states both detection rules in plain language",
  clashesHtml.includes("concurrent overlap") &&
    clashesHtml.includes("repeat dig") &&
    clashesHtml.includes("different departments"),
);
check(
  "documents the thresholds it used",
  /up to 50 m apart/.test(clashesHtml) && /within 180 days/.test(clashesHtml),
);
check(
  "every clash gets a Why-flagged explanation",
  count(clashesHtml, "Why flagged: ") >= 1 &&
    count(clashesHtml, "Why flagged: ") === count(clashesHtml, "Proposed coordination"),
  `${count(clashesHtml, "Why flagged: ")} explanations`,
);
check(
  "card count matches the API",
  board === null || count(clashesHtml, "Why flagged: ") === board.counts.total,
  `${count(clashesHtml, "Why flagged: ")} vs ${board?.counts.total}`,
);
check(
  "every non-empty severity band has a heading",
  ["high", "medium", "low"]
    .filter((band) => (board?.counts?.[band] ?? 0) > 0)
    .every((band) =>
      clashesHtml.includes(`${band[0].toUpperCase()}${band.slice(1)} severity`),
    ),
);
check(
  "cards are grouped high before medium before low",
  (() => {
    const hi = clashesHtml.indexOf("High severity");
    const mid = clashesHtml.indexOf("Medium severity");
    const lo = clashesHtml.indexOf("Low severity");
    if (hi === -1 || mid === -1) return false;
    return hi < mid && (lo === -1 || mid < lo);
  })(),
);
check(
  "severity is cued by a word, not only a colour",
  count(clashesHtml, "severity") >= 2,
);
check(
  "the money figure is labelled simulated",
  count(clashesHtml, "Money at risk (simulated)") >= 1,
);
check(
  "offers a refresh through the API",
  clashesHtml.includes("Refresh from the API"),
);
check(
  "discloses demo mode and the simulated registry",
  /demo mode/.test(clashesHtml) && /simulated/i.test(clashesHtml),
);
check(
  "reports rows it could not check instead of hiding them",
  clashesHtml.includes("Not checked"),
);
check(
  "links both sides of a clash to their project pages",
  clashesHtml.includes(`href="/projects/${PROJECT_AMBER_WATER}"`) &&
    clashesHtml.includes(`href="/projects/${PROJECT_AMBER_POWER}"`),
);

// ---------------------------------------------------------------------------
// badges derived from the board
// ---------------------------------------------------------------------------

console.log("\nbadges on other screens");
{
  const mapHtml = decode((await get("/map")).body);
  check(
    "/map points at the clash board when the drawn set is flagged",
    mapHtml.includes("Open the clash board"),
  );
}
{
  const projectsRaw = (await get("/projects")).body;
  const projectsHtml = decode(projectsRaw).replace(/\n/g, "");
  check(
    "/projects marks flagged rows with a clash count",
    /⚠\s*<\/span>\s*\d+\s*clash/.test(projectsHtml),
  );
}

// ---------------------------------------------------------------------------
// project detail page
// ---------------------------------------------------------------------------

console.log("\nproject detail (clash alerts)");
{
  const detail = await get(`/projects/${PROJECT_AMBER_POWER}`);
  check("detail page -> 200", detail.status === 200, `got ${detail.status}`);
  const html = decode(detail.body);
  check("Clash alerts section renders", html.includes("Clash alerts"));
  check(
    "the real section replaced the placeholder",
    !html.includes("The detection engine lands in a later milestone"),
  );
  check("clash cards are present", count(html, "Why flagged: ") >= 1);
  check(
    "names the other work with a link",
    html.includes("Other work:") &&
      html.includes(`href="/projects/${PROJECT_AMBER_WATER}"`),
  );
  check(
    "deep-links into the clash board",
    html.includes("Open on the clash board") && html.includes("/clashes#"),
  );
  check(
    "keeps the not-yet-built citizen layer honest",
    html.includes("Citizen verification") || html.includes("Coming in"),
  );
}
{
  // A project the engine found nothing for still gets the section, with a
  // reason rather than an empty box.
  const clean = decode((await get("/projects/00000000-0000-4000-8000-000000000000")).body);
  check(
    "an unknown id still renders the not-found page",
    clean.includes("No such project in this registry") ||
      clean.includes("Page not found"),
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
