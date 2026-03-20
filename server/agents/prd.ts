import { z } from "zod";
import { callPlatformAI } from '../utils/platformAI';
import dotenv from 'dotenv';
import { findSimilarPRDs } from '../utils/vectorDB';
import { expandQueryWithAliases } from '../utils/featureAliases';

dotenv.config();

export const prdAgent = async (
    topic: string,
    mrdData?: any,
    competitorData?: any,
    images?: string[], // Base64 encoded images or URLs
    zohoToken?: string
) => {
    const imageContext = images && images.length > 0
        ? `\nMockup Images Provided: ${images.length} screenshot(s) - analyze UI elements and flows to extract granular sub-features.`
        : "";

    // RAG: Retrieve similar PRDs from vector DB with improved query
    let ragQuery = topic;
    if (mrdData) {
        const mrdText = typeof mrdData === 'string' ? mrdData : JSON.stringify(mrdData);
        ragQuery += `\n${mrdText.substring(0, 500)}`;
    }

    const expandedQuery = expandQueryWithAliases(ragQuery);
    console.log(`🔍 Original Query: ${ragQuery.substring(0, 100)}...`);
    console.log(`🔍 Expanded Query: ${expandedQuery.substring(0, 200)}...`);

    const similarPRDs = await findSimilarPRDs(expandedQuery, 10);
    console.log(`📚 Retrieved ${similarPRDs.length} similar PRDs:`);
    similarPRDs.forEach((prd, idx) => {
        console.log(`   ${idx + 1}. ${prd.metadata.filename} (similarity: ${(1 - prd.distance).toFixed(2)})`);
    });

    let examplesContext = "";
    if (similarPRDs.length > 0) {
        examplesContext = "\n\nYour Company's PRD Style Examples (follow this format and tone):\n" +
            similarPRDs.map((prd, idx) =>
                `\n--- Example ${idx + 1} (Similarity: ${(1 - (prd.distance || 0)).toFixed(2)}) ---\n${prd.content}\n`
            ).join("\n");
    }

    const prompt = `You are a Senior Product Manager creating a Functional Requirements Document (PRD/FRD).

Input Context:
- Feature/Topic: "${topic}"
- MRD Data: ${JSON.stringify(mrdData || {})}
- Competitor Insights: ${JSON.stringify(competitorData || {})}${imageContext}${examplesContext}

Create a functional requirements table with these 4 columns:
1. **Feature** – top-level capability group (e.g., "User Authentication", "Dashboard", "Settings")
2. **Sub-feature** – specific UI element or user-facing functionality (e.g., "Login Form", "Password Reset Link")
3. **Description** – clear explanation of what it does and how it behaves (user perspective, not implementation)
4. **PM Notes** – implementation notes, edge cases, follow-ups, dependencies

Requirements:
- Go as GRANULAR as possible - every button, field, interaction should be a row
- Group related sub-features under their parent features
- Cover the FULL LIFECYCLE for each feature: Create, Read/View, Edit/Update, Delete operations
- Only include UI/backend behaviors DIRECTLY RELEVANT to the user experience
- Do NOT explain third-party tools unless they are integrated into the feature
- Avoid low-level implementation details unless CRITICAL to behavior
- For each sub-feature, ask: "What does the user see/do?" and "What happens when they interact with it?"

Return ONLY a JSON object with this exact structure:
{ "featureName": "string", "rows": [{ "feature": "string", "subFeature": "string", "description": "string", "pmNotes": "string" }], "generatedAt": "string" }`;

    const raw = await callPlatformAI(prompt, { temperature: 0.2, zohoToken });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('PRD agent did not return valid JSON');
    const result = JSON.parse(jsonMatch[0]);

    // Ensure generatedAt is set
    if (!result.generatedAt) {
        result.generatedAt = new Date().toISOString();
    }

    return result;
};
