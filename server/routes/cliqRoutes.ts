import { Router } from 'express';

export const cliqRouter = Router();

interface AuditSummary {
    fileName: string;
    analyzedDate: string;
    totalSheets: number;
    totalUseCases: number;
    score: number;
    issues: { severity: string; category: string; issue: string }[];
    summary: { critical: number; warnings: number; info: number };
}

/**
 * POST /api/cliq/send-audit
 * Sends an FRD audit summary to a Zoho Cliq channel via incoming webhook.
 * Requires CLIQ_WEBHOOK_URL environment variable to be set.
 */
cliqRouter.post('/send-audit', async (req, res) => {
    const webhookUrl = process.env.CLIQ_WEBHOOK_URL;

    if (!webhookUrl) {
        return res.status(503).json({
            error: 'CLIQ_WEBHOOK_URL is not configured. Add it to your environment variables.',
        });
    }

    const { auditData, message }: { auditData: AuditSummary; message?: string } = req.body;

    if (!auditData) {
        return res.status(400).json({ error: 'auditData is required' });
    }

    const criticalIssues = auditData.issues.filter(i => i.severity === 'critical').slice(0, 3);

    const lines: string[] = [
        `🔍 *FRD Audit Report: ${auditData.fileName}*`,
        ``,
        `📊 Quality Score: *${auditData.score}%*`,
        `📋 Issues Found: ${auditData.issues.length} (${auditData.summary.critical} critical, ${auditData.summary.warnings} warnings, ${auditData.summary.info} info)`,
        `📁 Sheets: ${auditData.totalSheets} | Use Cases: ${auditData.totalUseCases}`,
        ``,
    ];

    if (criticalIssues.length > 0) {
        lines.push(`🔴 *Critical Issues:*`);
        criticalIssues.forEach(i => lines.push(`• [${i.category}] ${i.issue}`));
    } else {
        lines.push(`✅ No critical issues found`);
    }

    if (message?.trim()) {
        lines.push(``, `💬 ${message.trim()}`);
    }

    lines.push(``, `_Analyzed on ${auditData.analyzedDate} via ZAPM Copilot_`);

    try {
        const cliqRes = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: lines.join('\n') }),
        });

        if (!cliqRes.ok) {
            const body = await cliqRes.text().catch(() => '');
            throw new Error(`Cliq webhook returned ${cliqRes.status}: ${body.slice(0, 200)}`);
        }

        console.log(`✅ [Cliq] Sent audit report for ${auditData.fileName}`);
        res.json({ success: true });
    } catch (err) {
        console.error('❌ [Cliq] Send failed:', err);
        res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to send to Cliq' });
    }
});
