import { z } from 'zod';
import { callPlatformAI } from '../utils/platformAI';

const preambleSchema = z.object({
    whatItIs: z.string(),
    triggeredFrom: z.string(),
    whoCanTrigger: z.string(),
    successMetrics: z.string(),
});

const useCaseRowSchema = z.object({
    sNo: z.string(),
    useCase: z.string(),
    description: z.string(),
    pmNotes: z.string(),
    developerNotes: z.string(),
    qaNotes: z.string(),
});

const useCaseOutputSchema = z.object({
    featureName: z.string(),
    preamble: preambleSchema,
    useCases: z.array(useCaseRowSchema),
});

export type UseCaseOutput = z.infer<typeof useCaseOutputSchema>;

export async function generateUseCases(
    topic: string,
    mrdData?: any,
    prdData?: any,
    zohoToken?: string,
): Promise<UseCaseOutput> {
    console.log(`\n📋 [Use Case Agent] Generating use cases for: ${topic}`);

    const mrdContext = mrdData ? JSON.stringify(mrdData, null, 2).substring(0, 2000) : 'Not provided';
    const prdContext = prdData
        ? (Array.isArray(prdData.rows)
            ? prdData.rows.map((r: any) => `${r.feature} > ${r.subFeature}: ${r.description}`).join('\n')
            : JSON.stringify(prdData, null, 2).substring(0, 2000))
        : 'Not provided';

    const prompt = `You are a Senior Product Manager writing a Use Cases sheet for a PRD.

Feature / Topic: "${topic}"

MRD Context:
${mrdContext}

PRD Functional Requirements (already generated):
${prdContext}

---

Your task: Generate a comprehensive Use Cases document that captures every significant user journey for this feature.

**Preamble**: Write a clear overview of the feature — what it is, where it lives, who uses it, and how success is measured.

**Use Cases**: Cover the FULL lifecycle:
- Creation / Setup flows
- Viewing / Reading / Listing
- Editing / Updating
- Deletion / Removal
- Permissions / Access control
- Error / edge case flows
- Any secondary flows (e.g., sharing, exporting, notifications)

For each use case:
- **Use Case**: Short action-oriented title
- **Description**: Step-by-step user flow with what they see and what happens at each step
- **PM Notes**: Business rules, edge cases, phasing decisions, dependencies
- **Developer Notes**: API design considerations, performance concerns, data models, technical constraints
- **QA Notes**: Test scenarios, boundary conditions, validation rules, regression areas

Aim for 8-15 use cases minimum. Be thorough and specific to "${topic}" in the context of Zoho Analytics.

Return ONLY valid JSON with this exact structure:
{
  "featureName": "string",
  "preamble": {
    "whatItIs": "string",
    "triggeredFrom": "string",
    "whoCanTrigger": "string",
    "successMetrics": "string"
  },
  "useCases": [
    {
      "sNo": "1",
      "useCase": "string",
      "description": "string",
      "pmNotes": "string",
      "developerNotes": "string",
      "qaNotes": "string"
    }
  ]
}`;

    const raw = await callPlatformAI(prompt, { temperature: 0.3, zohoToken });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Use case agent did not return valid JSON');
    const result = JSON.parse(jsonMatch[0]);

    console.log(`✅ [Use Case Agent] Generated ${result.useCases?.length || 0} use cases`);
    return result;
}
