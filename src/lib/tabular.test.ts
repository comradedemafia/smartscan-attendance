import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  isSpreadsheetFile,
  parseDelimited,
  parseSpreadsheet,
  readTabularFile,
} from "./tabular";
import { parseRegistryRows } from "./registryCsv";

function buildWorkbook(rows: unknown[][]): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Students");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" });
}

describe("parseDelimited", () => {
  it("parses quoted fields, embedded newlines, and escaped quotes", () => {
    const rows = parseDelimited(
      'name,code,notes\r\n"Doe, Jane",CS101,"Line one\nLine two"\r\n"Jane ""JJ"" Doe",CS102,ok',
    );

    expect(rows).toEqual([
      ["name", "code", "notes"],
      ["Doe, Jane", "CS101", "Line one\nLine two"],
      ['Jane "JJ" Doe', "CS102", "ok"],
    ]);
  });

  it("supports semicolon and tab delimiters", () => {
    expect(parseDelimited("name;code\nJane;CS101")).toEqual([
      ["name", "code"],
      ["Jane", "CS101"],
    ]);
    expect(parseDelimited("name\tcode\nJane\tCS101")).toEqual([
      ["name", "code"],
      ["Jane", "CS101"],
    ]);
  });

  it("ignores blank rows and a byte-order mark", () => {
    expect(parseDelimited("\uFEFFname,code\n\nJane,CS101\n")).toEqual([
      ["name", "code"],
      ["Jane", "CS101"],
    ]);
  });
});

describe("parseSpreadsheet", () => {
  it("reads the first worksheet into string rows", () => {
    const data = buildWorkbook([
      ["jina", "reg_number", "admission_number", "course", "department", "module_code", "gender"],
      ["Jane Doe", "2024-01-00001", "ADM-1", "BSc CS", "Computer Science", "CS101", "F"],
      ["John Doe", "2024-01-00002", "ADM-2", "BSc CS", "Computer Science", "CS102", "M"],
    ]);

    expect(parseSpreadsheet(data)).toEqual([
      ["jina", "reg_number", "admission_number", "course", "department", "module_code", "gender"],
      ["Jane Doe", "2024-01-00001", "ADM-1", "BSc CS", "Computer Science", "CS101", "F"],
      ["John Doe", "2024-01-00002", "ADM-2", "BSc CS", "Computer Science", "CS102", "M"],
    ]);
  });

  it("feeds spreadsheet rows into the registry parser", () => {
    const rows = parseSpreadsheet(
      buildWorkbook([
        ["jina", "reg_number", "course", "department", "module_code"],
        ["Jane Doe", 20240100001, "BSc CS", "Computer Science", "CS101"],
      ]),
    );

    const result = parseRegistryRows(rows);
    expect(result.missingRequiredColumns).toEqual([]);
    expect(result.students[0]).toMatchObject({
      university_id: "20240100001",
      full_name: "Jane Doe",
      modules: ["CS101"],
    });
  });
});

describe("isSpreadsheetFile", () => {
  it("recognizes Excel extensions and MIME types", () => {
    expect(isSpreadsheetFile({ name: "roster.XLSX", type: "" })).toBe(true);
    expect(isSpreadsheetFile({ name: "roster.xls", type: "" })).toBe(true);
    expect(
      isSpreadsheetFile({
        name: "upload",
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
    ).toBe(true);
    expect(isSpreadsheetFile({ name: "roster.csv", type: "text/csv" })).toBe(false);
  });
});

describe("readTabularFile", () => {
  it("parses CSV files as delimited text", async () => {
    const file = new File(["name,code\nJane,CS101"], "roster.csv", { type: "text/csv" });
    expect(await readTabularFile(file)).toEqual([
      ["name", "code"],
      ["Jane", "CS101"],
    ]);
  });

  it("parses Excel files as spreadsheets", async () => {
    const data = buildWorkbook([
      ["name", "code"],
      ["Jane", "CS101"],
    ]);
    const file = new File([data], "roster.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    expect(await readTabularFile(file)).toEqual([
      ["name", "code"],
      ["Jane", "CS101"],
    ]);
  });
});
