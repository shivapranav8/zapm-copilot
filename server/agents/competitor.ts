import { z } from "zod";
import { TavilySearchAPIRetriever } from "@langchain/community/retrievers/tavily_search_api";
import { callPlatformAI } from '../utils/platformAI';
import dotenv from 'dotenv';

dotenv.config();

export const competitorAgent = async (topic: string, productUrl: string, zohoToken?: string) => {
    console.log(`🔎 [Researcher] Deep Dive Search for: ${topic} (Context: ${productUrl})`);

    // 1. Perform Search
    const retriever = new TavilySearchAPIRetriever({ k: 3 });

    console.log('🔎 [Researcher] Starting Tavily search...');
    const searchResults = await retriever.invoke(`how competitors implement "${topic}" feature comparison ${productUrl ? `vs ${productUrl}` : ''} user docs api`);
    console.log('✅ [Researcher] Search complete. Found results:', searchResults.length);

    // 2. Synthesize with PlatformAI
    const prompt = `You are a Competitive Intelligence Product Agent.
OBJECTIVE: Perform a "Feature-Level Deep Dive" analysis on the feature: "${topic}".
CONTEXT: The user's product is at: "${productUrl}".

ONE-LINE RULE: Competitive analysis must decompose features into capabilities, NOT compare products at a surface level.

1. BREAKDOWN: Decompose the feature into 4-6 specific "Capability Dimensions" (e.g., if "Real-time Collaboration", dimensions might be "Cursor Tracking", "Conflict Resolution", "Version History").
2. MATRIX: For each competitor, evaluate them against these EXACT dimensions.
3. INSIGHTS: Identify market patterns, design trade-offs, and white space opportunities.

RAW SEARCH DATA:
${JSON.stringify(searchResults)}

Return ONLY strictly valid JSON output matching this schema:
{
    "featureDefinition": "string",
    "capabilityDimensions": [
        { "name": "string", "description": "string" }
    ],
    "competitors": [
        {
            "name": "string (Real company name)",
            "capabilities": {
                "Dimension Name 1": "Value/Assessment",
                "Dimension Name 2": "Value"
            },
            "strengths": ["string (Feature specific)"],
            "gaps": ["string (Feature specific)"],
            "marketPosition": "string",
            "videoUrl": "string (optional)"
        }
    ],
    "insights": {
        "marketPatterns": ["string"],
        "designTradeoffs": ["string"],
        "whiteSpace": ["string"]
    },
    "opportunityZones": ["string"]
}`;

    console.log('🤖 [Researcher] Starting AI synthesis...');
    const raw = await callPlatformAI(prompt, { temperature: 0.5, zohoToken });
    console.log('✅ [Researcher] AI synthesis complete.');

    try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error('No JSON found');
        return JSON.parse(jsonMatch[0]);
    } catch (e) {
        console.error("Failed to parse JSON", e);
        return { error: "Failed to generate competitor data" };
    }
};
