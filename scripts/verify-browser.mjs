/**
 * End-to-end check of the M3 UI in a real (headless) browser.
 *
 * Server HTML assertions can prove a page *contains* markup, but M3 is mostly
 * interaction: a popup on click, a filter that lands in the URL, a toggle that
 * swaps views. Those only exist after hydration, so this script drives Chrome
 * over the DevTools protocol.
 *
 * Run: node scripts/verify-browser.mjs   (expects `npm start` on :3100)
 *
 * Uses the `ws` package that already ships transitively with Next's
 * dependencies — it is a verification script, not an app dependency, and is
 * skipped with a note if `ws` cannot be resolved.
 */
import { spawn } from "node:child_process";
import http from "node:http";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const PORT = 9333;
const CHROME = process.env.CHROME_BIN ?? "/usr/bin/google-chrome";

let ws;
try {
  // `ws` is a transitive dependency (Next/Supabase pull it in) and is used
  // only by this verification script — it is not an app dependency. Loaded
  // through createRequire because it has no ESM entry point.
  const { createRequire } = await import("node:module");
  ws = createRequire(import.meta.url)("ws");
} catch (err) {
  console.log(`SKIP: \`ws\` is not resolvable (${err.message}), cannot drive Chrome.`);
  process.exit(0);
}

let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

const getJSON = (url) =>
  new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on("error", reject);
  });

const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=/tmp/digsync-verify/profile-${Date.now()}`,
    "--window-size=1400,1200",
    "about:blank",
  ],
  { stdio: "ignore" },
);

process.on("exit", () => chrome.kill());

/** Poll the page until `expression` evaluates truthy. */
const client = {
  sock: null,
  nextId: 0,
  waiting: new Map(),
  events: new Map(),
};

function attachListeners(sock) {
  sock.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id !== undefined && client.waiting.has(msg.id)) {
      const { resolve, reject } = client.waiting.get(msg.id);
      client.waiting.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    for (const fn of client.events.get(msg.method) ?? []) fn(msg.params);
  });
}

function send(method, params = {}) {
  const id = ++client.nextId;
  client.sock.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    client.waiting.set(id, { resolve, reject });
    setTimeout(() => {
      if (client.waiting.has(id)) {
        client.waiting.delete(id);
        reject(new Error(`timeout: ${method}`));
      }
    }, 20_000);
  });
}

const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.text ?? "evaluate threw");
  }
  return r.result?.value;
};

async function waitFor(expression, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await evaluate(expression);
    if (last) return last;
    await new Promise((r) => setTimeout(r, 250));
  }
  return last;
}

async function goto(path) {
  await evaluate(`location.href = ${JSON.stringify(path)}`);
  await waitFor("document.readyState === 'complete'");
  await new Promise((r) => setTimeout(r, 1200));
}

async function main() {
  // --- boot ------------------------------------------------------------
  let targets;
  for (let i = 0; i < 40; i++) {
    try {
      targets = await getJSON(`http://127.0.0.1:${PORT}/json/list`);
      if (targets.length) break;
    } catch {
      /* chrome not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  const page = targets.find((t) => t.type === "page");
  if (!page) throw new Error("no page target");

  client.sock = new ws(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    client.sock.once("open", resolve);
    client.sock.once("error", reject);
  });
  attachListeners(client.sock);
  await send("Page.enable");
  await send("Runtime.enable");

  console.log("\nBrowser verification (headless Chrome)\n");

  // --- /map: polylines render -----------------------------------------
  console.log("/map");
  await goto(`${BASE}/map`);

  const polylines = await waitFor(
    "document.querySelectorAll('.leaflet-interactive').length",
  );
  check("polyline per project is drawn", polylines > 0, `found ${polylines}`);
  check("all 39 projects are drawn", polylines === 39, `found ${polylines}`);

  const mapBox = await evaluate(`(() => {
    const el = document.querySelector('.leaflet-container');
    const r = el.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height) };
  })()`);
  check("map container has real height", mapBox.h > 300, JSON.stringify(mapBox));

  // --- /map: popup on click -------------------------------------------
  console.log("\npopup");
  const popup = await evaluate(`(async () => {
    const pane = document.querySelector('.leaflet-popup-pane');
    for (let attempt = 0; attempt < 3; attempt++) {
      const path = document.querySelector('.leaflet-interactive');
      const r = path.getBoundingClientRect();
      const opts = { bubbles: true, cancelable: true,
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, buttons: 1 };
      // Leaflet binds click through map-level delegation, but firing the
      // whole press/release sequence as well keeps this independent of how
      // any particular Leaflet version wires its pointer handling.
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        path.dispatchEvent(new MouseEvent(type, opts));
        await new Promise(res => setTimeout(res, 60));
      }
      for (let i = 0; i < 40; i++) {
        const p = document.querySelector('.leaflet-popup-content');
        if (p && p.innerText.trim()) return p.innerText;
        await new Promise(res => setTimeout(res, 150));
      }
      if (pane.children.length) continue;
    }
    return null;
  })()`);

  check("clicking a polyline opens a popup", Boolean(popup), "no popup after 3 attempts");
  if (popup) {
    check("popup shows the project title", popup.length > 10, popup.slice(0, 60));
    check("popup shows a department", /Department|Board|Utility|Works/i.test(popup));
    check("popup shows planned and actual dates", /Planned/i.test(popup) && /Actual/i.test(popup));
    check("popup shows the status", /Status/i.test(popup));
    check("popup has a View details link", /View details/.test(popup));
    // The clash link (when the road is flagged) sits above it, so select by
    // text rather than by position.
    const href = await evaluate(
      `[...document.querySelectorAll('.leaflet-popup-content a')]
        .find(a => a.textContent.includes('View details'))?.getAttribute('href') ?? null`,
    );
    check("View details points at the project", Boolean(href && href.startsWith("/projects/")), String(href));
    const clashHref = await evaluate(
      `[...document.querySelectorAll('.leaflet-popup-content a')]
        .find(a => a.textContent.includes('review'))?.getAttribute('href') ?? null`,
    );
    if (clashHref) {
      check("a flagged road's popup links to the clash board", clashHref === "/clashes", String(clashHref));
    }
  }

  // --- /map: legend is not colour-only --------------------------------
  console.log("\nlegend");
  const legend = await evaluate(`(() => {
    const items = [...document.querySelectorAll('[aria-label="Map legend"] li')]
      .map(li => li.innerText.trim());
    const dashes = [...document.querySelectorAll('[aria-label="Map legend"] line')]
      .map(l => l.getAttribute('stroke-dasharray'));
    return { items, dashes };
  })()`);
  check("legend lists all five statuses", legend.items.length === 5, JSON.stringify(legend.items));
  check("legend glyphs differ per status", new Set(legend.items.map((i) => i[0])).size >= 4);
  check("legend line patterns differ per status",
    new Set(legend.dashes.map((d) => d ?? "solid")).size >= 4,
    JSON.stringify(legend.dashes));

  // --- URL-driven filters ---------------------------------------------
  console.log("\nfilters in the URL");
  await goto(`${BASE}/projects`);

  const before = await evaluate(
    `[...document.querySelectorAll('main [aria-live]')].map(e => e.innerText).find(t => t.includes('Showing')) ?? ''`,
  );
  await evaluate(`(() => {
    const sel = document.querySelector('#filter-status');
    sel.value = 'stalled';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(`location.search.includes('status=stalled')`, 8000);
  check("choosing a status writes it to the URL",
    await evaluate(`location.search.includes('status=stalled')`));

  await new Promise((r) => setTimeout(r, 600));
  const after = await evaluate(`[...document.querySelectorAll('main [aria-live]')].map(e => e.innerText).find(t => t.includes('Showing')) ?? ''`);
  check("results narrow without a page reload", after !== before, `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);

  // A second filter must not wipe the first.
  await evaluate(`(() => {
    const sel = document.querySelector('#filter-type');
    // "drain" intersects "stalled" to 2 records; "road" would intersect to 0
    // and prove less about restoration than about the seed.
    sel.value = 'drain';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(`location.search.includes('type=drain')`, 8000);
  const qs = await evaluate(`location.search`);
  check("a second filter keeps the first",
    qs.includes("status=stalled") && qs.includes("type=drain"), qs);

  // Reloading the shared URL must reproduce the same view.
  const url = await evaluate(`location.href`);
  await goto(url);
  check("the shared URL restores the filter state",
    (await evaluate(`location.search`)).includes("status=stalled"));
  check("restored state narrows the results",
    await evaluate(
      // Parse the count rather than pattern-matching the whole line: a
      // restored filter that legitimately empties the list still reads
      // "0 of 39", which is narrowed, not unfiltered.
      `((() => {
        const t = [...document.querySelectorAll('main [aria-live]')]
          .map(e => e.innerText).find(x => x.includes('Showing')) ?? '';
        const m = t.match(/Showing\\s+(\\d+)/);
        const n = m ? Number(m[1]) : -1;
        return n > 0 && n < 39;
      })())`,
    ),
    await evaluate(`[...document.querySelectorAll('main [aria-live]')].map(e => e.innerText).find(t => t.includes('Showing')) ?? ''`));

  // Invalid input must not break the view.
  await goto(`${BASE}/projects?status=definitely_not_a_status`);
  check("an invalid filter value falls back to everything",
    await evaluate(
      `((() => {
        const t = [...document.querySelectorAll('main [aria-live]')]
          .map(e => e.innerText).find(x => x.includes('Showing')) ?? '';
        return /^Showing\\s+39\\b/.test(t);
      })())`,
    ),
    await evaluate(`[...document.querySelectorAll('main [aria-live]')].map(e => e.innerText).find(t => t.includes('Showing')) ?? ''`));

  // --- empty state -----------------------------------------------------
  console.log("\nempty state");
  await goto(`${BASE}/projects?q=zzzznotfound`);
  check("a search with no hits shows the empty state",
    await evaluate(`document.body.innerText.includes('No projects match these filters')`));
  check("empty state offers a way out",
    await evaluate(`[...document.querySelectorAll('button')].some(b => b.innerText.includes('Clear all filters'))`));

  // --- sorting ---------------------------------------------------------
  console.log("\nsorting");
  await goto(`${BASE}/projects`);
  await evaluate(`(() => {
    const btn = [...document.querySelectorAll('th button')].find(b => b.innerText.includes('Budget'));
    btn.click();
  })()`);
  await waitFor(`location.search.includes('sort=budget')`, 8000);
  check("clicking a header writes sort to the URL",
    await evaluate(`location.search.includes('sort=budget')`));
  const sorted = await evaluate(`(() => {
    const th = [...document.querySelectorAll('th')].find(t => t.innerText.includes('Budget'));
    return th?.getAttribute('aria-sort');
  })()`);
  check("the header announces its sort state", sorted === "ascending", String(sorted));

  await evaluate(`(() => {
    const btn = [...document.querySelectorAll('th button')].find(b => b.innerText.includes('Budget'));
    btn.click();
  })()`);
  await waitFor(`location.search.includes('dir=desc')`, 8000);
  check("clicking again reverses direction",
    await evaluate(`location.search.includes('dir=desc')`));

  // --- Map | List toggle ------------------------------------------------
  console.log("\nMap | List toggle");
  await goto(`${BASE}/projects`);
  check("both view buttons are present",
    await evaluate(`document.querySelectorAll('[aria-label="Choose how to view projects"] button').length === 2`));
  await evaluate(`[...document.querySelectorAll('[aria-label="Choose how to view projects"] button')]
    .find(b => b.innerText.includes('Map')).click()`);
  await waitFor(`location.search.includes('view=map')`, 8000);
  check("choosing Map writes view=map to the URL",
    await evaluate(`location.search.includes('view=map')`));
  check("the Map button reports itself pressed",
    await evaluate(`[...document.querySelectorAll('[aria-label="Choose how to view projects"] button')]
      .find(b => b.innerText.includes('Map')).getAttribute('aria-pressed') === 'true'`));
  check("the map actually appears",
    (await waitFor(`document.querySelectorAll('.leaflet-interactive').length`, 10000)) > 0);

  // --- 404 in the browser ---------------------------------------------
  console.log("\n404");
  await goto(`${BASE}/projects/a%20b`);
  check("an invalid id shows the project 404 page",
    await evaluate(`document.body.innerText.includes('No such project in this registry')`));

  // --- detail page ------------------------------------------------------
  console.log("\ndetail page");
  await goto(`${BASE}/projects`);
  const firstId = await evaluate(`(document.querySelector('a[href^="/projects/"]')?.getAttribute('href')) ?? null`);
  check("a project link exists", Boolean(firstId), String(firstId));
  if (firstId) {
    await goto(`${BASE}${firstId}`);
    const text = await evaluate(`document.body.innerText`);
    check("shows the timeline section", text.includes("Planned vs actual"));
    check("shows a delay figure", /past planned end|On plan|Completed on plan|No dates/.test(text));
    check("shows the Clash alerts section",
      text.includes("Clash alerts") &&
        !text.includes("The detection engine lands in a later milestone"));
    check("shows the Citizen verification placeholder",
      text.includes("Citizen verification") && text.includes("Coming in"));
    check("budget is labelled simulated", text.includes("(simulated)"));
    check("status history renders", text.includes("Status history"));
    // The timeline bars must actually occupy the track.
    const bars = await evaluate(`[...document.querySelectorAll('section[aria-labelledby="timeline-heading"] span')]
      .filter(s => s.style.width && parseFloat(s.style.width) > 0).length`);
    check("timeline bars are drawn", bars >= 1, `found ${bars}`);
  }

  // --- clash board ------------------------------------------------------
  console.log("\n/clashes");
  await goto(`${BASE}/clashes`);

  const boardText = await evaluate(`document.body.innerText`);
  check("explains why each pair is flagged", /Why flagged/i.test(boardText));
  check("proposes coordination, not just a warning",
    /Proposed coordination/i.test(boardText));
  check("labels the money as simulated", /simulated/i.test(boardText));

  const cardCount = await evaluate(
    `document.querySelectorAll('article[id^="clash-"]').length`,
  );
  check("renders at least one clash card", cardCount >= 1, `found ${cardCount}`);

  // The severity filter is client-side: it must narrow the board in place.
  const pressFilter = (label) => `[...document.querySelectorAll('[aria-label="Filter by severity"] button')]
    .find(b => b.innerText.startsWith(${JSON.stringify(label)})).click()`;
  const cardSelector = `document.querySelectorAll('article[id^="clash-"]').length`;

  await evaluate(pressFilter("High"));
  await new Promise((r) => setTimeout(r, 400));
  const highOnly = await evaluate(cardSelector);
  check("the severity filter narrows the board without a reload",
    highOnly > 0 && highOnly < cardCount, `${cardCount} -> ${highOnly}`);
  check("the pressed filter reports itself pressed",
    await evaluate(`[...document.querySelectorAll('[aria-label="Filter by severity"] button')]
      .find(b => b.innerText.startsWith('High')).getAttribute('aria-pressed') === 'true'`));
  check("the filter did not touch the URL",
    !(await evaluate(`location.search`)).includes("severity"),
    await evaluate(`location.search`));

  await evaluate(pressFilter("All"));
  await new Promise((r) => setTimeout(r, 400));
  check("clearing the filter restores every card",
    (await evaluate(cardSelector)) === cardCount);

  // The Refresh button is the one path that goes through GET /api/clashes.
  const refreshError = await evaluate(`(async () => {
    const btn = [...document.querySelectorAll('button')]
      .find(b => b.innerText.includes('Refresh from the API'));
    if (!btn) return 'no refresh button';
    btn.click();
    await new Promise(r => setTimeout(r, 2000));
    return document.body.innerText.includes('Could not refresh') ? 'error banner' : null;
  })()`);
  check("refreshing through the API succeeds", refreshError === null, String(refreshError));
  check("the board survives the refresh",
    (await evaluate(cardSelector)) === cardCount);

  // The per-clash map is mounted lazily, only once its card is opened and in
  // view — 38 tile-loading maps up front would be a tile-server stampede.
  const opened = await evaluate(`(() => {
    const details = document.querySelector('article[id^="clash-"] details');
    if (!details) return false;
    details.open = true;
    details.scrollIntoView({ block: 'center' });
    return true;
  })()`);
  check("clash cards expose a map toggle", opened);
  if (opened) {
    const miniMaps = await waitFor(
      `document.querySelectorAll('article[id^="clash-"] .leaflet-container').length`,
      12_000,
    );
    check("opening a clash map mounts Leaflet", miniMaps >= 1, `found ${miniMaps}`);
  }

  // --- clash badges on the map -----------------------------------------
  console.log("\nclash badges on /map");
  await goto(`${BASE}/map`);
  const badges = await waitFor(`document.querySelectorAll('.clash-marker').length`, 12_000);
  check("flagged roads are badged on the map", badges > 0, `found ${badges}`);
  check("each badge names itself for screen readers",
    await evaluate(`[...document.querySelectorAll('.clash-marker')].every(
      e => e.getAttribute('role') === 'img' && /clash alert/.test(e.getAttribute('aria-label') ?? ''))`));
  check("the map points at the clash board",
    (await evaluate(`document.body.innerText`)).includes("Open the clash board"));

  console.log(`\n${pass} passed, ${fail} failed\n`);
}

try {
  await main();
} catch (err) {
  console.error("\nFATAL:", err.message);
  fail++;
} finally {
  client.sock?.close();
  chrome.kill();
  process.exit(fail === 0 ? 0 : 1);
}
