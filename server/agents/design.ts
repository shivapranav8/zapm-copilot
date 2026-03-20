import { z } from "zod";
import { callPlatformAI } from '../utils/platformAI';
import dotenv from 'dotenv';

dotenv.config();

// Define Schema
const designSchema = z.object({
    goal: z.string(),
    persona: z.string(),
    tone: z.string(),
    constraints: z.array(z.string()),
    screens: z.array(z.object({
        name: z.string(),
        description: z.string(),
        states: z.array(z.string())
    })),
    accessibility: z.array(z.string()),
});

export const designAgent = async (topic: string, mrdData?: any, zohoToken?: string) => {
    const prompt = `You are a Senior Product Designer.
Create a 'Design Prompt' for an AI UI generator (like Figma AI) based on this feature: "${topic}".

Context from Discovery (MRD):
${JSON.stringify(mrdData || {})}

Output strictly in JSON format with this exact structure:
{
  "goal": "string — high level design goal",
  "persona": "string — target persona (e.g. 'Busy Exec')",
  "tone": "string — visual tone (e.g. 'Clean, Enterprise, Friendly')",
  "constraints": ["string — technical or brand constraint"],
  "screens": [
    {
      "name": "string",
      "description": "string",
      "states": ["string — state name like Empty, Loading, Error, etc."]
    }
  ],
  "accessibility": ["string — WCAG compliance note"]
}`;

    const raw = await callPlatformAI(prompt, { temperature: 0.7, zohoToken });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Design agent did not return valid JSON');
    return JSON.parse(jsonMatch[0]);
};
