export interface ExcelColumn<T> {
  header: string;
  width?: number;
  value: (row: T) => string | number | Date | null | undefined;
}

/**
 * Client-only helper — dynamically imports exceljs (large dependency, kept
 * out of the main bundle) and triggers a browser download. Shared by every
 * page's "Export Excel" button so the workbook/blob/anchor boilerplate
 * lives in one place; each caller only supplies its own column definitions.
 */
export async function downloadExcel<T>(filename: string, sheetName: string, columns: ExcelColumn<T>[], rows: T[]): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((c) => ({ header: c.header, width: c.width ?? 20 }));
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow(columns.map((c) => c.value(row) ?? ''));
  }
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
