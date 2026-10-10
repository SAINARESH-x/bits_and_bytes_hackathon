import { computeSegmentAdjacency, type LngLat, type PositionedSegment } from "./geo";
import { computeSeverity, higherSeverity } from "./severity";
import { proposeCoordination } from "./suggest";
import {
  DEFAULT_ADJACENCY_METERS,
  DEFAULT_REPEAT_DIG_WINDOW_DAYS,
  SEVERITY_ORDER,
  type Clash,
  type ClashCluster,
  type ClashResult,
  type ClashType,
  type DetectClashesOptions,
  type Project,
  type RoadSegment,
  type Severity,
  type SkippedProject,
} from "./types";
import {
  DAY_MS,
  daysBetween,
  formatDayLabel,
  resolveWorkWindow,
  type WorkWindow,
} from "./window";

/**
 * THE CLASH DETECTION ENGINE.
 *
 * Pure: no DB, no UI, no clock other than the one the caller passes in, no
 * I/O. `detectClashes` is deterministic — the same input always produces the
 * same array in the same order — which is what lets the API cache it and the
 * tests assert on it.
 *
 * The two things the product exists to catch (PLAN.md §4):
 *
 *   CONCURRENT_OVERLAP — two works, usually two departments, occupying the
 *   same stretch of road at the same time. Coordinate them: one trench, one
 *   set of barricades.
 *
 *   REPEAT_DIG — a road is opened again shortly after it was restored. The
 *   restoration was just paid for and is about to be destroyed. Batch the
 *   works instead.
 *
 * ---------------------------------------------------------------------------
 * RULES
 *
 * - Cancelled projects are excluded outright. They are neither clashing nor
 *   "skipped": they simply no longer exist for planning purposes.
 * - A window is `actual_start ?? planned_start` … `actual_end ?? planned_end`.
 * - A project whose dates are missing, unparseable or inverted is skipped and
 *   reported in `skipped` with a reason. The engine NEVER throws: one bad row
 *   must not blank the whole board.
 * - Two projects are spatially related when they share `road_segment_id`, or
 *   when the closest approach of their two polylines is <= `adjacencyMeters`
 *   (see geo.ts — the distance maths is hand-written, no turf).
 * - Overlap is counted INCLUSIVELY: a work ending 10 June and one starting
 *   10 June share that day, so that is 1 day of overlap, not zero. The overlap
 *   rule is therefore exactly "windows share at least one calendar day".
 * - A repeat dig needs a strictly positive gap: `end(A) < start(B)` and
 *   `gapDays <= repeatDigWindowDays`. Overlap and repeat-dig are mutually
 *   exclusive, so one unordered pair yields at most one clash.
 * - Same-department pairs are still reported (they are usually a sequencing
 *   mistake worth seeing) but forced to severity "low", unless
 *   `ignoreSameDepartment` drops them entirely.
 * - Severity is the documented 0–100 score in severity.ts, including a term
 *   for how many projects are tangled together in the same cluster.
 *
 * ---------------------------------------------------------------------------
 * COMPLEXITY
 *
 * The naive shape is O(projects²). Instead:
 *
 *   1. Projects are bucketed by `road_segment_id` in one pass.
 *   2. Segment adjacency is computed once, grid-bucketed so only segments in
 *      the same grid cell are compared (geo.ts) — and only segments that
 *      actually carry projects are considered.
 *   3. Only projects on the same or adjacent segments are ever compared, and
 *      within a segment the list is sorted by start date so the inner loop
 *      breaks as soon as the gap exceeds `repeatDigWindowDays`.
 *
 * With a handful of segments per street and a few projects per segment this
 * is effectively O(projects · neighbours). The 500-project test in
 * tests/clash.test.ts asserts it stays well under the 300 ms budget.
 * ---------------------------------------------------------------------------
 */

interface Prepared {
  project: Project;
  window: WorkWindow;
}

interface Draft {
  /** Earlier project: the one that finished first. */
  first: Prepared;
  second: Prepared;
  type: ClashType;
  overlapDays?: number;
  gapDays?: number;
  sameDepartment: boolean;
  segmentId: string;
  segmentLabel: string;
  explanation: string;
}

/**
 * Is this an excavation?
 *
 * Every `project_type` the registry currently models opens the ground, so the
 * guard is permissive by design: a type nobody has modelled yet still counts
 * as a dig, because missing a real repeat dig is worse than reviewing a false
 * positive. It exists so the rule "B is a different dig" has somewhere to live
 * if a non-excavating type (say, a survey or a painting job) is added later.
 */
const NON_EXCAVATING_TYPES = new Set<string>([]);

function isExcavation(project: Project): boolean {
  return !NON_EXCAVATING_TYPES.has(project.project_type);
}

function title(project: Project): string {
  return project.title?.trim() ? project.title : project.id;
}

function coordsOf(segment: RoadSegment | undefined): LngLat[] | null {
  const coords = segment?.geometry?.coordinates as unknown as LngLat[] | undefined;
  if (!coords || coords.length === 0) return null;
  return coords.map(([lng, lat]) => [lng, lat] as LngLat);
}

function segmentLabelFor(
  segmentA: string,
  segmentB: string,
  segmentById: Map<string, RoadSegment>,
): string {
  if (segmentA === segmentB) {
    return segmentById.get(segmentA)?.name ?? "the same road";
  }
  const nameA = segmentById.get(segmentA)?.name;
  const nameB = segmentById.get(segmentB)?.name;
  if (nameA && nameB) return `${nameA} (next to ${nameB})`;
  if (nameA) return `${nameA} and an adjoining road`;
  return "adjoining roads";
}

const pairKey = (a: string, b: string): string =>
  a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;

/**
 * Evaluate one candidate pair. Returns null when nothing is wrong — which is
 * the common case, so this function stays cheap.
 */
function evaluatePair(
  left: Prepared,
  right: Prepared,
  context: {
    segmentId: string;
    segmentLabel: string;
    repeatDigWindowDays: number;
    ignoreSameDepartment: boolean;
  },
): Draft | null {
  const { repeatDigWindowDays, ignoreSameDepartment } = context;

  // Deterministic ordering: earlier start wins, ties broken by id.
  const leftFirst =
    left.window.start < right.window.start ||
    (left.window.start === right.window.start &&
      left.project.id <= right.project.id);
  const first = leftFirst ? left : right;
  const second = leftFirst ? right : left;

  const sameDepartment =
    first.project.department_id === second.project.department_id;
  if (sameDepartment && ignoreSameDepartment) return null;

  const overlapStart = Math.max(left.window.start, right.window.start);
  const overlapEnd = Math.min(left.window.end, right.window.end);
  const overlapDays = Math.max(0, daysBetween(overlapStart, overlapEnd) + 1);

  let type: ClashType;
  let gapDays: number | undefined;
  let explanation: string;

  if (overlapDays >= 1) {
    type = "CONCURRENT_OVERLAP";
    explanation =
      `${title(first.project)} and ${title(second.project)} both occupy ` +
      `${context.segmentLabel} between ${formatDayLabel(overlapStart)} and ` +
      `${formatDayLabel(overlapEnd)} — ${overlapDays} day${overlapDays === 1 ? "" : "s"} ` +
      `of overlapping work.` +
      (sameDepartment
        ? " Both sit with the same department, so this is a sequencing problem rather than a cross-department one."
        : " Two departments are digging the same stretch at once.");
  } else {
    gapDays = daysBetween(first.window.end, second.window.start);
    if (gapDays < 1 || gapDays > repeatDigWindowDays) return null;
    if (!isExcavation(first.project) || !isExcavation(second.project)) return null;

    type = "REPEAT_DIG";
    explanation =
      `${title(second.project)} starts on ${formatDayLabel(second.window.start)}, ` +
      `${gapDays} day${gapDays === 1 ? "" : "s"} after ${title(first.project)} ` +
      `finished on ${formatDayLabel(first.window.end)} (${context.segmentLabel}). ` +
      `The road is opened again inside the ${repeatDigWindowDays}-day repeat-dig window.` +
      (first.project.project_type === "road"
        ? " The first work restored this surface, so that restoration is being dug up."
        : "");
  }

  return {
    first,
    second,
    type,
    overlapDays: type === "CONCURRENT_OVERLAP" ? overlapDays : undefined,
    gapDays,
    sameDepartment,
    segmentId: context.segmentId,
    segmentLabel: context.segmentLabel,
    explanation,
  };
}

interface ClusterIndex {
  clusterIdByProject: Map<string, string>;
  sizeByProject: Map<string, number>;
  projectIdsByCluster: Map<string, string[]>;
}

/** Union-find over projects joined by a clash. */
function indexClusters(drafts: readonly Draft[]): ClusterIndex {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = parent.get(id) ?? id;
    if (root === id) {
      parent.set(id, id);
      return id;
    }
    root = find(root);
    parent.set(id, root);
    return root;
  };
  const union = (a: string, b: string): void => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return;
    // Attach the larger id to the smaller one so the root — and therefore the
    // cluster id — is the same no matter what order the pairs arrived in.
    if (rootA < rootB) parent.set(rootB, rootA);
    else parent.set(rootA, rootB);
  };

  for (const draft of drafts) {
    union(draft.first.project.id, draft.second.project.id);
  }

  const projectIdsByCluster = new Map<string, string[]>();
  for (const draft of drafts) {
    for (const prepared of [draft.first, draft.second]) {
      const id = prepared.project.id;
      const root = find(id);
      const bucket = projectIdsByCluster.get(root);
      if (bucket) {
        if (!bucket.includes(id)) bucket.push(id);
      } else {
        projectIdsByCluster.set(root, [id]);
      }
    }
  }

  const clusterIdByProject = new Map<string, string>();
  const sizeByProject = new Map<string, number>();
  for (const [root, ids] of projectIdsByCluster) {
    ids.sort();
    const clusterId = `cluster:${root}`;
    for (const id of ids) {
      clusterIdByProject.set(id, clusterId);
      sizeByProject.set(id, ids.length);
    }
  }

  return { clusterIdByProject, sizeByProject, projectIdsByCluster };
}

export function detectClashes(
  projects: readonly Project[],
  segments: readonly RoadSegment[] = [],
  options: DetectClashesOptions = {},
): ClashResult {
  const adjacencyMeters = options.adjacencyMeters ?? DEFAULT_ADJACENCY_METERS;
  const repeatDigWindowDays =
    options.repeatDigWindowDays ?? DEFAULT_REPEAT_DIG_WINDOW_DAYS;
  const ignoreSameDepartment = options.ignoreSameDepartment ?? false;
  const now = options.now ?? new Date();

  // ---- 1. resolve windows, collect the rows we cannot use --------------
  const prepared: Prepared[] = [];
  const skipped: SkippedProject[] = [];

  for (const project of projects) {
    if (project.status === "cancelled") continue;
    const resolution = resolveWorkWindow(project);
    if (!resolution.ok) {
      skipped.push({
        projectId: project.id,
        title: title(project),
        reason: resolution.reason,
      });
      continue;
    }
    prepared.push({ project, window: resolution.window });
  }

  // ---- 2. bucket by segment -------------------------------------------
  const bySegment = new Map<string, Prepared[]>();
  for (const item of prepared) {
    const bucket = bySegment.get(item.project.road_segment_id);
    if (bucket) bucket.push(item);
    else bySegment.set(item.project.road_segment_id, [item]);
  }

  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));

  // ---- 3. which segments are the same street --------------------------
  // Only segments that carry projects matter, so the geometric comparison
  // never even looks at the rest of the city.
  const positioned: PositionedSegment[] = [];
  for (const segmentId of bySegment.keys()) {
    const coords = coordsOf(segmentById.get(segmentId));
    if (coords) positioned.push({ id: segmentId, coords });
  }
  const adjacency = computeSegmentAdjacency(positioned, adjacencyMeters);

  const relatedSegments = new Set<string>();
  for (const segmentId of bySegment.keys()) {
    relatedSegments.add(`${segmentId}\u0000${segmentId}`);
    const neighbours = adjacency.get(segmentId);
    if (!neighbours) continue;
    for (const neighbour of neighbours) {
      if (!bySegment.has(neighbour)) continue;
      relatedSegments.add(pairKey(segmentId, neighbour));
    }
  }

  // ---- 4. sweep each related segment pairing --------------------------
  const drafts: Draft[] = [];
  const seenPairs = new Set<string>();
  const windowMs = repeatDigWindowDays * DAY_MS;

  for (const key of relatedSegments) {
    const [segmentA, segmentB] = key.split("\u0000");
    const sameSegment = segmentA === segmentB;
    const segmentId = sameSegment ? segmentA : segmentA < segmentB ? segmentA : segmentB;
    const segmentLabel = segmentLabelFor(segmentA, segmentB, segmentById);

    const list = sameSegment
      ? [...(bySegment.get(segmentA) ?? [])]
      : [...(bySegment.get(segmentA) ?? []), ...(bySegment.get(segmentB) ?? [])];

    // Sorting by start lets the inner loop stop early: once the next project
    // begins more than `repeatDigWindowDays` after this one ends, no later
    // project can overlap it or follow it closely enough to count.
    list.sort(
      (a, b) =>
        a.window.start - b.window.start ||
        a.project.id.localeCompare(b.project.id),
    );

    for (let i = 0; i < list.length; i += 1) {
      const left = list[i];
      for (let j = i + 1; j < list.length; j += 1) {
        const right = list[j];
        if (right.window.start > left.window.end + windowMs) break;

        const key2 = pairKey(left.project.id, right.project.id);
        if (seenPairs.has(key2)) continue;

        const draft = evaluatePair(left, right, {
          segmentId,
          segmentLabel,
          repeatDigWindowDays,
          ignoreSameDepartment,
        });
        if (!draft) continue;

        seenPairs.add(key2);
        drafts.push(draft);
      }
    }
  }

  // ---- 5. cluster, then score (cluster size feeds the score) ----------
  const clusters = indexClusters(drafts);

  const clashes: Clash[] = drafts.map((draft) => {
    const clusterSize = clusters.sizeByProject.get(draft.first.project.id) ?? 2;
    const clusterId = clusters.clusterIdByProject.get(draft.first.project.id);
    const severity: Severity = draft.sameDepartment
      ? "low"
      : computeSeverity({
          type: draft.type,
          overlapDays: draft.overlapDays ?? 0,
          gapDays: draft.gapDays ?? 0,
          repeatDigWindowDays,
          budgetA: draft.first.project.budget_inr ?? 0,
          budgetB: draft.second.project.budget_inr ?? 0,
          projectTypeA: draft.first.project.project_type,
          projectTypeB: draft.second.project.project_type,
          clusterSize,
        });

    const id = `clash:${draft.type}:${draft.first.project.id}:${draft.second.project.id}`;

    // A placeholder clash is handed to the suggester purely so it can read
    // the dates and budgets. It is never stored and never mutated.
    const proposal = proposeCoordination({
      id,
      type: draft.type,
      severity,
      projectA: draft.first.project,
      projectB: draft.second.project,
      segmentId: draft.segmentId,
      overlapDays: draft.overlapDays,
      gapDays: draft.gapDays,
      explanation: draft.explanation,
      suggestion: "",
      clusterId: clusterSize >= 3 ? clusterId : undefined,
      clusterSize: clusterSize >= 3 ? clusterSize : undefined,
    });

    return {
      id,
      type: draft.type,
      severity,
      projectA: draft.first.project,
      projectB: draft.second.project,
      segmentId: draft.segmentId,
      overlapDays: draft.overlapDays,
      gapDays: draft.gapDays,
      explanation: draft.explanation,
      suggestion: proposal.suggestion,
      estimatedWasteInr: proposal.estimatedWasteInr ?? undefined,
      proposedStart: proposal.proposedWindow?.start,
      proposedEnd: proposal.proposedWindow?.end,
      savesDig: proposal.savesDig,
      clusterId: clusterSize >= 3 ? clusterId : undefined,
      clusterSize: clusterSize >= 3 ? clusterSize : undefined,
    };
  });

  // Deterministic output order — never map iteration order.
  clashes.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      (b.estimatedWasteInr ?? 0) - (a.estimatedWasteInr ?? 0) ||
      a.projectA.id.localeCompare(b.projectA.id) ||
      a.projectB.id.localeCompare(b.projectB.id) ||
      a.type.localeCompare(b.type),
  );

  const clusterModels: ClashCluster[] = [];
  for (const [root, projectIds] of clusters.projectIdsByCluster) {
    if (projectIds.length < 3) continue;
    const clusterId = `cluster:${root}`;
    const members = clashes.filter((clash) => clash.clusterId === clusterId);
    if (members.length === 0) continue;
    clusterModels.push({
      id: clusterId,
      projectIds: [...projectIds].sort(),
      clashIds: members.map((clash) => clash.id).sort(),
      segmentId: members
        .map((clash) => clash.segmentId)
        .sort()[0],
      severity: members.reduce<Severity>(
        (worst, clash) => higherSeverity(worst, clash.severity),
        "low",
      ),
    });
  }
  clusterModels.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      b.projectIds.length - a.projectIds.length ||
      a.id.localeCompare(b.id),
  );

  skipped.sort((a, b) => a.projectId.localeCompare(b.projectId));

  return {
    clashes,
    clusters: clusterModels,
    skipped,
    generatedAt: now.toISOString(),
  };
}
