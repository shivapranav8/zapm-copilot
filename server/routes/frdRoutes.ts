import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import * as fs from 'fs';
import { runFRDReview } from '../agents/frdReviewer';

export const frdRouter = Router();

const upload = multer({
    dest: '/tmp/frd-uploads/',
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
});

/**
 * Extract readable text from various file formats.
 */
function extractFileContent(filePath: string, originalName: string): string {
    const ext = originalName.split('.').pop()?.toLowerCase() || '';

    if (ext === 'xlsx' || ext === 'xls') {
        const workbook = XLSX.readFile(filePath);
        const lines: string[] = [];
        for (const sheetName of workbook.SheetNames) {
            lines.push(`\n=== Sheet: ${sheetName} ===\n`);
            const sheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(sheet);
            lines.push(csv);
        }
        return lines.join('\n');
    }

    if (ext === 'csv' || ext === 'md' || ext === 'txt') {
        return fs.readFileSync(filePath, 'utf-8');
    }

    throw new Error(`Unsupported file type: .${ext}. Please upload .xlsx, .xls, .csv, .md, or .txt`);
}

/**
 * POST /api/frd/review
 * Streams SSE progress events while running the FRD review,
 * so Vercel doesn't freeze CPU during the AI analysis.
 */
frdRouter.post('/review', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded. Include a file field named "file".' });
    }

    const { originalname, path: filePath } = req.file;
    console.log(`📄 [FRD] Received file: ${originalname} (${req.file.size} bytes)`);

    // Keep connection alive — Vercel won't freeze CPU while streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
        send({ status: 'processing', progress: 10, message: 'Extracting file content...' });

        const content = extractFileContent(filePath, originalname);
        console.log(`📄 [FRD] Extracted ${content.length} characters from ${originalname}`);

        send({ status: 'processing', progress: 30, message: `Content extracted (${content.length.toLocaleString()} chars). Starting AI review...` });
        send({ status: 'processing', progress: 50, message: 'Analyzing feature completeness, user flows, and edge cases...' });

        const auditData = await runFRDReview(content, originalname);

        send({ status: 'processing', progress: 95, message: 'Finalizing audit report...' });
        send({ status: 'done', progress: 100, message: 'Done!', result: auditData });
        console.log(`✅ [FRD] Review complete — ${auditData.issues.length} issues found`);
    } catch (error) {
        console.error('❌ [FRD] Review failed:', error);
        send({ status: 'error', message: error instanceof Error ? error.message : 'FRD review failed' });
    } finally {
        fs.unlink(filePath, () => {});
        res.end();
    }
});
