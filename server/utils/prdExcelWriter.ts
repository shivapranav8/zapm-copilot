import ExcelJS from 'exceljs';
import { PRDSheetData } from '../agents/prdGeneratorAgent';

// ── Color palette (write-prd spec) ─────────────────────────────────────────
const C = {
    TITLE:   'FFFCF3CF',   // light yellow
    COL_HDR: 'FFD6EAF8',   // light blue
    SEC:     'FFEBDEF0',   // light purple
    SEC_TXT: 'FFD41349',   // crimson red
    DARK_BL: 'FF002060',   // dark blue (Limitations S.No)
    WHITE:   'FFFFFFFF',
    BLACK:   'FF000000',
};

const THIN = { style: 'thin' as const, color: { argb: C.BLACK } };
const BORDER: ExcelJS.Borders = { top: THIN, left: THIN, bottom: THIN, right: THIN };
const VERDANA = 'Verdana';

function sc(
    ws: ExcelJS.Worksheet,
    row: number,
    col: number,
    value: string | number = '',
    opts: {
        bold?: boolean;
        fill?: string;
        fgColor?: string;
        halign?: ExcelJS.Alignment['horizontal'];
        valign?: ExcelJS.Alignment['vertical'];
        wrap?: boolean;
        size?: number;
    } = {}
): ExcelJS.Cell {
    const cell = ws.getCell(row, col);
    cell.value = value;
    cell.font = {
        name: VERDANA,
        size: opts.size ?? 10,
        bold: opts.bold ?? false,
        color: { argb: opts.fgColor ?? C.BLACK },
    };
    if (opts.fill) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.fill } };
    }
    cell.alignment = {
        horizontal: opts.halign ?? 'left',
        vertical: opts.valign ?? 'top',
        wrapText: opts.wrap ?? true,
    };
    cell.border = BORDER;
    return cell;
}

function mergeCols(ws: ExcelJS.Worksheet, row: number, startCol: number, endCol: number) {
    ws.mergeCells(row, startCol, row, endCol);
    // Re-apply border to merged region cells (ExcelJS requirement)
    for (let c = startCol; c <= endCol; c++) {
        ws.getCell(row, c).border = BORDER;
    }
}

function sectionRow(ws: ExcelJS.Worksheet, row: number, text: string, colSpan = 8) {
    ws.mergeCells(row, 1, row, colSpan);
    const cell = ws.getCell(row, 1);
    cell.value = text;
    cell.font = { name: VERDANA, size: 10, bold: true, color: { argb: C.SEC_TXT } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.SEC } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
    cell.border = BORDER;
    for (let c = 2; c <= colSpan; c++) {
        ws.getCell(row, c).border = BORDER;
    }
    ws.getRow(row).height = 20;
}

function colHeader(ws: ExcelJS.Worksheet, row: number, headers: string[]) {
    headers.forEach((h, i) => {
        sc(ws, row, i + 1, h, { bold: true, fill: C.COL_HDR, halign: 'center', valign: 'middle', wrap: false });
    });
    ws.getRow(row).height = 20;
}

// ── Sheet 1: Overview ───────────────────────────────────────────────────────
function buildOverview(wb: ExcelJS.Workbook, data: PRDSheetData) {
    const ws = wb.addWorksheet('Overview');
    ws.showGridLines = false;

    ws.getColumn(1).width = 46.37;
    ws.getColumn(2).width = 22.39;
    ws.getColumn(3).width = 18;
    ws.getColumn(4).width = 18;
    ws.getColumn(5).width = 22;

    // Row 1: Feature name title
    ws.mergeCells(1, 1, 1, 5);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = data.featureName || 'Feature Name';
    titleCell.font = { name: VERDANA, size: 10, bold: true, color: { argb: C.BLACK } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.TITLE } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };
    titleCell.border = BORDER;
    for (let c = 2; c <= 5; c++) ws.getCell(1, c).border = BORDER;
    ws.getRow(1).height = 29;

    // Row 2: Category / Details headers
    sc(ws, 2, 1, 'Category', { bold: true, fill: C.COL_HDR, halign: 'center', valign: 'middle' });
    ws.mergeCells(2, 2, 2, 5);
    sc(ws, 2, 2, 'Details', { bold: true, fill: C.COL_HDR, halign: 'center', valign: 'middle' });
    for (let c = 3; c <= 5; c++) ws.getCell(2, c).border = BORDER;
    ws.getRow(2).height = 20;

    const metaRows: [string, string][] = [
        ['Feature Name', data.featureName || ''],
        ['Module', data.module || ''],
        ['Sub Module', data.subModule || ''],
        ['PM Owner', data.overview.pmOwner || ''],
        ['Developers', data.overview.developers || ''],
        ['UI Owner', data.overview.uiOwner || ''],
        ['QA Members', data.overview.qaMembers || ''],
        ['Documentation Owner', data.overview.documentationOwner || ''],
        ['Marketing Creatives Owner', ''],
        ['Marketing Video Owner', ''],
        ['Feature Analysis Document', ''],
        ['Flow Diagram / Wireframe (Figma)', ''],
        ['Design Space Link', ''],
        ['HTML Conversion Link', ''],
        ['Security / Compliance Co-ordinator', ''],
        ['Sample Workspace', ''],
        ['Connect Post Link', ''],
        ['Cliq Group', ''],
        ['Customer Feature Request Tag', ''],
        ['Build Number', ''],
    ];

    metaRows.forEach(([label, value], i) => {
        const r = 3 + i;
        sc(ws, r, 1, label, { bold: false });
        ws.mergeCells(r, 2, r, 5);
        sc(ws, r, 2, value);
        for (let c = 3; c <= 5; c++) ws.getCell(r, c).border = BORDER;
        ws.getRow(r).height = 14;
    });

    const timelineRow = 3 + metaRows.length + 1;
    ['Timeline', 'Start Date', 'Planned EDC', 'Actual EDC', 'Notes'].forEach((h, i) => {
        sc(ws, timelineRow, i + 1, h, { bold: true, fill: C.TITLE, halign: 'center', valign: 'middle' });
    });
    ws.getRow(timelineRow).height = 14;

    ['PM', 'UI/UX', 'Development', 'QA & Release'].forEach((phase, i) => {
        const r = timelineRow + 1 + i;
        sc(ws, r, 1, phase);
        for (let c = 2; c <= 5; c++) sc(ws, r, c, '');
        ws.getRow(r).height = 14;
    });
}

// ── Sheet 2: Use Cases ──────────────────────────────────────────────────────
function buildUseCases(wb: ExcelJS.Workbook, data: PRDSheetData) {
    const ws = wb.addWorksheet('Use Cases');
    ws.showGridLines = false;

    const widths = [10.46, 53.39, 39.08, 101.09, 50.61, 36.03, 30.2, 39.88];
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    // Row 1: headers
    colHeader(ws, 1, ['S.No', 'Use Case', 'Sub Case', 'Description', 'PM Notes', 'Developer Notes', 'QA Notes', 'Dev Status']);

    let r = 2;

    // Track groups of consecutive UCs with the same category (prefix before ' — ')
    // so we can merge col 2 cells for them after writing
    const categoryGroups: { category: string; startRow: number; endRow: number }[] = [];
    let currentGroup: { category: string; startRow: number; endRow: number } | null = null;

    for (const uc of data.useCases) {
        if (uc.type === 'section') {
            currentGroup = null; // reset grouping on section break
            sectionRow(ws, r, uc.sectionName || '', 8);
            r++;
        } else {
            // Split "Category — Sub Use Case" on em dash or " - "
            const raw = uc.useCase || '';
            const sepIndex = raw.indexOf(' — ');
            const hasSep = sepIndex !== -1;
            const category = hasSep ? raw.slice(0, sepIndex).trim() : raw;
            const subCase  = hasSep ? raw.slice(sepIndex + 3).trim() : '';

            sc(ws, r, 1, uc.sno || '', { bold: true, halign: 'center', valign: 'middle' });
            sc(ws, r, 2, hasSep ? category : raw, { bold: true, halign: 'center', valign: 'middle' });
            sc(ws, r, 3, subCase, { bold: false, halign: 'left', valign: 'middle' });
            sc(ws, r, 4, uc.description || '', { halign: 'left', valign: 'top' });
            sc(ws, r, 5, uc.pmNotes || '', { halign: 'left', valign: 'top' });
            sc(ws, r, 6, '', { halign: 'left', valign: 'top' });
            sc(ws, r, 7, '', { halign: 'left', valign: 'top' });
            sc(ws, r, 8, '', { halign: 'left', valign: 'top' });

            // Dynamic row height based on actual newlines in description
            const desc = uc.description || '';
            const newlineCount = (desc.match(/\n/g) || []).length;
            const descLines = newlineCount > 0 ? newlineCount + 1 : Math.max(1, Math.ceil(desc.length / 80));
            ws.getRow(r).height = Math.max(18, descLines * 15 + 4);

            // Track category group for merging
            if (hasSep) {
                if (currentGroup && currentGroup.category === category) {
                    currentGroup.endRow = r;
                } else {
                    currentGroup = { category, startRow: r, endRow: r };
                    categoryGroups.push(currentGroup);
                }
            } else {
                currentGroup = null;
            }

            r++;
        }
    }

    // Merge col 2 cells for groups with more than one row
    for (const group of categoryGroups) {
        if (group.endRow > group.startRow) {
            ws.mergeCells(group.startRow, 2, group.endRow, 2);
            const merged = ws.getCell(group.startRow, 2);
            merged.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        }
    }
}

// ── Sheet 3: UI-UX ──────────────────────────────────────────────────────────
function buildUIUX(wb: ExcelJS.Workbook) {
    const ws = wb.addWorksheet('UI-UX');
    ws.showGridLines = false;

    ws.getColumn(1).width = 39.48;
    ws.getColumn(2).width = 126.66;
    ws.getColumn(3).width = 38.42;
    ws.getColumn(4).width = 41.6;

    sc(ws, 1, 1, 'UI Guidelines:', { bold: true });
    ws.mergeCells(1, 2, 1, 4);
    sc(ws, 1, 2, '');
    for (let c = 3; c <= 4; c++) ws.getCell(1, c).border = BORDER;
    ws.getRow(1).height = 30;

    colHeader(ws, 2, ['Type', 'Version / URL', 'URL', 'Summary Comments']);

    const rows = [
        'Flow Diagram / Wireframe',
        'Design Space',
        'HTML Conversion',
        'Sample Workspace Banner Design',
    ];
    rows.forEach((label, i) => {
        const r = 3 + i;
        sc(ws, r, 1, label);
        sc(ws, r, 2, '');
        sc(ws, r, 3, '');
        sc(ws, r, 4, '');
        ws.getRow(r).height = 18;
    });
}

// ── Sheet 4: Error Handling ─────────────────────────────────────────────────
function buildErrorHandling(wb: ExcelJS.Workbook, data: PRDSheetData) {
    const ws = wb.addWorksheet('Error Handling');
    ws.showGridLines = false;

    ws.getColumn(1).width = 14.3;
    ws.getColumn(2).width = 55.38;
    ws.getColumn(3).width = 117.52;

    colHeader(ws, 1, ['S.No', 'Error or Alert Case', 'Content']);

    data.errorHandling.forEach((err, i) => {
        const r = 2 + i;
        sc(ws, r, 1, String(i + 1), { bold: true, halign: 'center', valign: 'middle' });
        sc(ws, r, 2, err.errorCase, { valign: 'top' });
        sc(ws, r, 3, err.content, { valign: 'top' });
        const lines = Math.max(4, Math.ceil((err.content || '').length / 90));
        ws.getRow(r).height = Math.max(18, lines * 13.5 + 4);
    });

    if (data.errorHandling.length === 0) {
        sc(ws, 2, 1, ''); sc(ws, 2, 2, ''); sc(ws, 2, 3, '');
        ws.getRow(2).height = 18;
    }
}

// ── Sheet 5: Affected Areas ─────────────────────────────────────────────────
function buildAffectedAreas(wb: ExcelJS.Workbook, data: PRDSheetData) {
    const ws = wb.addWorksheet('Affected Areas');
    ws.showGridLines = false;

    ws.getColumn(1).width = 8.21;
    ws.getColumn(2).width = 18.01;
    ws.getColumn(3).width = 21.06;
    ws.getColumn(4).width = 41.6;
    ws.getColumn(5).width = 54.45;

    colHeader(ws, 1, ['S.No', 'Module', 'Sub Module', 'Areas Affected', 'Dependency to Check']);

    data.affectedAreas.forEach((area, i) => {
        const r = 2 + i;
        sc(ws, r, 1, String(i + 1), { bold: true, halign: 'center', valign: 'middle' });
        sc(ws, r, 2, area.module, { valign: 'top' });
        sc(ws, r, 3, area.subModule, { valign: 'top' });
        sc(ws, r, 4, area.areasAffected, { valign: 'top' });
        sc(ws, r, 5, area.dependency, { valign: 'top' });
        const h = Math.max(18, Math.ceil((area.areasAffected || '').length / 40) * 13.5 + 4);
        ws.getRow(r).height = h;
    });

    if (data.affectedAreas.length === 0) {
        for (let c = 1; c <= 5; c++) sc(ws, 2, c, '');
        ws.getRow(2).height = 18;
    }
}

// ── Sheet 6: Marketing ──────────────────────────────────────────────────────
function buildMarketing(wb: ExcelJS.Workbook) {
    const ws = wb.addWorksheet('Marketing');
    ws.showGridLines = false;

    ws.getColumn(1).width = 27.55;
    ws.getColumn(2).width = 10.86;
    ws.getColumn(3).width = 78.7;

    colHeader(ws, 1, ['Items', 'Owner', 'Checklist & Link']);

    const items = [
        'Help Document',
        'Webpage Update',
        "What's New Update",
        'Webinar (if planning to host)',
        'In-product tooltip / onboarding',
        'Release Notes',
        'Internal demo / enablement video',
        'Creatives Workdrive Link',
    ];

    items.forEach((item, i) => {
        const r = 2 + i;
        sc(ws, r, 1, item);
        sc(ws, r, 2, '');
        sc(ws, r, 3, '');
        ws.getRow(r).height = 18;
    });
}

// ── Sheet 7: Meeting Notes - Recordings ─────────────────────────────────────
function buildMeetingNotes(wb: ExcelJS.Workbook) {
    const ws = wb.addWorksheet('Meeting Notes - Recordings');
    ws.showGridLines = false;

    ws.getColumn(1).width = 17.48;
    ws.getColumn(2).width = 57.37;
    ws.getColumn(3).width = 48.75;

    colHeader(ws, 1, ['Date', 'Recordings Link', 'Notes']);

    for (let i = 0; i < 10; i++) {
        const r = 2 + i;
        sc(ws, r, 1, '');
        sc(ws, r, 2, '');
        sc(ws, r, 3, '');
        ws.getRow(r).height = 14;
    }
}

// ── Sheet 8: Limitation and Roadmap ─────────────────────────────────────────
function buildLimitations(wb: ExcelJS.Workbook, data: PRDSheetData) {
    const ws = wb.addWorksheet('Limitation and Roadmap');
    ws.showGridLines = false;

    ws.getColumn(1).width = 14.3;
    ws.getColumn(2).width = 57.23;
    ws.getColumn(3).width = 55.91;

    // S.No header with dark blue text
    sc(ws, 1, 1, 'S.No', { bold: true, fill: C.COL_HDR, halign: 'center', valign: 'middle', fgColor: C.DARK_BL });
    sc(ws, 1, 2, 'Limitations', { bold: true, fill: C.COL_HDR, halign: 'center', valign: 'middle' });
    sc(ws, 1, 3, 'Comments', { bold: true, fill: C.COL_HDR, halign: 'center', valign: 'middle' });
    ws.getRow(1).height = 20;

    data.limitations.forEach((lim, i) => {
        const r = 2 + i;
        sc(ws, r, 1, String(i + 1), { bold: true, halign: 'center', valign: 'middle' });
        sc(ws, r, 2, lim.limitation, { valign: 'top' });
        sc(ws, r, 3, lim.comments, { valign: 'top' });
        const h = Math.max(18, Math.ceil((lim.limitation || '').length / 55) * 13.5 + 4);
        ws.getRow(r).height = h;
    });

    if (data.limitations.length === 0) {
        sc(ws, 2, 1, ''); sc(ws, 2, 2, ''); sc(ws, 2, 3, '');
        ws.getRow(2).height = 18;
    }
}

// ── Main export ─────────────────────────────────────────────────────────────
export async function writePRDExcel(data: PRDSheetData): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'ZAPM Co-pilot';
    wb.created = new Date();

    buildOverview(wb, data);
    buildUseCases(wb, data);
    buildUIUX(wb);
    buildErrorHandling(wb, data);
    buildAffectedAreas(wb, data);
    buildMarketing(wb);
    buildMeetingNotes(wb);
    buildLimitations(wb, data);

    const buffer = await wb.xlsx.writeBuffer();
    return buffer as Buffer;
}
