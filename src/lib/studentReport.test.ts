import { describe, it, expect } from "vitest";
import {
  filterSessionsForStudent,
  computeTotals,
  type StudentReportSession,
  type StudentEnrollment,
  type StudentExcuse,
} from "./studentReport";

const sessions: StudentReportSession[] = [
  { id: "s1", course_id: "c1", session_date: "2026-04-01", status: "completed" },
  { id: "s2", course_id: "c1", session_date: "2026-04-15", status: "completed" },
  { id: "s3", course_id: "c1", session_date: "2026-05-01", status: "completed" },
  { id: "s4", course_id: "c1", session_date: "2026-05-20", status: "completed" },
  { id: "s5", course_id: "c2", session_date: "2026-04-10", status: "completed" },
];

describe("filterSessionsForStudent — date filters", () => {
  const enrollments: StudentEnrollment[] = [
    { course_id: "c1", enrolled_at: "2026-01-01T00:00:00Z" },
    { course_id: "c2", enrolled_at: "2026-01-01T00:00:00Z" },
  ];

  it("returns all sessions when no date filter supplied", () => {
    const out = filterSessionsForStudent(sessions, enrollments);
    expect(out.map((s) => s.id)).toEqual(["s1", "s2", "s3", "s4", "s5"]);
  });

  it("filters by dateFrom (inclusive)", () => {
    const out = filterSessionsForStudent(sessions, enrollments, { dateFrom: "2026-05-01" });
    expect(out.map((s) => s.id)).toEqual(["s3", "s4"]);
  });

  it("filters by dateTo (inclusive)", () => {
    const out = filterSessionsForStudent(sessions, enrollments, { dateTo: "2026-04-15" });
    expect(out.map((s) => s.id).sort()).toEqual(["s1", "s2", "s5"]);
  });

  it("combines from/to", () => {
    const out = filterSessionsForStudent(sessions, enrollments, {
      dateFrom: "2026-04-10",
      dateTo: "2026-05-01",
    });
    expect(out.map((s) => s.id).sort()).toEqual(["s2", "s3", "s5"]);
  });
});

describe("filterSessionsForStudent — enrollment join/leave windows", () => {
  it("excludes sessions BEFORE enrolled_at", () => {
    const enrollments: StudentEnrollment[] = [
      { course_id: "c1", enrolled_at: "2026-04-20T00:00:00Z" },
    ];
    const out = filterSessionsForStudent(sessions.filter((s) => s.course_id === "c1"), enrollments);
    // s1 (apr-01) and s2 (apr-15) are before enrolled date, must be excluded
    expect(out.map((s) => s.id)).toEqual(["s3", "s4"]);
  });

  it("excludes sessions AFTER left_at when student has left a module", () => {
    const enrollments: StudentEnrollment[] = [
      {
        course_id: "c1",
        enrolled_at: "2026-01-01T00:00:00Z",
        left_at: "2026-04-30T23:59:59Z",
      },
    ];
    const out = filterSessionsForStudent(sessions.filter((s) => s.course_id === "c1"), enrollments);
    // s3 (may-01) and s4 (may-20) happen after leave date, must be excluded
    expect(out.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("returns empty when student is not enrolled in the course", () => {
    const out = filterSessionsForStudent(sessions, []);
    expect(out).toEqual([]);
  });
});

describe("computeTotals — present/absent/excused", () => {
  const filtered: StudentReportSession[] = sessions.slice(0, 4); // s1..s4 in c1

  it("counts present correctly", () => {
    const totals = computeTotals(filtered, ["s1", "s2"], []);
    expect(totals).toEqual({ total: 4, present: 2, absent: 2, excused: 0 });
  });

  it("counts approved excuses as excused (not absent)", () => {
    const excuses: StudentExcuse[] = [
      { session_id: "s3", status: "approved", reason: "Sick" },
      { session_id: "s4", status: "pending" }, // pending is still absent
    ];
    const totals = computeTotals(filtered, ["s1"], excuses);
    expect(totals).toEqual({ total: 4, present: 1, absent: 2, excused: 1 });
  });

  it("attended sessions take priority over excuses", () => {
    const excuses: StudentExcuse[] = [
      { session_id: "s1", status: "approved", reason: "Sick" }, // student attended anyway
    ];
    const totals = computeTotals(filtered, ["s1", "s2"], excuses);
    expect(totals.present).toBe(2);
    expect(totals.excused).toBe(0);
  });

  it("integrates with filterSessionsForStudent — totals exclude pre-join sessions", () => {
    const enrollments: StudentEnrollment[] = [
      { course_id: "c1", enrolled_at: "2026-04-20T00:00:00Z" },
    ];
    const filteredOut = filterSessionsForStudent(
      sessions.filter((s) => s.course_id === "c1"),
      enrollments,
    );
    // attended s1 (before join) must NOT count
    const totals = computeTotals(filteredOut, ["s1", "s3"], []);
    expect(totals).toEqual({ total: 2, present: 1, absent: 1, excused: 0 });
  });
});