import { describe, it, expect } from "vitest";
import {
  buildCredentialsCsv,
  buildRegistryTemplateCsv,
  parseRegistryCsv,
} from "./registryCsv";

describe("parseRegistryCsv", () => {
  it("parses the template with Swahili headers", () => {
    const result = parseRegistryCsv(buildRegistryTemplateCsv());
    expect(result.missingRequiredColumns).toEqual([]);
    expect(result.students).toHaveLength(1);
    expect(result.students[0]).toMatchObject({
      university_id: "2024-01-00001",
      admission_number: "ADM-00001",
      full_name: "Jane Doe",
      programme: "BSc Computer Science",
      department_raw: "Computer Science",
      gender: "F",
      modules: ["CS101"],
    });
  });

  it("groups multiple rows by registration number and collects modules", () => {
    const csv = [
      "jina,reg_number,admission_number,course,department,module_code,gender",
      "Jane Doe,2024-01-00001,ADM-00001,BSc CS,Computer Science,CS101,F",
      "Jane Doe,2024-01-00001,ADM-00001,BSc CS,Computer Science,CS102,F",
    ].join("\n");

    const result = parseRegistryCsv(csv);
    expect(result.students).toHaveLength(1);
    expect(result.students[0].modules).toEqual(["CS101", "CS102"]);
    expect(result.students[0].row_numbers).toEqual([2, 3]);
  });

  it("handles quoted module lists containing commas", () => {
    const csv = [
      "full_name,university_id,programme,department,module_code,gender",
      'Jane Doe,2024-01-00001,BSc CS,Computer Science,"CS101, CS102; CS103",F',
    ].join("\n");

    const result = parseRegistryCsv(csv);
    expect(result.students[0].modules).toEqual(["CS101", "CS102", "CS103"]);
  });

  it("detects missing required columns", () => {
    const result = parseRegistryCsv("jina,reg_number\nJane Doe,2024-01-00001");
    expect(result.missingRequiredColumns).toEqual(["department", "programme"]);
  });

  it("reports duplicate admission numbers across students", () => {
    const csv = [
      "jina,reg_number,admission_number,course,department,module_code,gender",
      "Jane Doe,2024-01-00001,ADM-1,BSc CS,Computer Science,CS101,F",
      "John Doe,2024-01-00002,ADM-1,BSc CS,Computer Science,CS101,M",
    ].join("\n");

    const result = parseRegistryCsv(csv);
    expect(result.students).toHaveLength(2);
    expect(result.students[0].errors.join(" ")).toContain("admission number ADM-1");
    expect(result.students[1].errors.join(" ")).toContain("admission number ADM-1");
  });

  it("reports conflicting names for the same registration number", () => {
    const csv = [
      "jina,reg_number,admission_number,course,department,module_code,gender",
      "Jane Doe,2024-01-00001,ADM-1,BSc CS,Computer Science,CS101,F",
      "John Doe,2024-01-00001,ADM-1,BSc CS,Computer Science,CS102,F",
    ].join("\n");

    const result = parseRegistryCsv(csv);
    expect(result.students).toHaveLength(1);
    expect(result.students[0].errors.join(" ")).toContain("conflicting names");
  });

  it("normalizes gender, status and study year", () => {
    const csv = [
      "full_name,university_id,programme,department,module_code,gender,status,study_year",
      "Jane Doe,2024-01-00001,BSc CS,Computer Science,CS101,Female,graduated,Year 2",
    ].join("\n");

    const result = parseRegistryCsv(csv);
    expect(result.students[0].gender).toBe("F");
    expect(result.students[0].status).toBe("graduated");
    expect(result.students[0].study_year).toBe(2);
  });

  it("supports semicolon-delimited files", () => {
    const csv = [
      "jina;reg_number;admission_number;course;department;module_code;gender",
      "Jane Doe;2024-01-00001;ADM-1;BSc CS;Computer Science;CS101;F",
    ].join("\n");

    const result = parseRegistryCsv(csv);
    expect(result.students).toHaveLength(1);
    expect(result.students[0].modules).toEqual(["CS101"]);
  });

  it("flags invalid gender and invalid email", () => {
    const csv = [
      "full_name,university_id,programme,department,module_code,gender,email",
      "Jane Doe,2024-01-00001,BSc CS,Computer Science,CS101,X,not-an-email",
    ].join("\n");

    const result = parseRegistryCsv(csv);
    const errors = result.students[0].errors.join(" ");
    expect(errors).toContain("invalid gender");
    expect(errors).toContain("invalid email");
  });
});

describe("buildCredentialsCsv", () => {
  it("escapes names and passwords", () => {
    const csv = buildCredentialsCsv([
      {
        university_id: "2024-01-00001",
        full_name: 'Jane "JJ" Doe',
        email: "jane@example.ac.tz",
        password: "A,b;c",
      },
    ]);
    expect(csv).toContain('"Jane ""JJ"" Doe"');
    expect(csv).toContain('"A,b;c"');
  });
});
