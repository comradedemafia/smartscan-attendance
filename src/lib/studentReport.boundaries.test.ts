import { describe, it, expect } from "vitest";
import {
  filterSessionsForStudent,
  computeTotals,
  type StudentReportSession,
  type StudentEnrollment,
} from "./studentReport";

// All session_date values are stored as YYYY-MM-DD (date, not timestamp).
// These tests guard against off-by-one regressions when comparing date-only
// strings against ISO timestamps from enrolled_at / left_at, and against
// inclusive boundary semantics for dateFrom/dateTo.

const enrollments: StudentEnrollment[] = [
  { course_id: "c1", enrolled_at: "2026-04-01T00:00:00Z" },
];
const make = (id: string, date: string): StudentReportSession => ({
  id,
  course_id: "c1",
  session_date: date,
  status: "completed",
});

describe("date filters — inclusive boundary semantics", () => {
  const sessions = [
    make("a", "2026-04-30"),
    make("b", "2026-05-01"),
    make("c", "2026-05-31"),
    make("d", "2026-06-01"),
  ];

  it("dateFrom is inclusive (session on the from-date is kept)", () => {
    const out = filterSessionsForStudent(sessions, enrollments, { dateFrom: "2026-05-01" });
    expect(out.map((s) => s.id)).toEqual(["b", "c", "d"]);
  });

  it("dateTo is inclusive (session on the to-date is kept)", () => {
    const out = filterSessionsForStudent(sessions, enrollments, { dateTo: "2026-05-31" });
    expect(out.map((s) => s.id)).toEqual(["a", "b", "c"]);
  });

  it("from == to keeps exactly that single day", () => {
    const out = filterSessionsForStudent(sessions, enrollments, {
      dateFrom: "2026-05-01",
      dateTo: "2026-05-01",
    });
    expect(out.map((s) => s.id)).toEqual(["b"]);
  });
});

describe("timezone safety — session_date vs enrolled_at/left_at", () => {
  it("midnight-UTC enrolled_at on the same calendar day INCLUDES that day's session", () => {
    // session on 2026-05-01, enrolled at 2026-05-01T00:00:00Z → must include
    const sessions = [make("x", "2026-05-01")];
    const enr: StudentEnrollment[] = [
      { course_id: "c1", enrolled_at: "2026-05-01T00:00:00Z" },
    ];
    expect(filterSessionsForStudent(sessions, enr).map((s) => s.id)).toEqual(["x"]);
  });

  it("late-evening UTC enrolled_at still treated as that calendar day (no off-by-one back)", () => {
    // 23:30 UTC could roll to next local day in some TZs — we slice the date,
    // so the enrollment date is 2026-05-01, not 2026-05-02.
    const sessions = [make("x", "2026-05-01")];
    const enr: StudentEnrollment[] = [
      { course_id: "c1", enrolled_at: "2026-05-01T23:30:00Z" },
    ];
    expect(filterSessionsForStudent(sessions, enr).map((s) => s.id)).toEqual(["x"]);
  });

  it("left_at end-of-day still includes a session dated the same day", () => {
    const sessions = [make("a", "2026-05-30"), make("b", "2026-05-31"), make("c", "2026-06-01")];
    const enr: StudentEnrollment[] = [
      { course_id: "c1", enrolled_at: "2026-04-01T00:00:00Z", left_at: "2026-05-31T23:59:59Z" },
    ];
    expect(filterSessionsForStudent(sessions, enr).map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("session strictly before enrollment day is excluded", () => {
    const sessions = [make("a", "2026-04-30"), make("b", "2026-05-01")];
    const enr: StudentEnrollment[] = [
      { course_id: "c1", enrolled_at: "2026-05-01T00:00:00Z" },
    ];
    expect(filterSessionsForStudent(sessions, enr).map((s) => s.id)).toEqual(["b"]);
  });

  it("session strictly after left_at day is excluded", () => {
    const sessions = [make("a", "2026-05-31"), make("b", "2026-06-01")];
    const enr: StudentEnrollment[] = [
      { course_id: "c1", enrolled_at: "2026-04-01T00:00:00Z", left_at: "2026-05-31T23:59:59Z" },
    ];
    expect(filterSessionsForStudent(sessions, enr).map((s) => s.id)).toEqual(["a"]);
  });
});

describe("totals stay consistent with boundary filtering", () => {
  it("present/absent/excused match filtered set on inclusive boundaries", () => {
    const sessions = [
      make("a", "2026-05-01"),
      make("b", "2026-05-15"),
      make("c", "2026-05-31"),
      make("d", "2026-06-01"), // outside
    ];
    const filtered = filterSessionsForStudent(sessions, enrollments, {
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
    });
    const totals = computeTotals(filtered, ["a"], [
      { session_id: "b", status: "approved", reason: "Sick" },
    ]);
    expect(totals).toEqual({ total: 3, present: 1, absent: 1, excused: 1 });
  });
});