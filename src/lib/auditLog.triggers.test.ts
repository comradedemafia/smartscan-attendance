import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression: confirm that audit triggers are attached for the critical
 * tables (courses, sessions, attendance_records) so every INSERT/UPDATE/DELETE
 * is recorded in audit_log via record_audit_event().
 */
describe("audit_log trigger coverage", () => {
  const dir = "supabase/migrations";
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");

  it("declares record_audit_event() function", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.record_audit_event/);
    expect(sql).toMatch(/INSERT INTO public\.audit_log/);
  });

  for (const table of ["courses", "sessions", "attendance_records"]) {
    it(`attaches audit trigger to ${table}`, () => {
      // The migration loops via plpgsql `EXECUTE format(...)` over an array
      // that must contain the table name.
      const arrayBlock = sql.match(/FOR t IN[\s\S]+?LOOP/);
      expect(arrayBlock, `audit attach loop missing`).toBeTruthy();
      expect(arrayBlock![0]).toContain(`'${table}'`);
    });
  }

  it("blocks direct writes to audit_log via RLS", () => {
    expect(sql).toMatch(/Block direct audit inserts[\s\S]+?WITH CHECK \(false\)/);
    expect(sql).toMatch(/Block direct audit updates[\s\S]+?USING \(false\)/);
    expect(sql).toMatch(/Block direct audit deletes[\s\S]+?USING \(false\)/);
  });

  it("restricts audit_log SELECT to admins", () => {
    expect(sql).toMatch(/Admins can view audit log[\s\S]+?has_role\(auth\.uid\(\), 'admin'/);
  });
});