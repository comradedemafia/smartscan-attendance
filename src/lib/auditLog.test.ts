import { describe, it, expect } from "vitest";
import { filterAuditRows, computeDiff, buildAuditCsv, type AuditRow } from "./auditLog";

const row = (over: Partial<AuditRow>): AuditRow => ({
  id: "r", actor_id: "u1", actor_role: "lecturer", action: "INSERT",
  entity_type: "courses", entity_id: "c1", old_data: null, new_data: { id: "c1", name: "Math" },
  created_at: "2026-01-15T10:00:00Z", ...over,
});

const actors = { u1: { full_name: "Alice", university_id: "T-001", email: "a@x" } };

describe("filterAuditRows", () => {
  const rows = [
    row({ id: "1", entity_type: "courses", action: "INSERT", created_at: "2026-01-10T08:00:00Z" }),
    row({ id: "2", entity_type: "sessions", action: "UPDATE", created_at: "2026-01-15T08:00:00Z" }),
    row({ id: "3", entity_type: "attendance_records", action: "DELETE", created_at: "2026-01-20T23:00:00Z" }),
  ];
  it("filters by entity", () => {
    expect(filterAuditRows(rows, { entity: "sessions", action: "all", from: "", to: "", search: "" }).map(r => r.id)).toEqual(["2"]);
  });
  it("filters by action", () => {
    expect(filterAuditRows(rows, { entity: "all", action: "DELETE", from: "", to: "", search: "" }).map(r => r.id)).toEqual(["3"]);
  });
  it("filters by date range inclusive", () => {
    expect(filterAuditRows(rows, { entity: "all", action: "all", from: "2026-01-15", to: "2026-01-20", search: "" }).map(r => r.id)).toEqual(["2", "3"]);
  });
  it("searches actor name", () => {
    expect(filterAuditRows(rows, { entity: "all", action: "all", from: "", to: "", search: "alice" }, actors).length).toBe(3);
    expect(filterAuditRows(rows, { entity: "all", action: "all", from: "", to: "", search: "bob" }, actors).length).toBe(0);
  });
});

describe("computeDiff", () => {
  it("returns changed fields only and skips updated_at", () => {
    const d = computeDiff({ name: "A", code: "X", updated_at: "1" }, { name: "B", code: "X", updated_at: "2" });
    expect(d).toEqual([{ key: "name", oldVal: "A", newVal: "B" }]);
  });
  it("handles INSERT (no old)", () => {
    const d = computeDiff(null, { name: "B" });
    expect(d).toEqual([{ key: "name", oldVal: "—", newVal: "B" }]);
  });
  it("handles DELETE (no new)", () => {
    const d = computeDiff({ name: "B" }, null);
    expect(d).toEqual([{ key: "name", oldVal: "B", newVal: "—" }]);
  });
});

describe("buildAuditCsv", () => {
  it("includes header and rows reflecting filtered set", () => {
    const csv = buildAuditCsv([row({})], actors);
    const [header, line1] = csv.split("\n");
    expect(header).toBe("timestamp,actor,actor_role,action,entity_type,entity_id,old_data,new_data");
    expect(line1).toContain("Alice (T-001)");
    expect(line1).toContain("courses");
    expect(line1).toContain("INSERT");
  });
});