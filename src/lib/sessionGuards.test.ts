import { describe, it, expect } from "vitest";
import {
  isSessionLaunchable,
  isVenueAllowed,
  canLecturerCreateSession,
  ALLOWED_VENUES,
} from "./sessionGuards";

const NOW = new Date("2026-05-10T12:00:00Z");

describe("isSessionLaunchable — completed/past blocking", () => {
  it("blocks completed sessions even if dated today", () => {
    expect(
      isSessionLaunchable({ status: "completed", session_date: "2026-05-10" }, NOW),
    ).toBe(false);
  });

  it("blocks terminated sessions", () => {
    expect(
      isSessionLaunchable({ status: "terminated", session_date: "2026-05-10" }, NOW),
    ).toBe(false);
  });

  it("blocks past-dated sessions regardless of status", () => {
    expect(
      isSessionLaunchable({ status: "scheduled", session_date: "2026-05-09" }, NOW),
    ).toBe(false);
    expect(
      isSessionLaunchable({ status: "active", session_date: "2026-05-01" }, NOW),
    ).toBe(false);
  });

  it("allows today's scheduled/active sessions", () => {
    expect(
      isSessionLaunchable({ status: "scheduled", session_date: "2026-05-10" }, NOW),
    ).toBe(true);
    expect(
      isSessionLaunchable({ status: "active", session_date: "2026-05-10" }, NOW),
    ).toBe(true);
  });

  it("allows future scheduled sessions", () => {
    expect(
      isSessionLaunchable({ status: "scheduled", session_date: "2026-06-01" }, NOW),
    ).toBe(true);
  });
});

describe("isVenueAllowed — institution venue whitelist", () => {
  it.each(ALLOWED_VENUES.map((v) => [v]))("allows %s", (v) => {
    expect(isVenueAllowed(v)).toBe(true);
  });

  it("rejects empty / null / arbitrary names", () => {
    expect(isVenueAllowed("")).toBe(false);
    expect(isVenueAllowed(null)).toBe(false);
    expect(isVenueAllowed(undefined)).toBe(false);
    expect(isVenueAllowed("Room 101")).toBe(false);
    expect(isVenueAllowed("library")).toBe(false); // case-sensitive
  });
});

describe("canLecturerCreateSession — module assignment", () => {
  it("allows when lecturer created the course", () => {
    expect(
      canLecturerCreateSession({
        lecturerId: "L1",
        courseId: "C1",
        courseCreatedBy: "L1",
        assignments: [],
      }),
    ).toBe(true);
  });

  it("allows when lecturer is in course_lecturers", () => {
    expect(
      canLecturerCreateSession({
        lecturerId: "L1",
        courseId: "C1",
        courseCreatedBy: "L2",
        assignments: [{ course_id: "C1", lecturer_id: "L1" }],
      }),
    ).toBe(true);
  });

  it("blocks when lecturer is unrelated to the course", () => {
    expect(
      canLecturerCreateSession({
        lecturerId: "L1",
        courseId: "C1",
        courseCreatedBy: "L2",
        assignments: [{ course_id: "C2", lecturer_id: "L1" }],
      }),
    ).toBe(false);
  });
});