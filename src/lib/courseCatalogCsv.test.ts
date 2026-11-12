import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  buildCourseCatalogTemplateCsv,
  parseCourseCatalogCsv,
  parseCourseCatalogRows,
} from "./courseCatalogCsv";
import { parseSpreadsheet } from "./tabular";

function buildWorkbook(rows: unknown[][]): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Modules");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" });
}

describe("parseCourseCatalogCsv", () => {
  it("parses the template", () => {
    const result = parseCourseCatalogCsv(buildCourseCatalogTemplateCsv());
    expect(result.missingRequiredColumns).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      code: "CS101",
      name: "Introduction to Programming",
      department: "CS",
      level: "BTCCD",
      semester: "S1",
    });
  });

  it("supports column aliases and optional descriptions", () => {
    const csv = [
      "course_code,course_name,dept,nta_level,muhula",
      "cs201,Data Structures and Algorithms,CS,TCCD,S1",
    ].join("\n");

    const result = parseCourseCatalogCsv(csv);
    expect(result.rows[0]).toMatchObject({
      code: "CS201",
      name: "Data Structures and Algorithms",
      department: "CS",
      level: "TCCD",
      semester: "S1",
      description: null,
      errors: [],
    });
  });

  it("reports missing columns and required cells", () => {
    const result = parseCourseCatalogCsv("module_code,module_name\nCS101,Intro");
    expect(result.missingRequiredColumns).toEqual(["department", "level", "semester"]);
    expect(result.rows[0].errors).toEqual([
      "department is required",
      "level is required",
      "semester is required",
    ]);
  });

  it("flags duplicate module codes", () => {
    const csv = [
      "module_code,module_name,department,level,semester",
      "CS101,Intro,CS,BTCCD,S1",
      "CS101,Intro Again,CS,BTCCD,S1",
    ].join("\n");

    const result = parseCourseCatalogCsv(csv);
    expect(result.rows[0].errors.join(" ")).toContain("CS101 appears more than once");
    expect(result.rows[1].errors.join(" ")).toContain("CS101 appears more than once");
  });

  it("parses spreadsheet rows", () => {
    const rows = parseSpreadsheet(
      buildWorkbook([
        ["module_code", "module_name", "department", "level", "semester"],
        ["EE101", "Electrical Principles", "EE", "BTCCD", "S1"],
      ]),
    );

    const result = parseCourseCatalogRows(rows);
    expect(result.rows[0]).toMatchObject({
      code: "EE101",
      name: "Electrical Principles",
      errors: [],
    });
  });
});
