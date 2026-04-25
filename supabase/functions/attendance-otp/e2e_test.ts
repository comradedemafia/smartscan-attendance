// End-to-end style test for the attendance-otp flow.
//
// Strategy: rather than spinning up the full HTTP server (which would require
// a running Deno HTTP listener + a real authenticated JWT), we exercise the
// critical pure logic that the edge function relies on:
//
//   1. QR code "scan"    — student presents (session_id, qr_code_secret)
//   2. OTP generation    — student's TOTP app produces a 6-digit code
//   3. OTP verification  — backend confirms the code with verifyTOTPDetailed
//   4. Replay protection — same (session, counter) cannot be reused
//   5. Attendance record — successful verification produces a record row
//
// The test models the edge function's in-memory state (sessions table,
// replay-guard table, attendance_records table) with simple Maps so it runs
// fast and offline, while still exercising the real cryptographic + replay
// logic.

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  generateTOTPAt,
  verifyTOTPDetailed,
  TOTP_TIME_STEP,
  TOTP_DIGITS,
} from "./index.ts";

type SessionRow = {
  id: string;
  qr_code_secret: string;
  qr_expires_at: number;
  status: "active" | "ended";
  course_id: string;
};

type AttendanceRow = {
  session_id: string;
  user_id: string;
  status: "present";
};

type ReplayKey = string; // `${session_id}:${user_id}:${counter}`

function makeStore() {
  const sessions = new Map<string, SessionRow>();
  const replay = new Set<ReplayKey>();
  const attendance: AttendanceRow[] = [];
  const enrollments = new Set<string>(); // `${user_id}:${course_id}`
  return { sessions, replay, attendance, enrollments };
}

// Mirrors the verify-scan-totp path of the edge function.
async function attendanceFlow(opts: {
  store: ReturnType<typeof makeStore>;
  user_id: string;
  session_id: string;
  qr_secret: string;
  totp_secret: string;
  presentedCode: string;
}): Promise<
  | { ok: true; offset: number; counter: number }
  | { ok: false; reason: string }
> {
  const { store } = opts;
  const session = store.sessions.get(opts.session_id);
  if (!session) return { ok: false, reason: "SESSION_NOT_FOUND" };
  if (session.qr_code_secret !== opts.qr_secret) {
    return { ok: false, reason: "INVALID_QR" };
  }
  if (session.status !== "active" || session.qr_expires_at < Date.now()) {
    return { ok: false, reason: "QR_EXPIRED" };
  }
  if (!store.enrollments.has(`${opts.user_id}:${session.course_id}`)) {
    return { ok: false, reason: "NOT_ENROLLED" };
  }
  if (
    store.attendance.some(
      (a) => a.session_id === opts.session_id && a.user_id === opts.user_id,
    )
  ) {
    return { ok: false, reason: "DUPLICATE" };
  }

  const result = await verifyTOTPDetailed(opts.totp_secret, opts.presentedCode);
  if (!result.valid || result.counter === null) {
    return { ok: false, reason: "INVALID_OTP" };
  }

  const replayKey: ReplayKey =
    `${opts.session_id}:${opts.user_id}:${result.counter}`;
  if (store.replay.has(replayKey)) {
    return { ok: false, reason: "REPLAY_DETECTED" };
  }
  store.replay.add(replayKey);

  store.attendance.push({
    session_id: opts.session_id,
    user_id: opts.user_id,
    status: "present",
  });
  return { ok: true, offset: result.offset!, counter: result.counter };
}

const SECRET = "JBSWY3DPEHPK3PXP";

Deno.test("E2E: full attendance flow QR -> OTP -> record", async () => {
  const store = makeStore();
  const session_id = "11111111-1111-1111-1111-111111111111";
  const course_id = "22222222-2222-2222-2222-222222222222";
  const user_id = "33333333-3333-3333-3333-333333333333";

  store.sessions.set(session_id, {
    id: session_id,
    qr_code_secret: "qr-secret-abc",
    qr_expires_at: Date.now() + 60_000,
    status: "active",
    course_id,
  });
  store.enrollments.add(`${user_id}:${course_id}`);

  const counter = Math.floor(Date.now() / 1000 / TOTP_TIME_STEP);
  const code = await generateTOTPAt(SECRET, counter, TOTP_DIGITS);

  const result = await attendanceFlow({
    store,
    user_id,
    session_id,
    qr_secret: "qr-secret-abc",
    totp_secret: SECRET,
    presentedCode: code,
  });

  assert(result.ok, `expected success, got ${JSON.stringify(result)}`);
  if (result.ok) {
    assertEquals(result.offset, 0);
    assertEquals(result.counter, counter);
  }
  assertEquals(store.attendance.length, 1);
  assertEquals(store.attendance[0].user_id, user_id);
  assertEquals(store.replay.size, 1);
});

Deno.test("E2E: replay protection rejects re-used OTP for same session+counter", async () => {
  const store = makeStore();
  const session_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const course_id = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const user_id = "cccccccc-cccc-cccc-cccc-cccccccccccc";

  store.sessions.set(session_id, {
    id: session_id,
    qr_code_secret: "qr-1",
    qr_expires_at: Date.now() + 60_000,
    status: "active",
    course_id,
  });
  store.enrollments.add(`${user_id}:${course_id}`);

  const counter = Math.floor(Date.now() / 1000 / TOTP_TIME_STEP);
  const code = await generateTOTPAt(SECRET, counter, TOTP_DIGITS);

  const first = await attendanceFlow({
    store, user_id, session_id, qr_secret: "qr-1", totp_secret: SECRET, presentedCode: code,
  });
  assert(first.ok);

  // Simulate a duplicate row blocked first (same session+user already has attendance)
  const second = await attendanceFlow({
    store, user_id, session_id, qr_secret: "qr-1", totp_secret: SECRET, presentedCode: code,
  });
  assert(!second.ok);
  if (!second.ok) {
    // The DUPLICATE check fires before replay; both are valid rejections.
    assert(
      second.reason === "DUPLICATE" || second.reason === "REPLAY_DETECTED",
      `unexpected reason: ${second.reason}`,
    );
  }
});

Deno.test("E2E: replay guard blocks reuse for a different user-less retry path", async () => {
  // Simulate the case where the attendance row was rolled back but the replay
  // guard already recorded the counter — the same code MUST NOT verify twice.
  const store = makeStore();
  const session_id = "dddddddd-dddd-dddd-dddd-dddddddddddd";
  const course_id = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
  const user_id = "ffffffff-ffff-ffff-ffff-ffffffffffff";

  store.sessions.set(session_id, {
    id: session_id,
    qr_code_secret: "qr-2",
    qr_expires_at: Date.now() + 60_000,
    status: "active",
    course_id,
  });
  store.enrollments.add(`${user_id}:${course_id}`);

  const counter = Math.floor(Date.now() / 1000 / TOTP_TIME_STEP);
  const code = await generateTOTPAt(SECRET, counter, TOTP_DIGITS);

  // Pre-seed the replay guard, then clear attendance, then retry.
  store.replay.add(`${session_id}:${user_id}:${counter}`);

  const result = await attendanceFlow({
    store, user_id, session_id, qr_secret: "qr-2", totp_secret: SECRET, presentedCode: code,
  });
  assert(!result.ok);
  if (!result.ok) assertEquals(result.reason, "REPLAY_DETECTED");
  assertEquals(store.attendance.length, 0);
});

Deno.test("E2E: rejects expired QR", async () => {
  const store = makeStore();
  const session_id = "99999999-9999-9999-9999-999999999999";
  const course_id = "88888888-8888-8888-8888-888888888888";
  const user_id = "77777777-7777-7777-7777-777777777777";
  store.sessions.set(session_id, {
    id: session_id,
    qr_code_secret: "qr-exp",
    qr_expires_at: Date.now() - 1000,
    status: "active",
    course_id,
  });
  store.enrollments.add(`${user_id}:${course_id}`);

  const counter = Math.floor(Date.now() / 1000 / TOTP_TIME_STEP);
  const code = await generateTOTPAt(SECRET, counter, TOTP_DIGITS);

  const r = await attendanceFlow({
    store, user_id, session_id, qr_secret: "qr-exp", totp_secret: SECRET, presentedCode: code,
  });
  assert(!r.ok);
  if (!r.ok) assertEquals(r.reason, "QR_EXPIRED");
});

Deno.test("E2E: rejects non-enrolled student", async () => {
  const store = makeStore();
  const session_id = "12345678-1234-1234-1234-123456789012";
  store.sessions.set(session_id, {
    id: session_id,
    qr_code_secret: "qr-3",
    qr_expires_at: Date.now() + 60_000,
    status: "active",
    course_id: "course-x",
  });

  const counter = Math.floor(Date.now() / 1000 / TOTP_TIME_STEP);
  const code = await generateTOTPAt(SECRET, counter, TOTP_DIGITS);

  const r = await attendanceFlow({
    store,
    user_id: "user-x",
    session_id,
    qr_secret: "qr-3",
    totp_secret: SECRET,
    presentedCode: code,
  });
  assert(!r.ok);
  if (!r.ok) assertEquals(r.reason, "NOT_ENROLLED");
});