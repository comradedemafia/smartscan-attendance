import { normalizeHeader, parseDelimited, readTabularFile, type TabularRow } from "./tabular";

export interface CourseCatalogRow {
  row_number: number;
  code: string;
  name: string;
  department: string;
  level: string;
  semester: string;
  description: string | null;
  errors: string[];
}

export interface CourseCatalogParseResult {
  headers: string[];
  columnMap: Record<string, string>;
  missingRequiredColumns: string[];
  rows: CourseCatalogRow[];
}

export const COURSE_CATALOG_TEMPLATE_HEADERS = [
  "module_code",
  "module_name",
  "department",
  "level",
  "semester",
  "description",
] as const;

const REQUIRED_COLUMNS = ["module_code", "module_name", "department", "level", "semester"] as const;

const COLUMN_ALIASES: Record<string, string[]> = {
  module_code: ["module_code", "course_code", "code", "module", "moduli"],
  module_name: ["module_name", "course_name", "name", "module_title", "jina_la_moduli"],
  department: ["department", "dept", "department_code", "department_name", "idara"],
  level: ["level", "level_code", "nta_level", "ngazi"],
  semester: ["semester", "semester_code", "muhula"],
  description: ["description", "details", "maelezo"],
};

function cellValue(raw: Record<string, string>, columnMap: Record<string, string>, key: string): string {
  const column = columnMap[key];
  return column ? (raw[column] ?? "").trim() : "";
}

function optional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseCourseCatalogRows(rows: TabularRow[]): CourseCatalogParseResult {
  if (rows.length === 0) {
    return {
      headers: [],
      columnMap: {},
      missingRequiredColumns: [...REQUIRED_COLUMNS],
      rows: [],
    };
  }

  const headers = rows[0].map(normalizeHeader);
  const columnMap: Record<string, string> = {};
  for (const key of Object.keys(COLUMN_ALIASES)) {
    const found = COLUMN_ALIASES[key].find((alias) => headers.includes(alias));
    if (found) columnMap[key] = found;
  }

  const missingRequiredColumns = REQUIRED_COLUMNS.filter((key) => !columnMap[key]);
  const parsedRows: CourseCatalogRow[] = [];

  rows.slice(1).forEach((cells, index) => {
    const raw: Record<string, string> = {};
    headers.forEach((header, columnIndex) => {
      raw[header] = cells[columnIndex] ?? "";
    });

    const code = cellValue(raw, columnMap, "module_code").toUpperCase();
    const name = cellValue(raw, columnMap, "module_name");
    const department = cellValue(raw, columnMap, "department");
    const level = cellValue(raw, columnMap, "level");
    const semester = cellValue(raw, columnMap, "semester");
    const description = optional(cellValue(raw, columnMap, "description"));

    if (!code && !name && !department && !level && !semester && !description) return;

    const errors: string[] = [];
    if (!code) errors.push("module code is required");
    if (!name) errors.push("module name is required");
    if (!department) errors.push("department is required");
    if (!level) errors.push("level is required");
    if (!semester) errors.push("semester is required");

    parsedRows.push({
      row_number: index + 2,
      code,
      name,
      department,
      level,
      semester,
      description,
      errors,
    });
  });

  const rowsByCode = new Map<string, CourseCatalogRow[]>();
  for (const row of parsedRows) {
    if (!row.code) continue;
    const matches = rowsByCode.get(row.code) ?? [];
    matches.push(row);
    rowsByCode.set(row.code, matches);
  }
  for (const [code, matches] of rowsByCode) {
    if (matches.length > 1) {
      for (const row of matches) row.errors.push(`module code ${code} appears more than once`);
    }
  }

  return { headers, columnMap, missingRequiredColumns, rows: parsedRows };
}

export function parseCourseCatalogCsv(text: string): CourseCatalogParseResult {
  return parseCourseCatalogRows(parseDelimited(text));
}

export async function parseCourseCatalogFile(file: File): Promise<CourseCatalogParseResult> {
  return parseCourseCatalogRows(await readTabularFile(file));
}

export function buildCourseCatalogTemplateCsv(): string {
  return [
    COURSE_CATALOG_TEMPLATE_HEADERS.join(","),
    "CS101,Introduction to Programming,CS,BTCCD,S1,Foundations of programming and problem solving",
  ].join("\n");
}
