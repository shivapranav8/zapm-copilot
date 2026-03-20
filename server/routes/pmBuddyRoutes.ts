import { Router } from 'express';
import {
    runCompetitorAnalysis,
    generateMRD,
    generateFRD,
    handleChat,
    CompetitorAnalysisData,
    MRDData,
    FRDData,
} from '../agents/pmBuddyAgent';
import { runPRDGenerator } from '../agents/prdGeneratorAgent';
import { writePRDExcel } from '../utils/prdExcelWriter';

export const pmBuddyRouter = Router();

/**
 * POST /api/pm-buddy/competitor-analysis
 * Body: { featureName, domain, problemStatement, targetUsers }
 */
pmBuddyRouter.post('/competitor-analysis', async (req, res) => {
    const { featureName, domain, problemStatement, targetUsers } = req.body;
    if (!featureName || !domain) {
        return res.status(400).json({ error: 'featureName and domain are required' });
    }

    console.log(`🔍 [PM Buddy Route] /competitor-analysis — "${featureName}" in "${domain}"`);

    try {
        const zohoToken = (req as any).session?.zoho?.accessToken;
        const data: CompetitorAnalysisData = await runCompetitorAnalysis(
            featureName,
            domain,
            problemStatement || '',
            targetUsers || '',
            zohoToken,
        );
        res.json(data);
    } catch (error) {
        console.error('❌ [PM Buddy] Competitor analysis failed:', error);
        res.status(500).json({
            error: 'Competitor analysis failed',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * POST /api/pm-buddy/generate-mrd
 * Body: { featureData: { featureName, domain, problemStatement, targetUsers }, competitorData }
 */
pmBuddyRouter.post('/generate-mrd', async (req, res) => {
    const { featureData, competitorData } = req.body;
    if (!featureData?.featureName) {
        return res.status(400).json({ error: 'featureData.featureName is required' });
    }

    console.log(`📄 [PM Buddy Route] /generate-mrd — "${featureData.featureName}"`);

    try {
        const zohoToken = (req as any).session?.zoho?.accessToken;
        const data: MRDData = await generateMRD(featureData, competitorData, zohoToken);
        res.json(data);
    } catch (error) {
        console.error('❌ [PM Buddy] MRD generation failed:', error);
        res.status(500).json({
            error: 'MRD generation failed',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * POST /api/pm-buddy/generate-frd
 * Body: { featureData: { featureName, domain, problemStatement, targetUsers }, mrdData }
 */
pmBuddyRouter.post('/generate-frd', async (req, res) => {
    const { featureData, mrdData } = req.body;
    if (!featureData?.featureName) {
        return res.status(400).json({ error: 'featureData.featureName is required' });
    }
    if (!mrdData) {
        return res.status(400).json({ error: 'mrdData is required' });
    }

    console.log(`📋 [PM Buddy Route] /generate-frd — "${featureData.featureName}"`);

    try {
        const zohoToken = (req as any).session?.zoho?.accessToken;
        const data: FRDData = await generateFRD(featureData, mrdData, zohoToken);
        res.json(data);
    } catch (error) {
        console.error('❌ [PM Buddy] FRD generation failed:', error);
        res.status(500).json({
            error: 'FRD generation failed',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * POST /api/pm-buddy/generate-prd
 * Takes featureData + mrdData, serialises MRD as text, runs through the PRD Generator agent,
 * and returns a downloadable .xlsx PRD file.
 * Body: { featureData, mrdData, competitorData? }
 */
pmBuddyRouter.post('/generate-prd', async (req, res) => {
    const { featureData, mrdData, competitorData } = req.body;
    if (!featureData?.featureName) {
        return res.status(400).json({ error: 'featureData.featureName is required' });
    }
    if (!mrdData) {
        return res.status(400).json({ error: 'mrdData is required' });
    }

    console.log(`📋 [PM Buddy Route] /generate-prd — "${featureData.featureName}"`);

    try {
        // Serialise MRD + feature context as a rich text document for the PRD agent
        const competitorSection = competitorData?.competitors?.length
            ? `\n## Competitor Landscape\n${competitorData.competitors.map((c: any) =>
                `### ${c.name}\n**Strengths:** ${c.strengths?.join(', ')}\n**Weaknesses:** ${c.weaknesses?.join(', ')}\n**Position:** ${c.marketPosition}`
              ).join('\n\n')}\n\n**Market Insights:**\n${competitorData.marketInsights?.map((i: string) => `- ${i}`).join('\n')}\n\n**Opportunities:**\n${competitorData.opportunities?.map((o: string) => `- ${o}`).join('\n')}`
            : '';

        const mrdText = `# Marketing Requirements Document (MRD)
## Feature: ${mrdData.featureName}
Domain: ${featureData.domain}
Problem Statement: ${featureData.problemStatement}
Target Users: ${featureData.targetUsers}

## Objectives
${mrdData.objectives?.map((o: string) => `- ${o}`).join('\n')}

## Personas
${mrdData.personas?.map((p: any) =>
    `### ${p.name}\n${p.description}\nNeeds: ${p.needs?.join(', ')}`
).join('\n\n')}

## Use Cases
${mrdData.useCases?.map((u: any) => `- **${u.title}**: ${u.description}`).join('\n')}

## Success Metrics
${mrdData.successMetrics?.map((m: string) => `- ${m}`).join('\n')}

## Constraints
${mrdData.constraints?.map((c: string) => `- ${c}`).join('\n')}

## Zoho Analytics Implementation
**Data Sources:** ${mrdData.zohoImplementation?.dataSources?.join(', ')}

**Permissions:**
${mrdData.zohoImplementation?.permissions?.map((p: string) => `- ${p}`).join('\n')}

**KPIs to track:**
${mrdData.zohoImplementation?.kpis?.map((k: string) => `- ${k}`).join('\n')}

**Schema:**
${mrdData.zohoImplementation?.schema?.map((s: any) =>
    `Table: ${s.table} | Fields: ${s.fields?.join(', ')}`
).join('\n')}

**Architecture:**
${mrdData.zohoImplementation?.architecture}
${competitorSection}`;

        // Run through the PRD Generator agent (same agent used by the PRD Generator tool)
        const zohoToken = (req as any).session?.zoho?.accessToken;
        const prdData = await runPRDGenerator(mrdText, `${featureData.featureName}_MRD.md`, 'docx', zohoToken);

        // Write Excel
        const excelBuffer = await writePRDExcel(prdData);

        const safeFeatureName = (prdData.featureName || featureData.featureName)
            .replace(/[^a-zA-Z0-9_\- ]/g, '')
            .replace(/\s+/g, '_')
            .slice(0, 60);
        const filename = `PRD_${safeFeatureName}.xlsx`;

        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Length': String(excelBuffer.length),
        });
        res.send(excelBuffer);

        console.log(`✅ [PM Buddy] Sent ${filename} (${excelBuffer.length} bytes)`);
    } catch (error) {
        console.error('❌ [PM Buddy] PRD generation failed:', error);
        res.status(500).json({
            error: 'PRD generation failed',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * POST /api/pm-buddy/chat
 * Body: { message, stage, featureData?, mrdData?, frdData? }
 */
pmBuddyRouter.post('/chat', async (req, res) => {
    const { message, stage, featureData, mrdData, frdData } = req.body;
    if (!message) {
        return res.status(400).json({ error: 'message is required' });
    }

    console.log(`💬 [PM Buddy Route] /chat — stage="${stage}" message="${message.slice(0, 60)}"`);

    try {
        const zohoToken = (req as any).session?.zoho?.accessToken;
        const reply = await handleChat(message, { stage: stage || 'input', featureData, mrdData, frdData }, zohoToken);
        res.json({ reply });
    } catch (error) {
        console.error('❌ [PM Buddy] Chat failed:', error);
        res.status(500).json({
            error: 'Chat failed',
            details: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});
