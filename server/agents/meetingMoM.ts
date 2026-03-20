import { z } from 'zod';
import { callPlatformAI } from '../utils/platformAI';

// Input schema for meeting MoM generator
const MeetingMoMInputSchema = z.object({
    meetingLink: z.string().optional().describe('Link to meeting recording'),
    transcript: z.string().optional().describe('Meeting transcript or notes'),
    meetingTitle: z.string().optional().describe('Title of the meeting'),
    visualContext: z.string().optional().describe('Visual context from screen sharing/slides analysis'),
    verbosity: z.enum(['brief', 'standard', 'detailed']).optional().describe('Generate detailed report with term validation'),
    zohoToken: z.string().optional().describe('Zoho OAuth token for PlatformAI auth'),
});

// Output schema matching frontend MeetingMoMData interface
const MeetingMoMOutputSchema = z.object({
    meetingTitle: z.string(),
    date: z.string(),
    duration: z.string(),
    attendees: z.array(z.string()),
    summary: z.string(),
    keyDiscussions: z.array(z.string()),
    decisions: z.array(z.string()),
    actionItems: z.array(z.object({
        id: z.string(),
        task: z.string(),
        assignee: z.string(),
        dueDate: z.string(),
        priority: z.enum(['High', 'Medium', 'Low']),
        status: z.enum(['Pending', 'In Progress', 'Completed']),
    })),
    termDefinitions: z.array(z.object({
        term: z.string(),
        definition: z.string(),
        status: z.enum(['Verified', 'Needs Review']),
    })).optional(),
    nextMeeting: z.string().optional(),
});

export type MeetingMoMInput = z.infer<typeof MeetingMoMInputSchema>;
export type MeetingMoMOutput = z.infer<typeof MeetingMoMOutputSchema>;


export async function generateMeetingMoM(
    input: MeetingMoMInput
): Promise<MeetingMoMOutput> {
    console.log('\n📝 Generating Meeting MoM...');

    // For now, we need a transcript. Meeting link fetching is not yet implemented
    if (!input.transcript) {
        if (input.meetingLink) {
            console.warn('⚠️  Meeting link provided but transcript fetching not yet implemented');
            // Return helpful fallback
            return {
                meetingTitle: input.meetingTitle || 'Team Meeting',
                date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
                duration: '1h',
                attendees: ['Team Member'],
                summary: 'To generate meeting minutes, please provide the meeting transcript. Meeting link processing is coming soon!',
                keyDiscussions: ['Transcript required for processing'],
                decisions: [],
                actionItems: [],
            };
        }
        throw new Error('Either transcript or meeting link is required');
    }

    const transcript = input.transcript;
    console.log('📄 Transcript length:', transcript.length, 'characters');
    console.log('📄 Transcript preview:', transcript.slice(0, 300));

    if (transcript.trim().length < 200) {
        throw new Error(`Transcript too short to generate meaningful MoM (${transcript.trim().length} chars). The recording may be silent or the audio extraction failed.`);
    }

    if (input.visualContext) {
        console.log('👁️  Visual context available:', input.visualContext.length, 'characters');
    }


    const biContext = `
**Domain Context**:
These meetings are Business Intelligence / Data Analytics discussions. You will encounter these terms — interpret them correctly:
- KPI (Key Performance Indicator), DAU/MAU (Daily/Monthly Active Users), WAU (Weekly Active Users)
- Churn, Retention, Cohort, Funnel, Conversion Rate, LTV (Lifetime Value), ARR/MRR
- ETL / ELT (Extract Transform Load), Data Pipeline, Data Warehouse, Data Lake, Data Mart
- PII (Personally Identifiable Information), GDPR, Data Masking, Anonymization
- SQL, BigQuery, Snowflake, Redshift, dbt, Tableau, Power BI, Looker, Metabase
- NPS (Net Promoter Score), CSAT, Session, Engagement, Bounce Rate, Stickiness
- Dimension, Fact Table, Star Schema, Slowly Changing Dimension (SCD)
- Sprint, Backlog, Epic, Story Points, Velocity (Agile/Scrum terms may appear)
If an acronym appears that is NOT in this list, mark it as "Needs Review".

**Language Note**:
The transcript may be in Tanglish (Tamil + English code-switching). Tamil words or phrases may appear transliterated in English (e.g., "seri", "enna", "panrom", "pakkalaam"). Treat them as conversational filler and focus on the English technical content. Do not translate Tamil words — just skip them when extracting facts.
`;

    const verbosity = input.verbosity || 'brief'; // Default to brief

    const verbosityGuide = verbosity === 'brief'
        ? 'EXTREMELY CONCISE (Action-Oriented Pointers): Provide only sharp, single-line bullet points. Do NOT write paragraphs or descriptive fluff. For Discussions (Key Points) and Decisions, write raw, direct facts (e.g., "Include & Exclude filters -> separate tabs"). **CRITICAL LIMIT: You MUST aggressively merge related points to output exactly 6 to 10 bullet points MAXIMUM per section (Discussions, Decisions).** Keep the summary to a single simple sentence.'
        : verbosity === 'detailed'
        ? 'Be thorough — 4-6 sentences per discussion point, capture nuances, quotes, and specifics. Generate a DEEP DIVE, HIGH-FIDELITY meeting record.'
        : 'Be descriptive — 3-4 paragraphs per discussion point, NEVER write one-liners or short labels.';

    const systemPrompt = `You are an expert BI (Business Intelligence) Technical Writer and Meeting Analyst. Analyze the meeting transcript${input.visualContext ? ' and visual context' : ''} to generate a structured meeting record.
${biContext}

**Meeting Transcript**:
${transcript}
${input.visualContext ? `\n**Visual Context**:\n${input.visualContext}\n` : ''}

**Verbosity Instruction**:
${verbosityGuide}

**Your Task**:
Generate an extensive JSON report. Focus on capturing technical nuances, specific data points, and verifying BI terminology (e.g., PII, ETL, KPI, etc.).

1. **Meeting Title**: Specific and descriptive. Infer from the transcript or use "${input.meetingTitle || 'Team Meeting'}"
2. **Attendees**: List names clearly heard or mentioned. Only add a role if explicitly stated. Otherwise just the name.
3. **Summary**: A paragraph capturing the core narrative and business value. Follow the verbosity instruction.
4. **Key Discussions**: List of main points. Follow the verbosity instruction for length and detail. Never write a single phrase. 
5. **Decisions Made**: Precise decisions explicitly agreed upon.
6. **Action Items**: Detailed tasks explicitly assigned.
   - Assignee: only if explicitly named. Use "Unassigned" otherwise.
   - Due date: only if explicitly mentioned. Use "TBD" otherwise. Do NOT invent dates.
   - Priority: infer from urgency words ("urgent", "ASAP", "by EOD", "next sprint") only.
7. **Term Validation** (CRITICAL):
   - Identify ALL acronyms, technical parameters, and BI-specific jargon (e.g., "PAU", "MAU", "Churn", "Cohort").
   - Define them based on context using the domain context above.
   - If a term is ambiguous or used loosely, mark status as "Needs Review". If standard/clear, "Verified".

**Output Format**:
Return ONLY valid JSON:
{
  "meetingTitle": "string",
  "date": "Month DD, YYYY",
  "duration": "string (only if mentioned, otherwise 'Not mentioned')",
  "attendees": ["Name" or "Name (Role if explicitly stated)"],
  "summary": "string",
  "keyDiscussions": ["string"],
  "decisions": ["string"],
  "actionItems": [{ "id": "1", "task": "string", "assignee": "Name or Unassigned", "dueDate": "Date or TBD", "priority": "High|Medium|Low", "status": "Pending" }],
  "nextMeeting": "string or omit if not mentioned",
  "termDefinitions": [
    { "term": "PII", "definition": "Personally Identifiable Information - Context: discussed regarding masking in export", "status": "Verified" },
    { "term": "PAU", "definition": "Unknown acronym used in context of user stats", "status": "Needs Review" }
  ]
}
`;

    const prompt = `${systemPrompt}

**Important**:
- Use today's date: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
- Duration: only fill if explicitly discussed in the meeting, otherwise use "Not mentioned"
- Assign sequential IDs to action items ("1", "2", "3", ...)
- Be specific and actionable in action items
- If the transcript is in Tamil or Tanglish, focus on the English technical content — skip Tamil filler words
${input.visualContext ? '- Incorporate information from slides, diagrams, or screen shares when relevant\n' : ''}- Key Discussions must cover EVERY distinct topic raised in the transcript — do not skip any discussion point, no matter how brief
- Return ONLY the JSON object, no other text
`;

    const rawResponse = await callPlatformAI(prompt, { temperature: 0.3, zohoToken: input.zohoToken });

    try {
        const content = rawResponse;

        // Remove markdown code blocks if present
        const cleanContent = content
            .replace(/```json\n ?/g, '')
            .replace(/```\n?/g, '')
            .trim();

        const parsed = JSON.parse(cleanContent);

        // Validate shape — log warnings but don't block on minor mismatches
        const validation = MeetingMoMOutputSchema.safeParse(parsed);
        if (!validation.success) {
            console.warn('⚠️  MoM response has schema mismatches:', JSON.stringify(validation.error.flatten()));
        }

        console.log('✅ Generated MoM successfully');
        console.log(`📊 Found ${parsed.decisions?.length || 0} decisions`);
        console.log(`📋 Found ${parsed.actionItems?.length || 0} action items`);

        return parsed;
    } catch (e) {
        console.error('Error parsing MoM response:', e);
        console.error('Raw response:', rawResponse.substring(0, 500));

        // Return fallback structure
        return {
            meetingTitle: input.meetingTitle || 'Team Meeting',
            date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
            duration: '1h',
            attendees: ['Team Member'],
            summary: 'Meeting minutes could not be fully generated. Please try again.',
            keyDiscussions: [],
            decisions: [],
            actionItems: [],
            termDefinitions: [],
        };
    }
}
