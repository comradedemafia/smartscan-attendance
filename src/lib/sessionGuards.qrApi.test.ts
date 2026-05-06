import { describe, it, expect } from "vitest";
import {
  isSessionLaunchable,
  isVenueAllowed,
  canLecturerCreateSession,
  ALLOWED_VENUES,
} from "./sessionGuards";

// Regression coverage for the rules a malicious lecturer might try to bypass
// by calling the QR / sessions API directly. The same predicates are used
// both in the UI (to gate the "Generate QR" button) and on the server
// (validate_session_venue trigger + RLS course_lecturers check), so verifying
// them here pins both ends of the contract.

const FIXED_NOW = new Date("2026-05-15T10:00:00Z");

describe("QR generation API — past / completed sessions are rejected", () => {
  it("rejects a session whose date is yesterday", () => {
    expect(
      isSessionLaunchable({ status: "scheduled", session_date: "2026-05-14" }, FIXED_NOW),
    ).toBe(false);
  });

  it("rejects a session marked completed even if dated today", () => {
    expect(
      isSessionLaunchable({ status: "completed", session_date: "2026-05-15" }, FIXED_NOW),
    ).toBe(false);
  });

  it("rejects a session marked terminated", () => {
    expect(
      isSessionLaunchable({ status: "terminated", session_date: "2026-05-15" }, FIXED_NOW),
    ).toBe(false);
  });

  it("rejects a long-past completed session (the bypass scenario)", () => {
    expect(
      isSessionLaunchable({ status: "completed", session_date: "2025-01-01" }, FIXED_NOW),
    ).toBe(false);
  });

  it("allows a future scheduled session", () => {
    expect(
      isSessionLaunchable({ status: "scheduled", session_date: "2026-05-20" }, FIXED_NOW),
    ).toBe(true);
  });

  it("allows a session dated today that is still active", () => {
    expect(
      isSessionLaunchable({ status: "active", session_date: "2026-05-15" }, FIXED_NOW),
    ).toBe(true);
  });
});

describe("QR generation API — venue whitelist enforcement", () => {
  it.each([...ALLOWED_VENUES])("accepts allowed venue %s", (v) => {
    expect(isVenueAllowed(v)).toBe(true);
  });

  it.each([
    "Lecture Theatre 1",
    "Room 101",
    "library", // case-sensitive: trigger uses exact match
    " VIP",
    "VIP ",
    "",
    null,
    undefined,
  ])("rejects disallowed venue %p", (v) => {
    expect(isVenueAllowed(v as any)).toBe(false);
  });
});

describe("QR generation API — course/module assignment cannot be bypassed", () => {
  const lecturerId = "lect-1";
  const otherLecturerId = "lect-2";
  const courseId = "course-A";

  it("allows the lecturer who created the course", () => {
    expect(
      canLecturerCreateSession({
        lecturerId,
        courseId,
        courseCreatedBy: lecturerId,
        assignments: [],
      }),
    ).toBe(true);
  });

  it("allows a lecturer explicitly assigned via course_lecturers", () => {
    expect(
      canLecturerCreateSession({
        lecturerId,
        courseId,
        courseCreatedBy: otherLecturerId,
        assignments: [{ course_id: courseId, lecturer_id: lecturerId }],
      }),
    ).toBe(true);
  });

  it("rejects a lecturer who is neither the creator nor an assignee", () => {
    expect(
      canLecturerCreateSession({
        lecturerId,
        courseId,
        courseCreatedBy: otherLecturerId,
        assignments: [{ course_id: "course-B", lecturer_id: lecturerId }],
      }),
    ).toBe(false);
  });

  it("rejects when the assignment row is for a different lecturer (spoofing attempt)", () => {
    expect(
      canLecturerCreateSession({
        lecturerId,
        courseId,
        courseCreatedBy: otherLecturerId,
        assignments: [{ course_id: courseId, lecturer_id: otherLecturerId }],
      }),
    ).toBe(false);
  });

  it("rejects when lecturerId or courseId is empty (defense in depth)", () => {
    expect(
      canLecturerCreateSession({
        lecturerId: "",
        courseId,
        courseCreatedBy: lecturerId,
        assignments: [],
      }),
    ).toBe(false);
    expect(
      canLecturerCreateSession({
        lecturerId,
        courseId: "",
        courseCreatedBy: lecturerId,
        assignments: [],
      }),
    ).toBe(false);
  });
});

describe("QR generation API — combined precondition (the actual gate)", () => {
  // The server-side gate is logically: launchable AND venue allowed AND lecturer assigned.
  // Mirror that here so a future refactor can't silently drop one check.
  function canGenerateQr(args: {
    session: { status?: string; session_date?: string; venue_name?: string | null };
    lecturerId: string;
    courseId: string;
    courseCreatedBy?: string | null;
    assignments: { course_id: string; lecturer_id: string }[];
    now?: Date;
  }) {
    return (
      isSessionLaunchable(args.session, args.now ?? FIXED_NOW) &&
      isVenueAllowed(args.session.venue_name) &&
      canLecturerCreateSession({
        lecturerId: args.lecturerId,
        courseId: args.courseId,
        courseCreatedBy: args.courseCreatedBy,
        assignments: args.assignments,
      })
    );
  }

  const baseAssignments = [{ course_id: "course-A", lecturer_id: "lect-1" }];

  it("happy path passes all three checks", () => {
    expect(
      canGenerateQr({
        session: { status: "scheduled", session_date: "2026-05-20", venue_name: "LIBRARY" },
        lecturerId: "lect-1",
        courseId: "course-A",
        assignments: baseAssignments,
      }),
    ).toBe(true);
  });

  it("a valid lecturer with a valid venue STILL cannot generate QR for a past session", () => {
    expect(
      canGenerateQr({
        session: { status: "scheduled", session_date: "2026-05-01", venue_name: "LIBRARY" },
        lecturerId: "lect-1",
        courseId: "course-A",
        assignments: baseAssignments,
      }),
    ).toBe(false);
  });

  it("a valid lecturer cannot bypass the venue whitelist", () => {
    expect(
      canGenerateQr({
        session: { status: "scheduled", session_date: "2026-05-20", venue_name: "Room 101" },
        lecturerId: "lect-1",
        courseId: "course-A",
        assignments: baseAssignments,
      }),
    ).toBe(false);
  });

  it("an unassigned lecturer cannot create a QR even for a valid session/venue", () => {
    expect(
      canGenerateQr({
        session: { status: "scheduled", session_date: "2026-05-20", venue_name: "LIBRARY" },
        lecturerId: "lect-99",
        courseId: "course-A",
        assignments: baseAssignments,
      }),
    ).toBe(false);
  });
});