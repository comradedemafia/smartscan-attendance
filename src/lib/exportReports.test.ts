import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  filterSessionsForStudent,
  computeTotals,
  type StudentReportSession,
  type StudentEnrollment,
  type StudentExcuse,
} from "./studentReport";

// ---- Mock jsPDF + jspdf-autotable + xlsx so exports don't touch the DOM ----
const autoTableCalls: any[] = [];
const pdfSaveCalls: string[] = [];
const xlsxSheets: any[][][] = [];
const xlsxFiles: string[] = [];

vi.mock("jspdf", () => {
  return {
    default: class {
      setFontSize() {}
      setTextColor() {}
      text() {}
      save(name: string) {
        pdfSaveCalls.push(name);
      }
    },
  };
});

vi.mock("jspdf-autotable", () => ({
  default: (_doc: any, opts: any) => {
    autoTableCalls.push(opts);
  },
}));

vi.mock("xlsx", () => ({
  utils: {
    aoa_to_sheet: (data: any[][]) => {
      xlsxSheets.push(data);
      return { "!cols": undefined } as any;
    },
    book_new: () => ({}),
    book_append_sheet: () => {},
  },
  writeFile: (_wb: any, name: string) => {
    xlsxFiles.push(name);
  },
}));

// Imported AFTER mocks are registered.
import { exportToPDF, exportToExcel } from "./exportReports";

beforeEach(() => {
  autoTableCalls.length = 0;
  pdfSaveCalls.length = 0;
  xlsxSheets.length = 0;
  xlsxFiles.length = 0;
});

// ---- Build a Daily Report payload exactly like src/pages/Reports.tsx does ----
function buildDailyPayload(
  sessions: StudentReportSession[],
  enrollments: StudentEnrollment[],
  attended: string[],
  excuses: StudentExcuse[],
  range?: { dateFrom?: string; dateTo?: string },
) {
  const filtered = filterSessionsForStudent(sessions, enrollments, range);
  const attendedSet = new Set(attended);
  const excuseMap = new Map(excuses.map((e) => [e.session_id, e]));
  const daily = filtered.map((s) => {
    const wasAttended = attendedSet.has(s.id);
    const ex = excuseMap.get(s.id);
    const status = wasAttended
      ? "present"
      : ex?.status === "approved"
        ? "excused"
        : "absent";
    return {
      date: s.session_date,
      module: s.course_id,
      title: `Session ${s.id}`,
      venue: "LIBRARY",
      status,
      excuseReason: ex?.reason || "—",
    };
  });
  return { daily, totals: computeTotals(filtered, attendedSet, excuses) };
}

const SESSIONS: StudentReportSession[] = [
  { id: "s1", course_id: "c1", session_date: "2026-05-01", status: "completed" },
  { id: "s2", course_id: "c1", session_date: "2026-05-08", status: "completed" },
  { id: "s3", course_id: "c1", session_date: "2026-05-15", status: "completed" },
  { id: "s4", course_id: "c1", session_date: "2026-05-22", status: "completed" },
];
const ENROLLMENTS: StudentEnrollment[] = [
  { course_id: "c1", enrolled_at: "2026-04-01T00:00:00Z" },
];

describe("Student Reports — Daily PDF export includes Excuse column + matching totals", () => {
  it("PDF body rows reflect filtered present/absent/excused and carry excuse reason", () => {
    const { daily, totals } = buildDailyPayload(
      SESSIONS,
      ENROLLMENTS,
      ["s1", "s2"], // present
      [{ session_id: "s3", status: "approved", reason: "Hospitalised" }],
    );

    expect(totals).toEqual({ total: 4, present: 2, absent: 1, excused: 1 });

    exportToPDF({
      title: "Daily Report",
      columns: [
        { header: "Date", key: "date" },
        { header: "Module", key: "module" },
        { header: "Session", key: "title" },
        { header: "Venue", key: "venue" },
        { header: "Status", key: "status" },
        { header: "Excuse / Permission", key: "excuseReason" },
      ],
      rows: daily,
    });

    expect(autoTableCalls).toHaveLength(1);
    const call = autoTableCalls[0];
    const headers = call.head[0];
    expect(headers).toContain("Excuse / Permission");

    const excuseColIdx = headers.indexOf("Excuse / Permission");
    const statusColIdx = headers.indexOf("Status");
    const body: string[][] = call.body;

    // Row count matches filtered totals.
    expect(body).toHaveLength(totals.total);

    const presentRows = body.filter((r) => r[statusColIdx] === "present");
    const absentRows = body.filter((r) => r[statusColIdx] === "absent");
    const excusedRows = body.filter((r) => r[statusColIdx] === "excused");
    expect(presentRows).toHaveLength(totals.present);
    expect(absentRows).toHaveLength(totals.absent);
    expect(excusedRows).toHaveLength(totals.excused);

    // Excuse reason rendered for the excused session.
    expect(excusedRows[0][excuseColIdx]).toBe("Hospitalised");
  });
});

describe("Student Reports — Daily Excel export includes Excuse column + matching totals", () => {
  it("Excel sheet contains Excuse column header and reason cell", () => {
    const { daily, totals } = buildDailyPayload(
      SESSIONS,
      ENROLLMENTS,
      ["s1"],
      [
        { session_id: "s2", status: "approved", reason: "Family emergency" },
        { session_id: "s3", status: "pending", reason: "Late bus" }, // still absent
      ],
      { dateFrom: "2026-05-01", dateTo: "2026-05-31" },
    );

    expect(totals).toEqual({ total: 4, present: 1, absent: 2, excused: 1 });

    exportToExcel({
      title: "Daily Report",
      columns: [
        { header: "Date", key: "date" },
        { header: "Module", key: "module" },
        { header: "Session", key: "title" },
        { header: "Venue", key: "venue" },
        { header: "Status", key: "status" },
        { header: "Excuse / Permission", key: "excuseReason" },
      ],
      rows: daily,
      dateRange: { from: "2026-05-01", to: "2026-05-31" },
    });

    expect(xlsxSheets).toHaveLength(1);
    const sheet = xlsxSheets[0];

    // Find header row (the one matching our columns)
    const headerRow = sheet.find((r) => r[0] === "Date" && r.includes("Excuse / Permission"));
    expect(headerRow).toBeTruthy();
    const excuseIdx = headerRow!.indexOf("Excuse / Permission");
    const statusIdx = headerRow!.indexOf("Status");

    // Data rows come after the header row.
    const headerPos = sheet.indexOf(headerRow!);
    const dataRows = sheet.slice(headerPos + 1);
    expect(dataRows).toHaveLength(totals.total);

    const excused = dataRows.filter((r) => r[statusIdx] === "excused");
    expect(excused).toHaveLength(1);
    expect(excused[0][excuseIdx]).toBe("Family emergency");

    // PDF/Excel filename written
    expect(xlsxFiles[0]).toMatch(/Daily_Report_.*\.xlsx$/);
  });
});

describe("Student Reports — General Summary export carries excuseReasons aggregate", () => {
  it("PDF general row contains the joined excuse reasons", () => {
    // Mirror Reports.tsx general tab: one row per module with reasons aggregated
    const filtered = filterSessionsForStudent(SESSIONS, ENROLLMENTS);
    const attendedSet = new Set(["s1"]);
    const excuses: StudentExcuse[] = [
      { session_id: "s2", status: "approved", reason: "Sick" },
      { session_id: "s3", status: "approved", reason: "Travel" },
    ];
    const totals = computeTotals(filtered, attendedSet, excuses);

    const reasons = filtered
      .filter((s) => !attendedSet.has(s.id))
      .map((s) => excuses.find((e) => e.session_id === s.id)?.reason)
      .filter(Boolean);

    exportToPDF({
      title: "General Summary",
      columns: [
        { header: "Student", key: "name" },
        { header: "Reg No", key: "uid" },
        { header: "Module", key: "module" },
        { header: "Total", key: "total" },
        { header: "Attended", key: "attended" },
        { header: "Missed", key: "missed" },
        { header: "Excused", key: "excused" },
        { header: "Excuse / Permission", key: "excuseReasons" },
      ],
      rows: [
        {
          name: "Asha",
          uid: "S/123",
          module: "C1 — Course",
          total: totals.total,
          attended: totals.present,
          missed: totals.absent + totals.excused,
          excused: totals.excused,
          excuseReasons: reasons.join("; "),
        },
      ],
    });

    const headers = autoTableCalls[0].head[0];
    expect(headers).toContain("Excuse / Permission");
    const idx = headers.indexOf("Excuse / Permission");
    expect(autoTableCalls[0].body[0][idx]).toBe("Sick; Travel");
  });
});