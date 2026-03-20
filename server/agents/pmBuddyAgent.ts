import { TavilySearchAPIRetriever } from '@langchain/community/retrievers/tavily_search_api';
import { callPlatformAI } from '../utils/platformAI';

// ── Shared helper ─────────────────────────────────────────────────────────────

async function askAI(system: string, user: string, zohoToken?: string): Promise<string> {
    return callPlatformAI(`${system}\n\n---\n\n${user}`, { temperature: 0.3, zohoToken });
}

function extractJSON(raw: string): any {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI did not return valid JSON');
    return JSON.parse(match[0]);
}

// ── 1. Competitor Analysis ────────────────────────────────────────────────────

export interface Competitor {
    name: string;
    strengths: string[];
    weaknesses: string[];
    marketPosition: string;
    videoUrl?: string;
}

export interface CompetitorAnalysisData {
    competitors: Competitor[];
    marketInsights: string[];
    opportunities: string[];
}

// Top BI competitors to check for feature-level analysis, with their official doc domains
const BI_COMPETITORS: { name: string; docDomain: string }[] = [
    { name: 'Microsoft Power BI', docDomain: 'learn.microsoft.com' },
    { name: 'Tableau', docDomain: 'help.tableau.com' },
    { name: 'Looker', docDomain: 'cloud.google.com/looker/docs' },
    { name: 'Domo', docDomain: 'domo.com' },
    { name: 'Qlik Sense', docDomain: 'help.qlik.com' },
    { name: 'Metabase', docDomain: 'metabase.com/docs' },
    { name: 'Sisense', docDomain: 'sisense.com/docs' },
];

const COMPETITOR_SYSTEM = `You are a competitive intelligence analyst for Zoho Analytics, a Business Intelligence (BI) and data analytics platform.

You receive official documentation excerpts from BI competitors showing how they implement a SPECIFIC FEATURE.
Your job is to analyse HOW each competitor implements that exact feature — not their product overall.

## What to analyse (feature-level, not product-level)
For each competitor:
- How do they implement this specific feature? What is their approach?
- What does their implementation do well for the feature?
- What is missing or limited in their implementation of this feature?
- What is their positioning for this feature specifically?

## CRITICAL RULES
- Strengths and weaknesses must be about THIS SPECIFIC FEATURE's implementation, NOT about the product overall
- BAD: "Strong enterprise adoption" (product-level)
- GOOD: "Deployment Pipelines support 3 stages (Dev/Test/Prod) with one-click promotion" (feature-level)
- If a competitor does not have this feature, state that clearly as their weakness
- Base analysis on the official documentation provided — do not guess

Return ONLY valid JSON with this exact structure:
{
  "competitors": [
    {
      "name": "string — BI product name",
      "strengths": ["string — specific capability in their feature implementation", ...],
      "weaknesses": ["string — specific gap or limitation in their feature implementation", ...],
      "marketPosition": "string — one sentence on how they position THIS feature (e.g. 'Power BI calls this Deployment Pipelines — enterprise-focused, 3-stage promotion workflow')"
    }
  ],
  "marketInsights": ["string — pattern or trend in HOW BI tools implement this feature", ...],
  "opportunities": ["string — specific gap in competitor implementations that Zoho Analytics can address", ...]
}

Rules:
- Only include competitors for which documentation was found — skip others
- 3–4 strengths and 3–4 weaknesses each, all feature-specific
- 4–5 marketInsights about HOW this feature is implemented across the industry
- 4–5 opportunities specific to this feature's implementation gaps
- Do NOT include screenshot URLs`;

export async function runCompetitorAnalysis(
    featureName: string,
    domain: string,
    problemStatement: string,
    targetUsers: string,
    zohoToken?: string,
): Promise<CompetitorAnalysisData> {
    console.log(`🔍 [PM Buddy] Feature-level competitor analysis: "${featureName}"`);

    // Run parallel searches — one per top BI competitor, targeting their official docs
    let searchContext = '';
    try {
        const retriever = new TavilySearchAPIRetriever({ k: 3 });

        // Pick 4 competitors to search (avoids rate limits)
        const targets = BI_COMPETITORS.slice(0, 4);
        const searchQueries = targets.map(c =>
            retriever.invoke(`"${featureName}" site:${c.docDomain} OR "${featureName}" ${c.name} official documentation feature`)
        );

        console.log(`🔎 [PM Buddy] Running ${targets.length} parallel feature doc searches...`);
        const allResults = await Promise.allSettled(searchQueries);

        const sections: string[] = [];
        allResults.forEach((result, i) => {
            if (result.status === 'fulfilled' && result.value.length > 0) {
                const docs = result.value
                    .map((r: any) => `  [${r.metadata?.source || 'unknown'}]\n  ${r.pageContent.slice(0, 600)}`)
                    .join('\n');
                sections.push(`=== ${targets[i].name} — "${featureName}" ===\n${docs}`);
            } else {
                sections.push(`=== ${targets[i].name} — "${featureName}" ===\n  (No documentation found)`);
            }
        });

        searchContext = sections.join('\n\n');
        console.log(`✅ [PM Buddy] Feature doc search complete (${searchContext.length} chars)`);
    } catch (err: any) {
        console.warn(`⚠️  [PM Buddy] Search failed: ${err?.message?.slice(0, 80)}. Using AI knowledge.`);
        searchContext = `(No live search data — use your knowledge of how BI tools implement "${featureName}")`;
    }

    const userMessage = `Analyse how BI competitors implement the "${featureName}" feature in Zoho Analytics:

Feature being analysed: ${featureName}
Domain: ${domain}
Problem it solves: ${problemStatement}
Target users: ${targetUsers}

Official documentation excerpts from BI competitors:
${searchContext}

For each competitor where documentation was found, analyse ONLY their implementation of "${featureName}" — not their product overall.
Return structured JSON.`;

    const raw = await askAI(COMPETITOR_SYSTEM, userMessage, zohoToken);
    const parsed = extractJSON(raw);

    return {
        competitors: (parsed.competitors || []).map((c: any) => ({
            name: c.name || '',
            strengths: c.strengths || [],
            weaknesses: c.weaknesses || [],
            marketPosition: c.marketPosition || '',
            videoUrl: c.videoUrl,
        })),
        marketInsights: parsed.marketInsights || [],
        opportunities: parsed.opportunities || [],
    };
}

// ── 2. MRD Generation ─────────────────────────────────────────────────────────

export interface MRDPersona {
    name: string;
    description: string;
    needs: string[];
}

export interface MRDUseCase {
    title: string;
    description: string;
}

export interface MRDSchemaTable {
    table: string;
    fields: string[];
}

export interface MRDData {
    version: number;
    featureName: string;
    objectives: string[];
    personas: MRDPersona[];
    useCases: MRDUseCase[];
    successMetrics: string[];
    constraints: string[];
    zohoImplementation: {
        dataSources: string[];
        schema: MRDSchemaTable[];
        kpis: string[];
        dashboards: string[];
        permissions: string[];
        architecture: string;
    };
    status: 'draft' | 'approved' | 'changes-requested';
}

const MRD_SYSTEM = `You are a Senior Product Manager at Zoho Analytics writing a Marketing Requirements Document (MRD).

You will receive feature context and competitor analysis. Write a comprehensive, specific MRD for this exact feature — not a generic template.

Return ONLY valid JSON with this exact structure:
{
  "objectives": ["string — specific measurable business objective", ...],
  "personas": [
    {
      "name": "string — persona role title",
      "description": "string — 1 sentence who they are and what they do",
      "needs": ["string", "string", "string"]
    }
  ],
  "useCases": [
    {
      "title": "string — action-oriented use case title",
      "description": "string — 1-2 sentences describing the exact workflow"
    }
  ],
  "successMetrics": ["string — measurable KPI with target value", ...],
  "constraints": ["string — specific technical or business constraint", ...],
  "zohoImplementation": {
    "dataSources": ["string — specific Zoho product or external source", ...],
    "schema": [
      { "table": "string", "fields": ["string", ...] }
    ],
    "kpis": ["string — metric name to track", ...],
    "dashboards": ["string — dashboard name", ...],
    "permissions": ["string — 'Role (capability description)'", ...],
    "architecture": "string — multi-line technical architecture description"
  }
}

Rules:
- 4–6 objectives, each starting with an action verb
- 3–4 personas relevant to this exact feature
- 4–6 use cases
- 4–6 success metrics with specific numbers
- 3–5 constraints that are real for Zoho Analytics
- zohoImplementation must be tailored to this specific feature, not generic`;

export async function generateMRD(
    featureData: { featureName: string; domain: string; problemStatement: string; targetUsers: string },
    competitorData: CompetitorAnalysisData | null,
    zohoToken?: string,
): Promise<MRDData> {
    console.log(`📄 [PM Buddy] Generating MRD for: ${featureData.featureName}`);

    const competitorSection = competitorData && competitorData.competitors.length > 0
        ? `Competitor Landscape:
${competitorData.competitors.map(c => `- ${c.name}: strengths: ${c.strengths.slice(0, 2).join(', ')}; gaps: ${c.weaknesses.slice(0, 2).join(', ')}`).join('\n')}

Opportunities identified:
${competitorData.opportunities.slice(0, 4).map(o => `- ${o}`).join('\n')}`
        : `No competitor data available — infer the competitive landscape for the ${featureData.domain} BI space from your knowledge.`;

    const userMessage = `Generate an MRD for this feature:

Feature Name: ${featureData.featureName}
Domain: ${featureData.domain}
Problem Statement: ${featureData.problemStatement}
Target Users: ${featureData.targetUsers}

${competitorSection}

Write a specific, detailed MRD for THIS feature — base everything on the actual feature and problem, not generic analytics product content.`;

    const raw = await askAI(MRD_SYSTEM, userMessage, zohoToken);
    const parsed = extractJSON(raw);

    return {
        version: 1,
        featureName: featureData.featureName,
        objectives: parsed.objectives || [],
        personas: (parsed.personas || []).map((p: any) => ({
            name: p.name || '',
            description: p.description || '',
            needs: p.needs || [],
        })),
        useCases: (parsed.useCases || []).map((u: any) => ({
            title: u.title || '',
            description: u.description || '',
        })),
        successMetrics: parsed.successMetrics || [],
        constraints: parsed.constraints || [],
        zohoImplementation: {
            dataSources: parsed.zohoImplementation?.dataSources || [],
            schema: (parsed.zohoImplementation?.schema || []).map((s: any) => ({
                table: s.table || '',
                fields: s.fields || [],
            })),
            kpis: parsed.zohoImplementation?.kpis || [],
            dashboards: parsed.zohoImplementation?.dashboards || [],
            permissions: parsed.zohoImplementation?.permissions || [],
            architecture: parsed.zohoImplementation?.architecture || '',
        },
        status: 'draft',
    };
}

// ── 3. FRD Generation ─────────────────────────────────────────────────────────

export interface FRDRequirement {
    id: string;
    requirement: string;
    priority: 'High' | 'Medium' | 'Low';
}

export interface FRDUserFlow {
    name: string;
    steps: string[];
}

export interface FRDAPISpec {
    endpoint: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    purpose: string;
}

export interface FRDData {
    version: number;
    featureName: string;
    functionalRequirements: FRDRequirement[];
    userFlows: FRDUserFlow[];
    apiDataNeeds: FRDAPISpec[];
    nonFunctionalRequirements: string[];
    status: 'draft' | 'approved' | 'changes-requested';
}

const FRD_SYSTEM = `You are a Senior Product Manager at Zoho Analytics writing a Functional Requirements Document (FRD).

You receive a feature name, problem statement, and MRD context. Write a specific, implementable FRD.

Return ONLY valid JSON with this exact structure:
{
  "functionalRequirements": [
    {
      "id": "FR-001",
      "requirement": "string — specific, testable requirement starting with 'System shall...'",
      "priority": "High" | "Medium" | "Low"
    }
  ],
  "userFlows": [
    {
      "name": "string — flow name (verb + noun)",
      "steps": ["string — numbered action step", ...]
    }
  ],
  "apiDataNeeds": [
    {
      "endpoint": "string — /api/v1/...",
      "method": "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
      "purpose": "string — one sentence"
    }
  ],
  "nonFunctionalRequirements": ["string — specific NFR with measurable target", ...]
}

Rules:
- 6–10 functional requirements (FR-001 through FR-xxx), mix of High/Medium/Low priority
- 3–4 user flows, each with 5–7 specific action steps
- 4–6 API endpoints relevant to this feature
- 6–8 non-functional requirements with specific numbers (response time, uptime, limits)
- All requirements must be SPECIFIC to this feature — no generic filler`;

export async function generateFRD(
    featureData: { featureName: string; domain: string; problemStatement: string; targetUsers: string },
    mrdData: MRDData,
    zohoToken?: string,
): Promise<FRDData> {
    console.log(`📋 [PM Buddy] Generating FRD for: ${featureData.featureName}`);

    const mrdSummary = `
Objectives: ${mrdData.objectives.slice(0, 3).join('; ')}
Use Cases: ${mrdData.useCases.map(u => u.title).join(', ')}
Constraints: ${mrdData.constraints.slice(0, 3).join('; ')}
Permissions: ${mrdData.zohoImplementation.permissions.join(', ')}`;

    const userMessage = `Generate an FRD for this feature:

Feature Name: ${featureData.featureName}
Domain: ${featureData.domain}
Problem Statement: ${featureData.problemStatement}
Target Users: ${featureData.targetUsers}

MRD Context:
${mrdSummary}

Write specific, implementable functional requirements, user flows, API specs, and NFRs for THIS feature.`;

    const raw = await askAI(FRD_SYSTEM, userMessage, zohoToken);
    const parsed = extractJSON(raw);

    return {
        version: 1,
        featureName: featureData.featureName,
        functionalRequirements: (parsed.functionalRequirements || []).map((r: any, i: number) => ({
            id: r.id || `FR-${String(i + 1).padStart(3, '0')}`,
            requirement: r.requirement || '',
            priority: (['High', 'Medium', 'Low'].includes(r.priority) ? r.priority : 'Medium') as 'High' | 'Medium' | 'Low',
        })),
        userFlows: (parsed.userFlows || []).map((f: any) => ({
            name: f.name || '',
            steps: f.steps || [],
        })),
        apiDataNeeds: (parsed.apiDataNeeds || []).map((a: any) => ({
            endpoint: a.endpoint || '',
            method: a.method || 'GET',
            purpose: a.purpose || '',
        })),
        nonFunctionalRequirements: parsed.nonFunctionalRequirements || [],
        status: 'draft',
    };
}

// ── 4. Chat Handler ───────────────────────────────────────────────────────────

export interface ChatContext {
    stage: string;
    featureData?: { featureName: string; domain: string; problemStatement: string; targetUsers: string } | null;
    mrdData?: MRDData | null;
    frdData?: FRDData | null;
}

const CHAT_SYSTEM = `You are a PM Co-pilot assistant helping an Associate Product Manager (APM) at Zoho Analytics build product documents.

You are a context-aware assistant — you know what stage the user is at and what documents have been generated.
Keep responses concise (2–4 sentences) and actionable.
If the user asks to change something, acknowledge and explain what they should do next.
Do not generate full documents in chat — just guide, answer questions, and give advice.`;

export async function handleChat(message: string, context: ChatContext, zohoToken?: string): Promise<string> {
    const contextSummary = [
        `Current stage: ${context.stage}`,
        context.featureData ? `Feature: ${context.featureData.featureName} (${context.featureData.domain})` : '',
        context.mrdData ? `MRD: drafted with ${context.mrdData.objectives.length} objectives, ${context.mrdData.personas.length} personas` : '',
        context.frdData ? `FRD: ${context.frdData.functionalRequirements.length} requirements, status: ${context.frdData.status}` : '',
    ].filter(Boolean).join('\n');

    const userMessage = `Context:\n${contextSummary}\n\nUser message: ${message}`;

    try {
        return await askAI(CHAT_SYSTEM, userMessage, zohoToken);
    } catch {
        return "I'm processing your request. How else can I assist you with the product workflow?";
    }
}
