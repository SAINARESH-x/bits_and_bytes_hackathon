import { describe, expect, it } from "vitest";
import {
  createSeedStore,
  getDataMode,
  listProjects,
  listSegments,
} from "@/lib/data";
import { citizenReportInputSchema, verificationInputSchema } from "@/lib/schemas";

describe("data mode", () => {
  it("reports demo when no Supabase env vars are set", () => {
    expect(getDataMode()).toBe("demo");
  });
});

describe("seed store", () => {
  const store = createSeedStore();

  it("reports its own mode", () => {
    expect(store.mode).toBe("demo");
  });

  it("lists projects, segments and departments", async () => {
    const [projects, segments, departments] = await Promise.all([
      store.listProjects(),
      store.listSegments(),
      store.listDepartments(),
    ]);
    expect(projects.length).toBeGreaterThanOrEqual(35);
    expect(segments).toHaveLength(12);
    expect(departments).toHaveLength(5);
  });

  it("marks every project as simulated", async () => {
    const projects = await store.listProjects();
    expect(projects.every((p) => p.is_simulated === true)).toBe(true);
  });

  it("resolves relative dates to absolute ISO strings", async () => {
    const projects = await store.listProjects();
    const withStart = projects.find((p) => p.planned_start)!;
    expect(withStart.planned_start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("finds one project by id and returns null for an unknown id", async () => {
    const [first] = await store.listProjects();
    await expect(store.getProject(first.id)).resolves.toMatchObject({ id: first.id });
    await expect(
      store.getProject("no-such-project"),
    ).resolves.toBeNull();
  });

  it("lists a project's updates oldest-first", async () => {
    const projects = await store.listProjects();
    // Deterministic: the flagship drain project always has updates.
    const drain = projects.find((p) => p.status === "stalled")!;
    const updates = await store.listUpdates(drain.id);
    expect(updates.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < updates.length; i++) {
      expect(updates[i].created_at >= updates[i - 1].created_at).toBe(true);
    }
  });

  it("counts confirmations and disputes per project", async () => {
    const projects = await store.listProjects();
    const footpath = projects.find(
      (p) => p.title.startsWith("Footpath rebuilding"),
    )!;
    const votes = await store.listVerifications(footpath.id);
    expect(votes.filter((v) => v.vote === "dispute")).toHaveLength(4);
  });

  it("exposes exactly one unlisted report with no project link", async () => {
    const reports = await store.listReports();
    const unlisted = reports.filter((r) => r.is_unlisted_work);
    expect(unlisted).toHaveLength(1);
    expect(unlisted[0].project_id).toBeNull();
  });
});

describe("seed store writes (demo mode)", () => {
  it("creates a project and can read it back", async () => {
    const store = createSeedStore();
    const [segment] = await store.listSegments();
    const [department] = await store.listDepartments();

    const created = await store.createProject({
      title: "Test resurfacing works",
      purpose: "Verify the demo write path.",
      project_type: "road",
      department_id: department.id,
      road_segment_id: segment.id,
      status: "planned",
      planned_start: "2026-11-01",
      planned_end: "2026-11-20",
      contractor_name: null,
      actual_start: null,
      actual_end: null,
      budget_inr: 100000,
    });

    expect(created.is_simulated).toBe(true);
    await expect(store.getProject(created.id)).resolves.toMatchObject({
      title: "Test resurfacing works",
    });
  });

  it("keeps a device's vote unique, replacing it on a second vote", async () => {
    const store = createSeedStore();
    const [project] = await store.listProjects();
    const device = "11111111-1111-4111-8111-111111111111";

    const first = await store.addVerification({
      project_id: project.id,
      vote: "confirm",
      device_id: device,
    });
    const second = await store.addVerification({
      project_id: project.id,
      vote: "dispute",
      device_id: device,
    });

    expect(second.id).toBe(first.id);
    expect(second.vote).toBe("dispute");
    const votes = await store.listVerifications(project.id);
    expect(votes.filter((v) => v.device_id === device)).toHaveLength(1);
  });
});

describe("seed store is isolated per instance", () => {
  it("does not leak writes between instances", async () => {
    const a = createSeedStore();
    const b = createSeedStore();
    const before = (await b.listProjects()).length;

    const [segment] = await a.listSegments();
    const [department] = await a.listDepartments();
    await a.createProject({
      title: "Isolation check",
      purpose: "Ensures no shared mutable state.",
      project_type: "drain",
      department_id: department.id,
      road_segment_id: segment.id,
      status: "planned",
      planned_start: null,
      planned_end: null,
      actual_start: null,
      actual_end: null,
      contractor_name: null,
      budget_inr: null,
    });

    expect((await a.listProjects()).length).toBe(before + 1);
    expect((await b.listProjects()).length).toBe(before);
  });
});

describe("listProjects / listSegments convenience API", () => {
  it("resolves without a network call in demo mode", async () => {
    await expect(listProjects()).resolves.toHaveLength(39);
    await expect(listSegments()).resolves.toHaveLength(12);
  });
});

describe("schemas reject bad input", () => {
  it("rejects an unlisted report that also names a project", () => {
    const result = citizenReportInputSchema.safeParse({
      project_id: "11111111-1111-4111-8111-111111111111",
      report_type: "pothole",
      description: "A pothole",
      lat: 13.06,
      lng: 80.24,
      is_unlisted_work: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an out-of-range coordinate", () => {
    const result = citizenReportInputSchema.safeParse({
      report_type: "pothole",
      description: "Somewhere impossible",
      lat: 999,
      lng: 80.24,
      is_unlisted_work: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-UUID device id", () => {
    const result = verificationInputSchema.safeParse({
      project_id: "11111111-1111-4111-8111-111111111111",
      vote: "confirm",
      device_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});
