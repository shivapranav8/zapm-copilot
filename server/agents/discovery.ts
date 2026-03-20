import { z } from "zod";
import { callPlatformAI } from '../utils/platformAI';
import dotenv from 'dotenv';

dotenv.config();

// Define the Schema
const mrdSchema = z.object({
    featureName: z.string(),
    problemStatement: z.string(),
    personas: z.array(z.object({
        name: z.string(),
        description: z.string()
    })),
    painPoints: z.array(z.string()),
    currentJourney: z.array(z.string()),
    priority: z.enum(['Must Have', 'Should Have', 'Could Have', "Won't Have"]),
});

export const discoveryAgent = async (topic: string, zohoToken?: string) => {
    const prompt = `You are an expert Product Manager defined as a "Discovery Agent".
Your goal is to define the boundaries of a new feature idea.

Topic: ${topic}

Think step-by-step:
1. Who is this for?
2. What really hurts right now? (The Problem)
3. How do they do it today? (The Journey)

Output strictly in JSON format with this exact structure:
{
  "featureName": "string",
  "problemStatement": "string",
  "personas": [{ "name": "string", "description": "string" }],
  "painPoints": ["string"],
  "currentJourney": ["string"],
  "priority": "Must Have" | "Should Have" | "Could Have" | "Won't Have"
}`;

    const raw = await callPlatformAI(prompt, { temperature: 0.7, zohoToken });

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Discovery agent did not return valid JSON');
    const result = JSON.parse(jsonMatch[0]);

    return {
        ...result,
        version: 1,
        status: 'draft'
    };
};
