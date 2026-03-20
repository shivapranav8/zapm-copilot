import { z } from 'zod';
import { generateZohoNativeResponse } from '../templates/zohoNativeTemplate';
import { CommunityResponseData } from '../templates/communityResponseTemplate';
import { callPlatformAI } from '../utils/platformAI';

// Input schema for support ticket agent
const SupportTicketInputSchema = z.object({
    communityLink: z.string().describe('URL to the community thread'),
    developerNotes: z.string().optional().describe('Technical context and developer notes about the issue'),
    problemStatement: z.string().optional().describe('Problem statement from the support ticket'),
    prdContent: z.string().optional().describe('Relevant PRD content or context'),
    includeDelayApology: z.boolean().optional().describe('Whether to include "Sorry for the delay" (true if ticket is >7 days old)'),
    userName: z.string().optional().describe('Customer name to use in greeting (defaults to "there" if not provided)'),
    responderName: z.string().optional().describe('Full name of the support agent (responder) from Zoho Accounts'),
    zohoToken: z.string().optional().describe('Zoho OAuth token for PlatformAI auth'),
});

// Output schema
const SupportTicketOutputSchema = z.object({
    response: z.string().describe('Generated support response in HTML format (full template for preview)'),
    draftContent: z.string().describe('Simplified HTML for saving to Zoho Desk draft (no template wrapper)'),
    userName: z.string().optional().describe('Extracted user name from context'),
});

export type SupportTicketInput = z.infer<typeof SupportTicketInputSchema>;
export type SupportTicketOutput = z.infer<typeof SupportTicketOutputSchema>;


export async function generateSupportTicketResponse(
    input: SupportTicketInput
): Promise<SupportTicketOutput> {
    console.log('\n🎫 Generating support ticket response...');
    console.log('📝 Community Link:', input.communityLink);
    console.log('📝 Developer Notes:', (input.developerNotes || '').substring(0, 100) + '...');

    const hasDelay = input.includeDelayApology === true;
    const hasDeveloperNotes = input.developerNotes &&
        input.developerNotes !== "Answer the customer’s question directly based on your Zoho Analytics knowledge.";

    const responderName = input.responderName || "Shiva Pranav S";

    // Generate response using LLM
    // ── Two completely separate prompts depending on whether dev notes exist ──

    const htmlRules = `HTML FORMAT (STRICT):
- Output HTML only. No markdown (* or **).
- Wrap every feature name (Zoho Analytics, Query Table, Formula Column, Pivot View, Data Sources, Dashboard, Reports, etc.) in <strong> tags.
- Separate paragraphs with <br><br>.
- The template already adds greeting and signature — do NOT include them.
- Return ONLY valid JSON: {"mainContent": "...", "userName": "..."}`;

    const delayLine = hasDelay
        ? "Start body with: Sorry for the delay in getting back to you."
        : "Do NOT add a delay apology.";
    const delayStatus = hasDelay
        ? "DELAYED (>7 days). Start body with: Sorry for the delay in getting back to you."
        : "NOT DELAYED. Start with: Thank you for reaching out to us regarding your Zoho Analytics workspace.";

    const promptWithNotes = `You are a Zoho Analytics support agent writing a reply to a customer ticket.

YOUR ONLY JOB: Communicate the following developer message to the customer in a professional, empathetic tone.

DEVELOPER MESSAGE (this is the full content of your reply — do not add to it):
"""
${input.developerNotes}
"""

TICKET CONTEXT (use ONLY to extract: customer name, and the specific feature/area they are asking about — nothing else):
"""
${input.problemStatement || ""}
"""

INSTRUCTIONS:
1. Empathetically acknowledge the customer’s issue, naming the specific feature from the ticket (bold it with <strong>).
2. Clearly communicate the developer message above — word for word in spirit.
3. If the developer message says the team is working on a fix/agent/solution:
   - Say EXACTLY that: the team is actively working on it.
   - Do NOT add workarounds, SQL queries, or alternative solutions.
   - Do NOT say the feature is unsupported or unavailable.
   - Close with: We will notify you as soon as it is ready.
4. Keep it to 2-3 short paragraphs. Polite, calm, professional Zoho tone.
5. ${delayLine}

${htmlRules}`;

    const promptWithoutNotes = `You are ${responderName} from the Zoho Analytics Support team. Write a helpful support reply.

**FULL TICKET CONVERSATION**:
${input.problemStatement || "No conversation history available."}

**DELAY STATUS**: ${delayStatus}

**ZOHO ANALYTICS SUPPORT STYLE GUIDE**:
1. START WITH EMPATHY — Acknowledge the customer is blocked.
2. IDENTIFY THE EXACT ZOHO ANALYTICS AREA — Bold the feature with <strong>.
3. VALIDATE THE CUSTOMER’S USE CASE — Restate their specific goal.
4. ASK FOR REQUIRED DETAILS WHEN NEEDED — If info is missing, ask.
5. PROVIDE CLEAR, STEP-BY-STEP SOLUTIONS — Be proactive.
6. HANDLING FEATURE LIMITATIONS — Offer workarounds if available.
7. HANDLING FEATURE REQUESTS — Mention sharing with the product team.
8. USE SAMPLES, EXAMPLES, AND SCREENSHOTS — Format SQL with <br>.
9. HANDLE PERFORMANCE OR SYNC ISSUES CAREFULLY.
10. ROUTING TO THE RIGHT TEAM.
11. MAINTAIN ZOHO TONE — Polite, calm, professional.
12. END WITH A CLEAR NEXT STEP.
13. SAFE PHRASES — e.g., "Thank you for using <strong>Zoho Analytics</strong>".
14. FINAL CHECKLIST — <strong> tags on EVERY feature name.

${htmlRules}`;

    const prompt = hasDeveloperNotes ? promptWithNotes : promptWithoutNotes;

    const rawResponse = await callPlatformAI(prompt, { temperature: 0, model: 'gpt-4o', ai_vendor: 'openai', zohoToken: input.zohoToken });
    let mainContent = '';
    let userName = 'there';

    try {
        const content = rawResponse.trim();
        // Extract JSON using a more aggressive regex or just the whole content
        const firstBrace = content.indexOf('{');
        const lastBrace = content.lastIndexOf('}');
        
        if (firstBrace !== -1 && lastBrace !== -1) {
            const jsonStr = content.substring(firstBrace, lastBrace + 1);
            const parsed = JSON.parse(jsonStr);
            mainContent = parsed.mainContent || content;
            userName = parsed.userName || input.userName || 'there';
        } else {
            throw new Error('No JSON braces found');
        }
    } catch (e) {
        console.error('Failed to parse AI response as JSON, falling back to raw content clean-up');
        mainContent = rawResponse.replace(/```json|```/g, '').trim();
    }

    // POST-PROCESSING: Convert any leftover markdown bold (**text**) to HTML <strong>
    mainContent = mainContent.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // POST-PROCESSING: Strip any leading greeting the AI included
    // The Zoho template already adds "Hello {name}," before mainContent — strip it to avoid duplication
    mainContent = mainContent.replace(/^\s*(<[^>]+>)?\s*Hello\s+\w[\w\s]*,\s*(<\/[^>]+>)?\s*(<br\s*\/?>)?\s*/i, '');

    // POST-PROCESSING: Inject delay apology if flag is set
    // This ensures the apology is ALWAYS included when requested, regardless of AI behavior
    if (input.includeDelayApology) {
        const delayApology = '<div style="margin-bottom: 15px;">Sorry for the delay in getting back to you.</div>\n\n';

        // Check if apology is already present (case-insensitive)
        if (!mainContent.toLowerCase().includes('sorry for the delay')) {
            mainContent = delayApology + mainContent;
        }
    }

    // Generate final native HTML response (full template — for app preview only)
    const finalHtml = generateZohoNativeResponse({
        mainContent,
        userName,
        closingStatement: 'Hope this helps!',
        responderName,
    });

    // Simple draft content — what actually gets saved to Zoho Desk
    // NOTE: No greeting wrapper here — the AI already includes "Hello {name}," in mainContent
    const draftContent = `<div style="font-family: Arial, sans-serif; font-size: 13px;">
${mainContent}
<p>Hope this helps!</p>
<p>Regards,<br>${responderName}<br>Zoho Analytics Support</p>
</div>`;

    return {
        response: finalHtml,
        draftContent,
        userName,
    };
}
