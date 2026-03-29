import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

interface ExportColumn {
  header: string;
  key: string;
}

interface ExportData {
  title: string;
  columns: ExportColumn[];
  rows: Record<string, any>[];
  subtitle?: string;
}

export function exportToPDF({ title, columns, rows, subtitle }: ExportData) {
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text(title, 14, 20);

  if (subtitle) {
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(subtitle, 14, 28);
    doc.setTextColor(0);
  }

  const startY = subtitle ? 34 : 28;

  autoTable(doc, {
    startY,
    head: [columns.map((c) => c.header)],
    body: rows.map((row) => columns.map((c) => String(row[c.key] ?? "—"))),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [34, 197, 94], textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    margin: { left: 14, right: 14 },
  });

  const dateStr = new Date().toISOString().split("T")[0];
  doc.save(`${title.replace(/\s+/g, "_")}_${dateStr}.pdf`);
}

export function exportToExcel({ title, columns, rows, subtitle }: ExportData) {
  const wsData = [
    [title],
    subtitle ? [subtitle] : [],
    [],
    columns.map((c) => c.header),
    ...rows.map((row) => columns.map((c) => row[c.key] ?? "—")),
  ].filter((r) => r.length > 0);

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws["!cols"] = columns.map(() => ({ wch: 20 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");

  const dateStr = new Date().toISOString().split("T")[0];
  XLSX.writeFile(wb, `${title.replace(/\s+/g, "_")}_${dateStr}.xlsx`);
}
