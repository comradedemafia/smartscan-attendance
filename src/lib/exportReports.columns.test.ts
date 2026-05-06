import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks must be registered before importing the module under test.
const autoTableCalls: any[] = [];
const xlsxSheets: any[][][] = [];

vi.mock("jspdf", () => ({
  default: class {
    setFontSize() {}
    setTextColor() {}
    text() {}
    save() {}
  },
}));
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
  writeFile: () => {},
}));

import { exportToPDF, exportToExcel } from "./exportReports";

beforeEach(() => {
  autoTableCalls.length = 0;
  xlsxSheets.length = 0;
});

const DAILY_COLUMNS = [
  { header: "Date", key: "date" },
  { header: "Module", key: "module" },
  { header: "Session", key: "title" },
  { header: "Venue", key: "venue" },
  { header: "Status", key: "status" },
  { header: "Excuse / Permission", key: "excuseReason" },
];

const GENERAL_COLUMNS = [
  { header: "Student", key: "name" },
  { header: "Reg No", key: "uid" },
  { header: "Module", key: "module" },
  { header: "Total", key: "total" },
  { header: "Attended", key: "attended" },
  { header: "Missed", key: "missed" },
  { header: "Excused", key: "excused" },
  { header: "Excuse / Permission", key: "excuseReasons" },
];

describe("exportReports — column order is preserved exactly", () => {
  it("PDF Daily export emits headers in the declared order with Excuse/Permission last", () => {
    exportToPDF({
      title: "Daily Report",
      columns: DAILY_COLUMNS,
      rows: [
        { date: "2026-05-01", module: "C1", title: "S1", venue: "LIBRARY", status: "present", excuseReason: "" },
      ],
    });
    const headers: string[] = autoTableCalls[0].head[0];
    expect(headers).toEqual([
      "Date",
      "Module",
      "Session",
      "Venue",
      "Status",
      "Excuse / Permission",
    ]);
    expect(headers[headers.length - 1]).toBe("Excuse / Permission");
  });

  it("PDF General export emits headers in the declared order with Excuse/Permission last", () => {
    exportToPDF({
      title: "General Summary",
      columns: GENERAL_COLUMNS,
      rows: [
        { name: "A", uid: "S/1", module: "C1", total: 1, attended: 1, missed: 0, excused: 0, excuseReasons: "" },
      ],
    });
    expect(autoTableCalls[0].head[0]).toEqual([
      "Student",
      "Reg No",
      "Module",
      "Total",
      "Attended",
      "Missed",
      "Excused",
      "Excuse / Permission",
    ]);
  });

  it("Excel Daily export header row preserves the declared column order", () => {
    exportToExcel({
      title: "Daily Report",
      columns: DAILY_COLUMNS,
      rows: [
        { date: "2026-05-01", module: "C1", title: "S1", venue: "LIBRARY", status: "present", excuseReason: "" },
      ],
    });
    const sheet = xlsxSheets[0];
    const header = sheet.find((r) => r[0] === "Date" && r.includes("Excuse / Permission"))!;
    expect(header).toEqual([
      "Date",
      "Module",
      "Session",
      "Venue",
      "Status",
      "Excuse / Permission",
    ]);
  });
});

describe("exportReports — em dash placeholder when no excuse exists", () => {
  it("PDF row renders an em dash when excuseReason is missing/empty/null/undefined", () => {
    exportToPDF({
      title: "Daily Report",
      columns: DAILY_COLUMNS,
      rows: [
        { date: "2026-05-01", module: "C1", title: "S1", venue: "LIBRARY", status: "present" },
        { date: "2026-05-02", module: "C1", title: "S2", venue: "LIBRARY", status: "absent", excuseReason: null },
        { date: "2026-05-03", module: "C1", title: "S3", venue: "LIBRARY", status: "absent", excuseReason: undefined },
      ],
    });
    const headers: string[] = autoTableCalls[0].head[0];
    const idx = headers.indexOf("Excuse / Permission");
    const body: string[][] = autoTableCalls[0].body;
    expect(body).toHaveLength(3);
    for (const row of body) {
      expect(row[idx]).toBe("—");
    }
  });

  it("Excel row renders an em dash when excuseReason is missing/empty/null/undefined", () => {
    exportToExcel({
      title: "Daily Report",
      columns: DAILY_COLUMNS,
      rows: [
        { date: "2026-05-01", module: "C1", title: "S1", venue: "LIBRARY", status: "present" },
        { date: "2026-05-02", module: "C1", title: "S2", venue: "LIBRARY", status: "absent", excuseReason: null },
      ],
    });
    const sheet = xlsxSheets[0];
    const header = sheet.find((r) => r[0] === "Date" && r.includes("Excuse / Permission"))!;
    const idx = header.indexOf("Excuse / Permission");
    const headerPos = sheet.indexOf(header);
    const dataRows = sheet.slice(headerPos + 1);
    expect(dataRows).toHaveLength(2);
    for (const row of dataRows) {
      expect(row[idx]).toBe("—");
    }
  });

  it("PDF General row renders em dash when no excuses for the module", () => {
    exportToPDF({
      title: "General Summary",
      columns: GENERAL_COLUMNS,
      rows: [
        { name: "A", uid: "S/1", module: "C1", total: 2, attended: 2, missed: 0, excused: 0 },
      ],
    });
    const headers: string[] = autoTableCalls[0].head[0];
    const idx = headers.indexOf("Excuse / Permission");
    expect(autoTableCalls[0].body[0][idx]).toBe("—");
  });
});