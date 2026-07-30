import type { WorkoutBundle } from "@xiaobai-amax/domain";

type ExerciseNames = ReadonlyMap<string, { displayName: string }>;

type ExportCell = string | number;
type ExportRow = ExportCell[];

const HEADERS = ["日期", "动作", "组数", "重量 (kg)", "次数", "单组训练量 (kg)", "组备注", "训练备注"];

function safeCell(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function formatNumber(value: number | undefined): number | "" {
  return typeof value === "number" && Number.isFinite(value) ? value : "";
}

function exerciseRows(bundle: WorkoutBundle, exerciseNames: ExerciseNames): ExportRow[] {
  const workoutNote = safeCell(bundle.workout.notes ?? "");

  return bundle.exercises.flatMap(({ workoutExercise, sets }) => {
    const exerciseName = safeCell(exerciseNames.get(workoutExercise.exerciseId)?.displayName ?? workoutExercise.exerciseId);
    const sortedSets = [...sets].sort((a, b) => a.setNumber - b.setNumber);

    if (!sortedSets.length) {
      return [[bundle.workout.date, exerciseName, "", "", "", "", "", workoutNote]];
    }

    return sortedSets.map((set) => {
      const weight = formatNumber(set.weightKg);
      const reps = formatNumber(set.reps);
      const volume = typeof weight === "number" && typeof reps === "number" ? weight * reps : "";

      return [
        bundle.workout.date,
        exerciseName,
        set.setNumber,
        weight,
        reps,
        volume,
        safeCell(set.notes ?? ""),
        workoutNote,
      ];
    });
  });
}

export function createWorkoutExportRows(bundles: WorkoutBundle[], exerciseNames: ExerciseNames): ExportRow[] {
  return bundles
    .slice()
    .sort((left, right) => left.workout.date.localeCompare(right.workout.date))
    .flatMap((bundle) => exerciseRows(bundle, exerciseNames));
}

function escapeCsvCell(value: ExportCell): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function createWorkoutCsv(bundles: WorkoutBundle[], exerciseNames: ExerciseNames): string {
  const rows = [HEADERS, ...createWorkoutExportRows(bundles, exerciseNames)];
  return `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n")}`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(index: number): string {
  let number = index + 1;
  let name = "";
  while (number > 0) {
    const remainder = (number - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    number = Math.floor((number - 1) / 26);
  }
  return name;
}

function worksheetXml(rows: ExportRow[]): string {
  const allRows = [HEADERS, ...rows];
  const rowXml = allRows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
      return typeof value === "number"
        ? `<c r="${reference}"><v>${value}</v></c>`
        : `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="13" customWidth="1"/><col min="2" max="2" width="24" customWidth="1"/><col min="3" max="6" width="16" customWidth="1"/><col min="7" max="8" width="28" customWidth="1"/></cols><sheetData>${rowXml}</sheetData><autoFilter ref="A1:H${Math.max(allRows.length, 1)}"/></worksheet>`;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

type ZipEntry = { name: string; data: Uint8Array; crc: number; offset: number };

function createZip(files: Array<{ name: string; content: string }>): Uint8Array {
  const encoder = new TextEncoder();
  const entries: ZipEntry[] = files.map((file) => ({
    name: file.name,
    data: encoder.encode(file.content),
    crc: 0,
    offset: 0,
  }));
  entries.forEach((entry) => { entry.crc = crc32(entry.data); });

  const localSize = entries.reduce((size, entry) => size + 30 + encoder.encode(entry.name).length + entry.data.length, 0);
  const centralSize = entries.reduce((size, entry) => size + 46 + encoder.encode(entry.name).length, 0);
  const zip = new Uint8Array(localSize + centralSize + 22);
  let offset = 0;

  entries.forEach((entry) => {
    const name = encoder.encode(entry.name);
    entry.offset = offset;
    writeUint32(zip, offset, 0x04034b50);
    writeUint16(zip, offset + 4, 20);
    writeUint16(zip, offset + 6, 0x0800);
    writeUint16(zip, offset + 8, 0);
    writeUint32(zip, offset + 14, entry.crc);
    writeUint32(zip, offset + 18, entry.data.length);
    writeUint32(zip, offset + 22, entry.data.length);
    writeUint16(zip, offset + 26, name.length);
    name.forEach((value, index) => { zip[offset + 30 + index] = value; });
    zip.set(entry.data, offset + 30 + name.length);
    offset += 30 + name.length + entry.data.length;
  });

  const centralOffset = offset;
  entries.forEach((entry) => {
    const name = encoder.encode(entry.name);
    writeUint32(zip, offset, 0x02014b50);
    writeUint16(zip, offset + 4, 20);
    writeUint16(zip, offset + 6, 20);
    writeUint16(zip, offset + 8, 0x0800);
    writeUint16(zip, offset + 10, 0);
    writeUint32(zip, offset + 16, entry.crc);
    writeUint32(zip, offset + 20, entry.data.length);
    writeUint32(zip, offset + 24, entry.data.length);
    writeUint16(zip, offset + 28, name.length);
    writeUint32(zip, offset + 42, entry.offset);
    name.forEach((value, index) => { zip[offset + 46 + index] = value; });
    offset += 46 + name.length;
  });

  writeUint32(zip, offset, 0x06054b50);
  writeUint16(zip, offset + 8, entries.length);
  writeUint16(zip, offset + 10, entries.length);
  writeUint32(zip, offset + 12, centralSize);
  writeUint32(zip, offset + 16, centralOffset);
  return zip;
}

export function createWorkoutXlsx(bundles: WorkoutBundle[], exerciseNames: ExerciseNames): Uint8Array {
  const rows = createWorkoutExportRows(bundles, exerciseNames);
  return createZip([
    { name: "[Content_Types].xml", content: "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/xl/workbook.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml\"/><Override PartName=\"/xl/worksheets/sheet1.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml\"/></Types>" },
    { name: "_rels/.rels", content: "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"xl/workbook.xml\"/></Relationships>" },
    { name: "xl/workbook.xml", content: "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><workbook xmlns=\"http://schemas.openxmlformats.org/spreadsheetml/2006/main\" xmlns:r=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships\"><sheets><sheet name=\"训练明细\" sheetId=\"1\" r:id=\"rId1\"/></sheets></workbook>" },
    { name: "xl/_rels/workbook.xml.rels", content: "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet\" Target=\"worksheets/sheet1.xml\"/></Relationships>" },
    { name: "xl/worksheets/sheet1.xml", content: worksheetXml(rows) },
  ]);
}

export function downloadFile(contents: string | Uint8Array, filename: string, type: string): void {
  const blobContents = typeof contents === "string" ? contents : new Uint8Array(contents);
  const url = URL.createObjectURL(new Blob([blobContents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
