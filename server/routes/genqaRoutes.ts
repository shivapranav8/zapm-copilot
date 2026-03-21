/**
 * Gen-QA API Routes
 * Implements Prompt Management CRUD locally using genqaDb
 * Implements AI testing via ZAPM's callPlatformAI
 */

import { Router, Request, Response } from 'express';
import { genqaDb } from '../utils/genqaDb';
import { callPlatformAI } from '../utils/platformAI';

const genqaRouter = Router();

// ── Helpers ────────────────────────────────────────────────────────────
const success = (res: Response, data: any = null) => res.json({ success: true, data });
const error = (res: Response, message: string, status = 400) => res.status(status).json({ success: false, error: message });

// ── Prompt Routes ──────────────────────────────────────────────────────

genqaRouter.get('/prompts', (req: Request, res: Response) => {
    success(res, genqaDb.getAllPrompts());
});

genqaRouter.get('/prompts/:teamname/:task', (req: Request, res: Response) => {
    const teamname = String(req.params.teamname);
    const task = String(req.params.task);
    const prompt = genqaDb.getPrompt(teamname, task);
    if (!prompt) return error(res, 'Prompt not found', 404);
    success(res, prompt);
});

genqaRouter.delete('/prompts/:teamname/:task', (req: Request, res: Response) => {
    const teamname = String(req.params.teamname);
    const task = String(req.params.task);
    const deleted = genqaDb.deletePrompt(teamname, task);
    if (!deleted) return error(res, 'Prompt not found', 404);
    success(res, { deleted: true });
});

// ── Prompt Version Routes ──────────────────────────────────────────────

genqaRouter.get('/prompt-versions/:teamname/:task', (req: Request, res: Response) => {
    const teamname = String(req.params.teamname);
    const task = String(req.params.task);
    success(res, genqaDb.getPromptVersionsByTask(teamname, task));
});

genqaRouter.get('/prompt-versions/:teamname/:task/live', (req: Request, res: Response) => {
    const teamname = String(req.params.teamname);
    const task = String(req.params.task);
    const live = genqaDb.getLivePromptVersion(teamname, task);
    if (!live) return error(res, 'No live version found', 404);
    success(res, live);
});

genqaRouter.post('/prompt-versions', (req: Request, res: Response) => {
    const { teamname, task, live, prompt, system_prompt, user_prompt } = req.body;
    
    if (!teamname || !task) {
        return error(res, 'teamname and task are required');
    }

    // Determine the next prompt version number
    const existingVersions = genqaDb.getPromptVersionsByTask(teamname, task);
    const nextVersionNum = existingVersions.length > 0 
        ? Math.max(...existingVersions.map(v => v.prompt_version)) + 1 
        : 1;

    // Combine system and user prompts if needed
    let fullPrompt = prompt;
    if (!fullPrompt) {
        if (system_prompt && user_prompt) {
            fullPrompt = `${system_prompt}---SYSTEM_USER_SEPARATOR---${user_prompt}`;
        } else if (user_prompt) {
            fullPrompt = user_prompt;
        } else {
            return error(res, 'Either prompt or user_prompt is required');
        }
    }

    // Ensure main prompt exists
    genqaDb.upsertPrompt(teamname, task);

    const newVersion = genqaDb.insertPromptVersion({
        teamname,
        task,
        prompt_version: nextVersionNum,
        prompt: fullPrompt,
        live: !!live
    });

    success(res, newVersion);
});

genqaRouter.put('/prompt-versions/:serial/set-live', (req: Request, res: Response) => {
    const serial = parseInt(String(req.params.serial), 10);
    const updated = genqaDb.setPromptVersionLive(serial);
    if (!updated) return error(res, 'Version not found', 404);
    success(res, { updated: true });
});

genqaRouter.delete('/prompt-versions/:serial', (req: Request, res: Response) => {
    const serial = parseInt(String(req.params.serial), 10);
    const deleted = genqaDb.deletePromptVersion(serial);
    if (!deleted) return error(res, 'Version not found', 404);
    success(res, { deleted: true });
});

// ── Testset Routes ─────────────────────────────────────────────────────

genqaRouter.get('/testsets', (req: Request, res: Response) => {
    const { teamname, task, prompt_version } = req.query;
    if (!teamname || !task || !prompt_version) {
        return error(res, 'teamname, task, and prompt_version are required');
    }
    const testsets = genqaDb.getTestSetsByTask(String(teamname), String(task), Number(prompt_version));
    success(res, testsets);
});

genqaRouter.post('/testsets', (req: Request, res: Response) => {
    const { teamname, task, prompt_version, testset } = req.body;
    if (!teamname || !task || !prompt_version || !Array.isArray(testset)) {
        return error(res, 'Invalid payload for testset');
    }

    const t = genqaDb.insertTestSet(teamname, task, Number(prompt_version), testset);
    success(res, t);
});

// ── Generate System Prompt Route ──────────────────────────────────────

genqaRouter.post('/generate-system-prompt', async (req: Request, res: Response) => {
    try {
        const { teamname, task, userPrompt, sampleInputs, vendor, model } = req.body;
        if (!task) return error(res, 'task is required');

        const zohoToken = (req as any).session?.zoho?.accessToken;
        if (!zohoToken) return error(res, 'Not authenticated', 401);

        const samplesText = Array.isArray(sampleInputs) && sampleInputs.length > 0
            ? `\n\nSample user inputs this prompt will handle:\n${sampleInputs.slice(0, 5).map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}`
            : '';

        const userPromptCtx = userPrompt?.trim()
            ? `\n\nThe user message template is:\n${userPrompt}`
            : '';

        const prompt = `You are an expert prompt engineer. Generate a production-ready system prompt for an AI assistant.

Task: ${task}
Team/Domain: ${teamname || 'General'}${userPromptCtx}${samplesText}

Write the system prompt in the style and format that works best for your own architecture. Use whatever structure, tags, or conventions produce the strongest results for you specifically. The prompt should:
- Define the AI's role, expertise, and persona clearly
- Set tone, constraints, and output format rules
- Be ready to use immediately with no edits needed

Return ONLY the system prompt text. No explanation, no preamble, no markdown wrapping.`;

        const ai_vendor = vendor || 'anthropic';
        const ai_model = model || 'claude-sonnet-4-6';

        const responseText = await callPlatformAI(prompt, {
            zohoToken,
            req,
            model: ai_model,
            ai_vendor,
            maxTokens: 800,
        });

        // Strip any accidental markdown code fences
        const cleanedPrompt = responseText.replace(/^```[\w]*\n?/gm, '').replace(/```$/gm, '').trim();
        success(res, { systemPrompt: cleanedPrompt });
    } catch (err: any) {
        console.error('❌ [Gen-QA Generate-System-Prompt]:', err);
        error(res, err.message || 'Failed to generate system prompt', 500);
    }
});

// ── Generate Questions Route ───────────────────────────────────────────

genqaRouter.post('/generate-questions', async (req: Request, res: Response) => {
    try {
        const { context, count = 5 } = req.body;
        if (!context) return error(res, 'context is required');

        const zohoToken = (req as any).session?.zoho?.accessToken;
        if (!zohoToken) return error(res, 'Not authenticated', 401);

        const prompt = `You are generating realistic test inputs for an AI prompt evaluation system.

The user wants you to generate ${count} diverse examples based on this description:
"${context}"

Generate exactly ${count} actual user inputs — not questions ABOUT the topic, but the real thing itself. If the description says "complex SQL queries", generate actual SQL queries. If it says "customer support emails", generate actual email text. If it says "user questions about Python", generate actual Python questions a user would ask.

Each input should be a realistic, standalone example that could be directly used as a test case. Vary complexity, length, and style across the ${count} examples.

Return ONLY a valid JSON array of strings. No explanation, no markdown.
Example: ["SELECT * FROM...", "WITH cte AS...", "SELECT a.name..."]`;

        const responseText = await callPlatformAI(prompt, { zohoToken, req, maxTokens: 1500 });

        // Strip markdown code fences if present, then extract JSON array
        const stripped = responseText.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
        const jsonMatch = stripped.match(/\[[\s\S]*\]/);

        let questions: string[] = [];
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                if (Array.isArray(parsed)) questions = parsed.map(String).filter(Boolean);
            } catch { /* fall through to line-split */ }
        }

        // Fallback: if JSON parse failed, split by newlines and clean up
        if (questions.length === 0) {
            questions = stripped
                .split('\n')
                .map(l => l.replace(/^[\d\-\.\*\["]+\s*/, '').replace(/["\],]+$/, '').trim())
                .filter(l => l.length > 5);
        }

        if (questions.length === 0) return error(res, 'AI did not return any usable inputs — try rephrasing your context');

        success(res, { questions });
    } catch (err: any) {
        console.error('❌ [Gen-QA Generate-Questions]:', err);
        error(res, err.message || 'Failed to generate questions', 500);
    }
});

// ── Score Route ────────────────────────────────────────────────────────

genqaRouter.post('/score', async (req: Request, res: Response) => {
    try {
        const { question, response: responseText, criteria, harshness = 5 } = req.body;
        if (!question || !responseText || !Array.isArray(criteria) || criteria.length === 0) {
            return error(res, 'question, response, and criteria array are required');
        }

        const harshnessLevel = Math.max(1, Math.min(10, Number(harshness)));
        const harshnessInstruction =
            harshnessLevel <= 2 ? 'Be generous and lenient. Give benefit of the doubt. Reward reasonable attempts even if imperfect. Lean toward higher scores.' :
            harshnessLevel <= 4 ? 'Be somewhat lenient. Overlook minor issues. Award full marks if the intent is correct.' :
            harshnessLevel <= 6 ? 'Be balanced and objective. Score based on actual quality without bias either way.' :
            harshnessLevel <= 8 ? 'Be strict and demanding. Only award high scores for clearly excellent responses. Penalise vagueness, inaccuracy, or poor structure.' :
            'Be extremely harsh and unforgiving. Scrutinise every word. Deduct points for any imprecision, redundancy, missed edge case, or suboptimal phrasing. High scores should be rare.';

        const zohoToken = (req as any).session?.zoho?.accessToken;
        if (!zohoToken) return error(res, 'Not authenticated', 401);

        const criteriaText = criteria
            .map((c: any) => `- ${c.name} (0–${c.maxScore}): ${c.description}`)
            .join('\n');

        const criteriaKeys = criteria.map((c: any) => c.name);

        const prompt = `You are an AI response evaluator. Score the following AI response against each criterion.

Harshness level: ${harshnessLevel}/10 — ${harshnessInstruction}

Question: ${question}

AI Response: ${responseText}

Scoring Criteria:
${criteriaText}

Return ONLY a valid JSON object with this exact structure — no markdown, no explanation:
{
  "scores": {
    ${criteriaKeys.map((k: string) => `"${k}": { "score": <number>, "justification": "<one sentence>" }`).join(',\n    ')}
  }
}`;

        const evalResponse = await callPlatformAI(prompt, { zohoToken, req, maxTokens: 800 });

        const strippedEval = evalResponse.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
        const jsonMatch = strippedEval.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return error(res, 'Scoring agent returned unparseable response');

        const parsed = JSON.parse(jsonMatch[0]);
        success(res, parsed);
    } catch (err: any) {
        console.error('❌ [Gen-QA Score]:', err);
        error(res, err.message || 'Scoring failed', 500);
    }
});

// ── AI Test Route ──────────────────────────────────────────────────────

genqaRouter.post('/test', async (req: Request, res: Response) => {
    try {
        const { vendor, model, temperature, max_token, top_p, top_k, system_prompt, user_prompt, query, context } = req.body;

        // Map Gen-QA's vendor/model structure to what PlatformAI expects
        // ZAPM's PlatformAI wrapper defaults to anthropic / claude-sonnet-4-6
        const ai_vendor = vendor || 'anthropic';
        const ai_model = model || 'claude-sonnet-4-6';

        // Construct the full prompt text depending on the mode
        let fullPrompt = '';
        if (system_prompt || user_prompt) {
            fullPrompt = `System: ${system_prompt || ''}\n\nUser: ${user_prompt || ''}`;
        } else {
            fullPrompt = `Context: ${context || ''}\n\nQuery: ${query || ''}`;
        }

        // Call PlatformAI using the authenticated user's Zoho Token
        // This leverages ZAPM's existing auth flow
        const zohoToken = (req as any).session?.zoho?.accessToken;
        if (!zohoToken) {
            return error(res, 'Not authenticated — please sign in with Zoho first.', 401);
        }

        const responseText = await callPlatformAI(fullPrompt, {
            model: ai_model,
            ai_vendor: ai_vendor,
            maxTokens: max_token ? Number(max_token) : 1000,
            zohoToken,
            req
        });

        success(res, { response: responseText });

    } catch (err: any) {
        console.error('❌ [Gen-QA Test] AI Generation failed:', err);
        error(res, err.message || 'AI Generation failed', 500);
    }
});

export { genqaRouter };
