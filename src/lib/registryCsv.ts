import { normalizeHeader, parseDelimited, readTabularFile, type TabularRow } from "./tabular";

export type RegistryGender = "M" | "F";
export type RegistryStatus = "active" | "suspended" | "graduated" | "inactive";

export interface RegistryStudentInput {
  university_id: string;
  admission_number: string | null;
  full_name: string;
  email: string | null;
  gender: RegistryGender | null;
  department_raw: string | null;
  programme: string | null;
  study_year: number | null;
  semester: string | null;
  academic_year: string | null;
  phone: string | null;
  status: RegistryStatus;
  modules: string[];
  row_numbers: number[];
  errors: string[];
}

export interface RegistryParseResult {
  headers: string[];
  columnMap: Record<string, string>;
  missingRequiredColumns: string[];
  students: RegistryStudentInput[];
}

export const REGISTRY_TEMPLATE_HEADERS = [
  "jina",
  "reg_number",
  "admission_number",
  "course",
  "department",
  "module_code",
  "gender",
] as const;

const REQUIRED_COLUMNS = ["full_name", "university_id", "department", "programme"] as const;

const COLUMN_ALIASES: Record<string, string[]> = {
  full_name: ["full_name", "name", "jina", "majina", "student_name"],
  university_id: [
    "university_id",
    "reg_number",
    "reg_no",
    "regnumber",
    "registration_number",
    "registration_no",
    "namba_ya_usajili",
    "reg",
  ],
  admission_number: [
    "admission_number",
    "admission_no",
    "admissionnumber",
    "admission",
    "namba_ya_kudahiliwa",
  ],
  programme: ["programme", "program", "course", "kozi", "program_of_study"],
  department: ["department", "dept", "department_name", "department_code", "idara"],
  module_code: [
    "module_code",
    "module",
    "modulecode",
    "course_code",
    "module_code_",
    "moduli",
    "code",
  ],
  gender: ["gender", "jinsia", "sex"],
  email: ["email", "barua_pepe", "e_mail"],
  phone: ["phone", "simu", "simu_no", "phone_number"],
  academic_year: ["academic_year", "mwaka_wa_masomo", "year"],
  study_year: ["study_year", "year_of_study", "mwaka_wa_utafiti", "level", "ngazi"],
  semester: ["semester", "muhula"],
  status: ["status", "hali"],
};

function cellValue(raw: Record<string, string>, columnMap: Record<string, string>, key: string): string {
  const column = columnMap[key];
  return column ? (raw[column] ?? "").trim() : "";
}

function optional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeGender(value: string): RegistryGender | null {
  const normalized = value.trim().toLowerCase();
  if (["m", "male", "me", "mwanaume", "mume"].includes(normalized)) return "M";
  if (["f", "female", "ke", "mwanamke", "mke"].includes(normalized)) return "F";
  return null;
}

function normalizeStatus(value: string): RegistryStatus {
  const normalized = value.trim().toLowerCase();
  if (["suspended", "susp", "amesimamishwa"].includes(normalized)) return "suspended";
  if (["graduated", "graduate", "alumni", "amehitimu"].includes(normalized)) return "graduated";
  if (["inactive", "inactive_student", "hayupo"].includes(normalized)) return "inactive";
  return "active";
}

function normalizeModuleCodes(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[;,|/\n]+/)
        .map((code) => code.trim().toUpperCase())
        .filter((code) => code.length > 0),
    ),
  );
}

function parseStudyYear(value: string): number | null {
  const match = value.match(/\d+/);
  if (!match) return null;
  const year = Number.parseInt(match[0], 10);
  return Number.isFinite(year) && year > 0 ? year : null;
}

function isEmail(value: string): boolean {
  return /^\S+@\S+\.\S+$/.test(value);
}

export function parseRegistryRows(rows: TabularRow[]): RegistryParseResult {
  if (rows.length === 0) {
    return {
      headers: [],
      columnMap: {},
      missingRequiredColumns: [...REQUIRED_COLUMNS],
      students: [],
    };
  }

  const headers = rows[0].map(normalizeHeader);
  const columnMap: Record<string, string> = {};
  for (const key of Object.keys(COLUMN_ALIASES)) {
    const found = COLUMN_ALIASES[key].find((alias) => headers.includes(alias));
    if (found) columnMap[key] = found;
  }

  const missingRequiredColumns = REQUIRED_COLUMNS.filter((key) => !columnMap[key]);
  const studentsByKey = new Map<string, RegistryStudentInput>();
  const admissionOwners = new Map<string, Set<string>>();
  const emailOwners = new Map<string, Set<string>>();

  rows.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2;
    const raw: Record<string, string> = {};
    headers.forEach((header, columnIndex) => {
      raw[header] = cells[columnIndex] ?? "";
    });

    const universityId = cellValue(raw, columnMap, "university_id");
    if (!universityId) return;

    const key = universityId.toLowerCase();
    const fullName = cellValue(raw, columnMap, "full_name");
    const admissionNumber = optional(cellValue(raw, columnMap, "admission_number"));
    const programme = optional(cellValue(raw, columnMap, "programme"));
    const department = optional(cellValue(raw, columnMap, "department"));
    const genderValue = cellValue(raw, columnMap, "gender");
    const gender = normalizeGender(genderValue);
    const emailValue = cellValue(raw, columnMap, "email").toLowerCase();
    const email = emailValue || null;
    const phone = optional(cellValue(raw, columnMap, "phone"));
    const academicYear = optional(cellValue(raw, columnMap, "academic_year"));
    const studyYear = parseStudyYear(cellValue(raw, columnMap, "study_year"));
    const semester = optional(cellValue(raw, columnMap, "semester"));
    const status = normalizeStatus(cellValue(raw, columnMap, "status"));
    const modules = normalizeModuleCodes(cellValue(raw, columnMap, "module_code"));

    let student = studentsByKey.get(key);
    if (!student) {
      student = {
        university_id: universityId,
        admission_number: admissionNumber,
        full_name: fullName,
        email,
        gender,
        department_raw: department,
        programme,
        study_year: studyYear,
        semester,
        academic_year: academicYear,
        phone,
        status,
        modules: [],
        row_numbers: [],
        errors: [],
      };
      studentsByKey.set(key, student);
    } else {
      if (fullName && student.full_name && fullName.toLowerCase() !== student.full_name.toLowerCase()) {
        student.errors.push(`conflicting names for registration number ${universityId}`);
      }
      if (!student.full_name && fullName) student.full_name = fullName;
      if (!student.admission_number && admissionNumber) student.admission_number = admissionNumber;
      if (!student.programme && programme) student.programme = programme;
      if (!student.department_raw && department) student.department_raw = department;
      if (!student.email && email) student.email = email;
      if (!student.phone && phone) student.phone = phone;
      if (!student.academic_year && academicYear) student.academic_year = academicYear;
      if (!student.semester && semester) student.semester = semester;
      if (!student.study_year && studyYear) student.study_year = studyYear;
      if (!student.gender && gender) student.gender = gender;
    }

    student.row_numbers.push(rowNumber);
    for (const moduleCode of modules) {
      if (!student.modules.includes(moduleCode)) student.modules.push(moduleCode);
    }

    if (admissionNumber) {
      const admissionKey = admissionNumber.toLowerCase();
      const owners = admissionOwners.get(admissionKey) ?? new Set<string>();
      owners.add(universityId);
      admissionOwners.set(admissionKey, owners);
    }
    if (email) {
      const owners = emailOwners.get(email) ?? new Set<string>();
      owners.add(universityId);
      emailOwners.set(email, owners);
    }
  });

  const students = Array.from(studentsByKey.values());

  for (const student of students) {
    if (!student.full_name) student.errors.push("full name is required");
    if (!student.department_raw) student.errors.push("department is required");
    if (!student.programme) student.errors.push("course/programme is required");
    if (student.admission_number) {
      const owners = admissionOwners.get(student.admission_number.toLowerCase());
      if (owners && owners.size > 1) {
        student.errors.push(`admission number ${student.admission_number} is used by multiple students`);
      }
    }
    if (student.email && !isEmail(student.email)) {
      student.errors.push(`invalid email: ${student.email}`);
    }
    if (student.email) {
      const owners = emailOwners.get(student.email);
      if (owners && owners.size > 1) {
        student.errors.push(`email ${student.email} is used by multiple students`);
      }
    }
  }

  // Validate gender values that were present but not recognized.
  rows.slice(1).forEach((cells, index) => {
    const raw: Record<string, string> = {};
    headers.forEach((header, columnIndex) => {
      raw[header] = cells[columnIndex] ?? "";
    });
    const universityId = cellValue(raw, columnMap, "university_id");
    const genderValue = cellValue(raw, columnMap, "gender");
    if (!universityId || !genderValue) return;
    if (!normalizeGender(genderValue)) {
      const student = studentsByKey.get(universityId.toLowerCase());
      if (student) student.errors.push(`invalid gender: ${genderValue} (row ${index + 2})`);
    }
  });

  return { headers, columnMap, missingRequiredColumns, students };
}

export function parseRegistryCsv(text: string): RegistryParseResult {
  return parseRegistryRows(parseDelimited(text));
}

export async function parseRegistryFile(file: File): Promise<RegistryParseResult> {
  return parseRegistryRows(await readTabularFile(file));
}

export function buildRegistryTemplateCsv(): string {
  return [
    REGISTRY_TEMPLATE_HEADERS.join(","),
    "Jane Doe,2024-01-00001,ADM-00001,BSc Computer Science,Computer Science,CS101,F",
  ].join("\n");
}

export function buildCredentialsCsv(
  rows: Array<{ university_id: string; full_name: string; email: string; password: string }>,
): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return [
    ["university_id", "full_name", "email", "temporary_password"].join(","),
    ...rows.map((row) =>
      [row.university_id, row.full_name, row.email, row.password].map(escape).join(","),
    ),
  ].join("\n");
}
