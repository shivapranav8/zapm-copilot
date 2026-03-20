/**
 * Zoho PlatformAI wrapper
 * Endpoint: POST /internalapi/v2/ai/chat
 * Auth: User OAuth token — scope: PlatformAI.organizations.all
 * Headers: portal_id only (no service/service_org_id needed for ZAPM keyless portal)
 */

import type { Request } from 'express';

const PLATFORM_AI_BASE = 'https://platformai.zoho.in/internalapi/v2/ai/chat';
const PORTAL_ID = process.env.ZOHO_PLATFORM_AI_PORTAL_ID || 'ZAPM';

async function makeRequest(prompt: string, model: string, ai_vendor: string, zohoToken: string, maxTokens: number) {
    const res = await fetch(PLATFORM_AI_BASE, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'portal_id': PORTAL_ID,
            'Authorization': `Zoho-oauthtoken ${zohoToken}`,
        },
        body: JSON.stringify({
            messages: [{ role: 'user', content: prompt }],
            model,
            ai_vendor,
            max_tokens: maxTokens,
        }),
    });

    const data = await res.json() as any;
    return { res, data };
}

export async function callPlatformAI(
    prompt: string,
    options: {
        model?: string;
        ai_vendor?: string;
        temperature?: number;
        maxTokens?: number;
        zohoToken?: string;
        req?: Request; // pass req to enable auto token refresh on 401
    } = {}
): Promise<string> {
    const { model = 'claude-sonnet-4-6', ai_vendor = 'anthropic', maxTokens = 8192, req } = options;
    let zohoToken = options.zohoToken;

    if (!zohoToken) {
        throw new Error('zohoToken is required for PlatformAI — user must be logged in with Zoho');
    }


    console.log(`🤖 [PlatformAI] Calling model: ${model} | portal: ${PORTAL_ID} | max_tokens: ${maxTokens}`);

    let { res, data } = await makeRequest(prompt, model, ai_vendor, zohoToken, maxTokens);

    // Auto-refresh token and retry once on 401
    if (res.status === 401 && req) {
        console.warn('⚠️  [PlatformAI] 401 received — attempting token refresh...');
        try {
            const { refreshSessionToken } = await import('../routes/authRoutes.js');
            zohoToken = await refreshSessionToken(req);
            const retried = await makeRequest(prompt, model, ai_vendor, zohoToken, maxTokens);
            res = retried.res;
            data = retried.data;
        } catch (refreshErr) {
            console.error('❌ [PlatformAI] Token refresh failed:', refreshErr);
            throw new Error('Session expired. Please log out and log back in.');
        }
    }

    if (!res.ok) {
        console.error(`❌ [PlatformAI] Error ${res.status}:`, JSON.stringify(data));
        throw new Error(`PlatformAI error ${res.status}: ${data?.error?.message || JSON.stringify(data)}`);
    }

    const result = data?.data?.results?.[0];

    if (!result) {
        console.error(`❌ [PlatformAI] Unexpected response shape:`, JSON.stringify(data));
        throw new Error(`PlatformAI returned unexpected response: ${JSON.stringify(data).slice(0, 200)}`);
    }

    console.log(`✅ [PlatformAI] Success | model: ${model} | credits: ${data?.data?.usage?.zoho_total_credits}`);
    return result;
}
