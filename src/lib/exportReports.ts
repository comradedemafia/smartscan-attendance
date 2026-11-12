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
  dateRange?: { from?: string; to?: string };
  filters?: string[];
  labels?: { filters?: string; generated?: string; period?: string; sheet?: string };
  locale?: string;
}

export function exportToPDF({ title, columns, rows, subtitle, dateRange, filters, labels, locale }: ExportData) {
  const filtersLabel = labels?.filters ?? "Filters";
  const generatedLabel = labels?.generated ?? "Generated";
  const periodLabel = labels?.period ?? "Period";
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text(title, 14, 20);

  let y = 28;
  if (subtitle) {
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(subtitle, 14, y);
    doc.setTextColor(0);
    y += 6;
  }

  if (dateRange && (dateRange.from || dateRange.to)) {
    doc.setFontSize(10);
    doc.setTextColor(80);
    const range = `${periodLabel}: ${dateRange.from || "…"}  →  ${dateRange.to || "…"}`;
    doc.text(range, 14, y);
    y += 5;
    doc.setTextColor(0);
  }

  if (filters && filters.length) {
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(`${filtersLabel}: ${filters.join(" · ")}`, 14, y);
    y += 5;
    doc.setTextColor(0);
  }

  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(`${generatedLabel}: ${new Date().toLocaleString(locale)}`, 14, y);
  doc.setTextColor(0);
  y += 4;

  const startY = y + 2;

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

export function exportToExcel({ title, columns, rows, subtitle, dateRange, filters, labels, locale }: ExportData) {
  const filtersLabel = labels?.filters ?? "Filters";
  const generatedLabel = labels?.generated ?? "Generated";
  const periodLabel = labels?.period ?? "Period";
  const sheetLabel = labels?.sheet ?? "Report";
  const headerRows: any[][] = [[title]];
  if (subtitle) headerRows.push([subtitle]);
  if (dateRange && (dateRange.from || dateRange.to)) {
    headerRows.push([`${periodLabel}: ${dateRange.from || "…"} → ${dateRange.to || "…"}`]);
  }
  if (filters && filters.length) {
    headerRows.push([`${filtersLabel}: ${filters.join(" · ")}`]);
  }
  headerRows.push([`${generatedLabel}: ${new Date().toLocaleString(locale)}`]);
  headerRows.push([]);

  const wsData = [
    ...headerRows,
    columns.map((c) => c.header),
    ...rows.map((row) => columns.map((c) => row[c.key] ?? "—")),
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Set column widths
  ws["!cols"] = columns.map(() => ({ wch: 20 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetLabel);

  const dateStr = new Date().toISOString().split("T")[0];
  XLSX.writeFile(wb, `${title.replace(/\s+/g, "_")}_${dateStr}.xlsx`);
}
