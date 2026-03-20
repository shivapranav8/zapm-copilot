import type { Request } from 'express';
import { jsonrepair } from 'jsonrepair';
import { callPlatformAI } from '../utils/platformAI';

export interface PRDUseCase {
    type: 'section' | 'usecase';
    sectionName?: string;   // only for type='section'
    sno?: string;
    useCase?: string;
    description?: string;
    pmNotes?: string;
}

export interface PRDErrorCase {
    errorCase: string;
    content: string; // "Title: ...\n\nContent: ...\n\nHelp doc link: NA\n\nVideo link: NA"
}

export interface PRDAffectedArea {
    module: string;
    subModule: string;
    areasAffected: string;
    dependency: string;
}

export interface PRDLimitation {
    limitation: string;
    comments: string;
}

export interface PRDSheetData {
    featureName: string;
    module: string;
    subModule: string;
    overview: {
        pmOwner: string;
        developers: string;
        uiOwner: string;
        qaMembers: string;
        documentationOwner: string;
    };
    useCases: PRDUseCase[];
    errorHandling: PRDErrorCase[];
    affectedAreas: PRDAffectedArea[];
    limitations: PRDLimitation[];
}

const SYSTEM_PROMPT = `You are a Senior Product Manager at Zoho Analytics writing a Functional Requirements Document (PRD/FRD).

You will receive either:
A) React/TypeScript source code — reverse-engineer EVERY feature, component, interaction, and edge case you can identify
B) A Marketing Requirements Document (MRD) — expand into a full, granular functional PRD

## MANDATORY RULES — ALL MUST BE FOLLOWED

### Rule 1: NO HALLUCINATION
- Overview fields (pmOwner, developers, uiOwner, qaMembers, documentationOwner) — ALWAYS leave as empty string ""
- Do NOT invent placeholder names. Do NOT use "TBD" — just leave as ""
- Only fill overview fields if explicitly stated in the input

### Rule 2: SCOPE — PRIMARY FEATURE ONLY
- Identify the PRIMARY feature being built. It is the main, named feature component — NOT the app shell, layout wrapper, navigation sidebar, header bar, utility helpers, or image fallback components.
- ONLY write use cases for the PRIMARY feature
- Do NOT write use cases for supporting infrastructure (navigation sidebar, app header, root layout, utility wrappers, icon components, etc.)
- If those components appear in the code, only mention them in UC 2.0 (Where triggered) or Affected Areas — not as their own use cases

### Rule 3: READ EVERY LINE OF CODE
1. Read EVERY component name, prop interface, TypeScript type, useState variable, event handler, button label, modal, conditional render
2. Extract the ACTUAL feature name from the primary component (e.g., <UserDashboard> → "User Dashboard", <InvoiceList> → "Invoice List")
3. Identify every user interaction: clicking buttons, filling forms, selecting dropdowns, drag-drop, search, toggle
4. Identify every data display: tables, charts, cards, lists, counters, badges, status indicators
5. Identify every modal/dialog: list ALL fields inside it (from state variables and form structure in the code)
6. Identify every conditional render: empty state, loading state, error state, success state, edit mode vs view mode

### Rule 3b: DESCRIPTION FORMAT — MANDATORY FOR ALL USE CASES
Every single UC description MUST be written in numbered step format from the USER'S perspective. No one-liners. No vague summaries.

**Required format — use \n wherever a line break is needed in the JSON string:**
"1. [Trigger]\n2. [System response]\n3. [Sub-step if needed — if listing items, use bullets on separate lines]\n4. End state: [What the user sees]\nNote: [Any constraint or open PM decision]"

Use \n:
- Between every numbered step
- Between a sentence and a bullet list that follows it
- Between individual bullet points
- Between any two logical chunks that should be visually separated

Never write all content as one run-on paragraph. Never omit \n just to save space.

**STRICT BAN — NEVER include these in any UC description:**
- React component names in angle brackets: NEVER write <AgentBuilderPage>, <ConfigurationPanel>, <Modal>, etc.
- CSS class names: NEVER write w-[500px], transition-all, border-gray-200, overflow-hidden, etc.
- State variable names: NEVER write isNewlyCreated, isPanelOpen, useState, useEffect, etc.
- Code observations: NEVER write "In the current code", "renders null", "return null", "the prop interface shows", etc.
- TypeScript syntax: NEVER write prop types, interface names, or camelCase variable names from the code

**Translate implementation → user-facing behavior:**
- isPanelOpen=true → "The configuration panel is visible on the right side"
- w-[500px] → "The panel expands to full width"
- isNewlyCreated=true → "When the agent is first created"
- transition-all duration-300 → "The panel animates open/closed"
- return null → "This panel is not yet implemented in this version"

**BAD** (rejected): "In AgentBuilderPage, the Configuration Panel starts expanded (w-[500px]) if isNewlyCreated=true. The panel's width transitions with CSS: transition-all duration-300."
**GOOD** (required): "1. When a user creates a new agent, the Configuration Panel on the right side opens automatically. 2. When a user opens an existing agent, the panel starts collapsed. 3. The user clicks the collapse/expand toggle in the panel header to show or hide it. 4. End state: The panel slides open or closed with a smooth animation. Note: Confirm whether the panel open/close state persists per agent or resets on every visit."

**BAD** (rejected): "Delete functionality not implemented in this version."
**GOOD** (required): "1. [If a Delete button/icon exists] User clicks the delete icon on the item. 2. A confirmation dialog appears asking the user to confirm deletion. 3. User clicks 'Delete' to confirm or 'Cancel' to abort. 4. End state: Item is removed from the list and a success toast is shown. Note: Delete is not implemented in this prototype — the expected behavior (confirmation copy, soft vs hard delete, recovery option) must be defined before implementation."

### Rule 4: MANDATORY USE CASE CHECKLIST
For the PRIMARY feature, you MUST generate a use case for EACH of the following — no exceptions:

**PRIMARY ENTITY LIFECYCLE — MANDATORY (most important section):**
First, identify the PRIMARY ENTITY of the feature — the main data object being managed (e.g., Metric, Report, Dashboard, Invoice, User, Task, Campaign).
Then generate a SEPARATE use case for EACH of these lifecycle operations:

- **List / View All**: How does the user see all items? What columns/fields are shown in the list? How is it sorted by default? What is the page size / pagination?
- **View Detail**: Can the user click into a single item to see its full details? What is shown on the detail view? Is it a page, drawer, or modal?
- **Create New**: Step-by-step flow — how does the user open the create form? What fields are in it (list ALL from the code)? Which are required? What is the success state (item appears in list, confirmation toast, redirect)? What is the failure state?
- **Edit / Update**: How does the user enter edit mode? What fields are editable (can ALL fields be edited, or only some)? Is it the same form as Create or different? Success state? Failure state?
- **Delete**: How does the user trigger delete? Is there a confirmation dialog — what does it say exactly? What happens after deletion (item removed from list, toast, undo option)? Can deleted items be recovered?
- **Duplicate / Clone** (if found in code): Step-by-step flow
- **Archive / Deactivate** (if found in code): Step-by-step flow, how does it differ from Delete?

For EACH lifecycle operation, also write a sub-case covering:
- What a restricted role (Viewer/Non-admin) sees when they encounter this action — hidden button? disabled? permission error message?

**Empty & Zero States (generate for EVERY list/section in the feature):**
- UC for: 0 items on first use (before any data exists)
- UC for: 0 results after filtering or searching
- UC for: specific sections that could be empty (e.g., "0 followed metrics")

**State Persistence (generate for EVERY toggle/preference):**
- For every view toggle (grid/list, show/hide, expand/collapse): is preference saved per user across sessions?
- For every toggle/bookmark/favourite/pin/follow action: is state persisted in backend or session-only?
- State on first use (default state before user sets any preference)

**Role & Permission (generate SEPARATE UCs — never use "may be restricted"):**
- UC for Admin/Owner: what they can do
- UC for Viewer/Non-admin: what they CANNOT do — is the button hidden, disabled, or shown with an error?
- NEVER write "edit may be restricted" — specify exactly which roles can and cannot perform each write action

**Modal/Form Specifications (for every dialog/modal found in code):**
- List every field in the modal (from the code's state variables and JSX)
- Specify which fields are required vs optional
- Specify validation rules (max chars, format, uniqueness check)
- Specify what happens on Save success vs Save failure

**Cross-Feature Interactions (generate for each):**
- Edit mode + navigation: if user is in edit/create mode and navigates away, is there a confirmation dialog or silent discard?
- New item creation + default state: is the newly created item auto-selected/followed/pinned, or does it start in default state?
- Counter/badge click: if there is a count/badge (e.g., "5 active", "3 pending"), clicking it — does it filter the list?
- Duplicate detection: if user creates/edits an item with the same name as an existing one, what happens?

**Loading States:**
- UC for initial data load: what shows while data is being fetched? (skeleton cards, spinner, nothing?)
- UC for action in progress: what shows while save/create/delete is processing?

### Rule 5: SECTION STRUCTURE
Use Cases must follow this exact section order:
1. Section: "Preamble" → UC 1.0 Objective, 2.0 Where triggered, 3.0 Who can do this (all roles explicitly)
2. Section: "[Entity Name] Lifecycle" → MANDATORY: one UC per lifecycle operation (List, View Detail, Create, Edit, Delete, + any others found in code). This section must always be present.
3. Section: **Context-aware title — choose based on input type:**
   - If the input is a **new feature** (no prior version exists, the MRD/code describes it as entirely new): use **"[Feature Name] Flows"** (e.g., "KPI Monitoring Flows", "Invoice Management Flows")
   - If the input is an **enhancement to an existing feature** (MRD says "we are adding X to existing Y", code shows incremental additions): use **"What's New"**
   - If the input is source code only with no MRD context: default to **"[Feature Name] Flows"**

   **How to detect new vs enhancement:**
   - MRD phrases like "new feature", "launching", "introducing" → new feature → use "[Feature Name] Flows"
   - MRD phrases like "adding", "improving", "enhancing existing", "new addition to [existing feature]" → enhancement → use "What's New"

   This section must cover ALL core feature flows from the code. MANDATORY RULE: Write a SEPARATE UC for EVERY distinct user interaction found in the primary feature code. Do NOT bundle multiple interactions into one UC. Do NOT skip any interaction.

   **This section must include a UC for each of these if found in the code:**
   - Every view toggle (grid view, list view, card view) — separate UC per toggle
   - Every AI feature (AI Insights button, AI Summary panel, AI recommendations) — separate UC per feature
   - Every section or panel with distinct behavior (Status Bar, Summary Panel, Filters panel) — separate UC per section
   - Every expand/collapse interaction (Advanced Analysis toggle, accordion sections) — separate UC per toggle
   - Every secondary action (Follow/Unfollow, Pin, Bookmark, Share) — separate UC per action
   - Every cancel/close flow — separate UC
   - Every search or filter interaction — separate UC
   - Anything the user can interact with in the primary feature that is NOT covered in the Lifecycle section

   **IMPORTANT**: A section with fewer than 5 UCs is almost always incomplete. If you're finding fewer than 5, re-read the code for interactions you may have missed.

4. Section: "Edge Cases" → MANDATORY: empty states, loading states, error states, permission variants, persistence, cross-feature interactions

### Rule 6: ERROR HANDLING — MINIMUM 5 ENTRIES
Always generate at least 5 error cases. Required entries:
1. Data fetch failure (network/API error loading the main view)
2. Save/update failure (when user saves an edit and it fails)
3. Create failure (when user creates a new item and it fails)
4. Permission error (when a restricted user tries a write action)
5. Any AI-specific failure if the feature has AI components (AI insights/summary failure)
Plus: any specific error found in the code (e.g., image load failure, form validation errors)

### Rule 7: AFFECTED AREAS — ONE ROW PER COMPONENT
Do NOT write one generic row. Write one row per component/area that QA must regression-test.
For each component found in the code, write a separate row specifying what to test.

### Rule 8: LIMITATIONS — MINIMUM 3 ENTRIES
Always document at least 3 things that are NOT in scope in this implementation, inferred from the code.
Examples: no real-time data, no export, no mobile support, no backend persistence (if UI-only prototype), hardcoded data.

## OUTPUT FORMAT

Respond ONLY with valid JSON:
{
  "featureName": "string — exact primary feature name",
  "module": "string — product area (infer from code)",
  "subModule": "string — sub-area if applicable",
  "overview": {
    "pmOwner": "",
    "developers": "",
    "uiOwner": "",
    "qaMembers": "",
    "documentationOwner": ""
  },
  "useCases": [
    { "type": "section", "sectionName": "Preamble" },
    {
      "type": "usecase",
      "sno": "1.0",
      "useCase": "Objective",
      "description": "What problem this feature solves and what the user can accomplish. Be specific to the code.",
      "pmNotes": ""
    },
    {
      "type": "usecase",
      "sno": "2.0",
      "useCase": "Where is it triggered?",
      "description": "List every UI entry point with exact navigation path in plain English. E.g.: 'User clicks [FeatureName] in the left navigation sidebar. The [Feature Name] page loads in the main content area.'",
      "pmNotes": ""
    },
    {
      "type": "usecase",
      "sno": "3.0",
      "useCase": "Who can do this?",
      "description": "Explicit per-role listing. State which roles can VIEW and which can perform WRITE actions (create, edit, delete). For restricted roles: state whether the action button is hidden, disabled, or shows a permission error. Never use 'may be restricted' — be explicit.",
      "pmNotes": "Validate exact role permissions with dev before implementation"
    },
    { "type": "section", "sectionName": "[Entity Name] Lifecycle" },
    {
      "type": "usecase",
      "sno": "4.0",
      "useCase": "List [Entities]",
      "description": "1. User navigates to [FeatureName]. 2. The [Feature Name] page loads in the main content area. 3. All [entities] are displayed in [grid/list/table] view. Each item shows: [list ALL fields visible in plain English]. 4. Default sort: [e.g., by creation date, alphabetical, status]. Pagination: [e.g., 20 per page / infinite scroll / no pagination — infer from code]. 5. End state: User sees all [entities] with action buttons [list buttons shown on each item].",
      "pmNotes": ""
    },
    {
      "type": "usecase",
      "sno": "5.0",
      "useCase": "View [Entity] Detail",
      "description": "1. User clicks on a [entity] card/row. 2. [Modal/Drawer/New page] opens showing the detail view. 3. Detail view displays: [list ALL fields shown — from code]. 4. User can [close modal via X button / navigate back via breadcrumb]. 5. End state: User sees full [entity] details. Note: [If no detail view exists in code, state: 'Detail view not implemented in this version — expected behavior TBD.']",
      "pmNotes": ""
    },
    {
      "type": "usecase",
      "sno": "6.0",
      "useCase": "Create New [Entity]",
      "description": "1. User clicks '[exact button label from code]' button. 2. [Modal/side pane/page] opens with the create form. 3. Form fields (from code state variables): [Field 1] (required), [Field 2] (required), [Field 3] (optional), [Field 4] (optional) — list ALL from code. 4. Validation: [e.g., Metric Name max 100 chars, must be unique]. 5. User clicks '[Save/Create button label]'. 6. Success: [entity] appears in the list, [toast message / redirect]. 7. Failure: [inline error message / toast with error text]. Note: If restricted role — the '[Create]' button is [hidden/disabled].",
      "pmNotes": ""
    },
    {
      "type": "usecase",
      "sno": "7.0",
      "useCase": "Edit [Entity]",
      "description": "1. User clicks the [edit icon / 'Edit' button] on a [entity]. 2. [Modal/inline edit/side pane] opens pre-populated with existing values. 3. Editable fields: [list which fields — some may be read-only in edit mode]. 4. User modifies values and clicks '[Save/Update button label]'. 5. Success: Changes reflected in the [entity] card/list, [toast message]. 6. Failure: [error message shown inline or as toast]. Note: Is the edit form the same as create form? [Yes/No, from code].",
      "pmNotes": ""
    },
    {
      "type": "usecase",
      "sno": "8.0",
      "useCase": "Delete [Entity]",
      "description": "1. User clicks the [delete icon / 'Delete' button] on a [entity]. 2. [If confirmation dialog in code]: A confirmation dialog appears with exact text: '[copy exact dialog text from code, or describe expected if not in code]'. 3. User confirms deletion. 4. Success: [entity] is removed from the list, [toast / no notification]. 5. Failure: Error message shown. 6. Recovery: [Is this a soft delete with undo? Hard delete? Can it be recovered from trash?]. Note: [If delete not in code]: Delete action is not implemented in this prototype — confirmation dialog copy, soft/hard delete behavior, and recovery must be defined.",
      "pmNotes": ""
    },
    { "type": "section", "sectionName": "[Feature Name] Flows OR What's New — choose based on Rule 5 context detection. E.g. 'KPI Monitoring Flows' for a new feature, 'What's New' for an enhancement." },
    {
      "type": "usecase",
      "sno": "9.0",
      "useCase": "USE EXACT INTERACTION NAME FROM CODE (e.g., 'Toggle Grid/List View', 'Generate AI Insights', 'View Status Bar')",
      "description": "1. [Trigger — what button/link the user clicks, in plain English]. 2. [What the user sees happen on screen — no component names, no CSS classes]. 3. [Any sub-steps]. 4. End state: [What the user sees after the action completes]. Note: [Any constraint, default value, or open decision for PM].",
      "pmNotes": ""
    },
    { "type": "section", "sectionName": "Edge Cases" }
    // continue with empty states, loading, errors, permission variants, persistence, cross-feature
  ],
  "errorHandling": [
    {
      "errorCase": "Data Fetch Failure",
      "content": "Title: Unable to load [Feature Name]\\n\\nContent: We couldn't load your data. Please check your connection and try again.\\n\\nHelp doc link: NA\\n\\nVideo link: NA"
    }
    // minimum 5 entries — see Rule 6
  ],
  "affectedAreas": [
    {
      "module": "string",
      "subModule": "string",
      "areasAffected": "string — one specific feature area per row (e.g., 'Agent Listing Page — list view, search, filters, create button')",
      "dependency": "string — specific regression tests QA must run"
    }
    // one row per component — see Rule 7
  ],
  "limitations": [
    {
      "limitation": "string — what is NOT built (infer from code: hardcoded data? no API calls? no mobile layout?)",
      "comments": "string — roadmap note"
    }
    // minimum 3 entries — see Rule 8
  ]
}`;

export async function runPRDGenerator(
    fileContent: string,
    fileName: string,
    sourceType: 'zip' | 'docx',
    zohoToken?: string,
    req?: Request
): Promise<PRDSheetData> {
    console.log(`🏗️  [PRD Generator] Analyzing: ${fileName} (${fileContent.length} chars, type=${sourceType})`);

    const sourceDesc = sourceType === 'zip'
        ? 'React/TypeScript source code extracted from a ZIP file'
        : 'Marketing Requirements Document (MRD) from a DOCX file';

    // Content already capped at 200K by the route-level extractor
    const contentSlice = fileContent;
    // Supporting call only needs enough to identify components/modules — first 60K is plenty
    const contentSummary = fileContent.slice(0, 60_000);

    const contextBlock = `Source type: ${sourceDesc}
File: ${fileName}

--- CONTENT START ---
${contentSlice}
--- CONTENT END ---`;

    const supportingContext = `Source type: ${sourceDesc}
File: ${fileName}

--- CONTENT START ---
${contentSummary}
--- CONTENT END ---`;

    // ── Call 1: Use Cases (sections + all UCs) ────────────────────────────────
    const useCasesPrompt = `${SYSTEM_PROMPT}

${contextBlock}

TASK: Generate ONLY the use cases portion. Return ONLY a valid JSON object with these fields:
{
  "featureName": "string",
  "module": "string",
  "subModule": "string",
  "overview": { "pmOwner": "", "developers": "", "uiOwner": "", "qaMembers": "", "documentationOwner": "" },
  "useCases": [ ...full use cases array following ALL rules above... ]
}
No errorHandling, affectedAreas, or limitations in this response.

IMPORTANT — UC COUNT: There is NO limit on the number of use cases. Generate as many as needed to cover EVERY interaction in the code. Do NOT stop early. Cover every lifecycle step, every role variant, every empty state, every loading state, every modal, every toggle, every filter, every cross-feature interaction.

IMPORTANT — FORMATTING: Use \\n wherever you want a line break in a description — between numbered steps, between a paragraph and a bullet list, between bullet points. Never write everything as one run-on paragraph. Examples:
- Between steps: "1. User clicks Save.\\n2. A confirmation dialog appears."
- Paragraph then bullets: "The form contains the following fields:\\n- Agent Name (required)\\n- Description (optional)\\n- Model (required)"
- Mixed: "1. User opens the schema panel.\\n2. The panel shows:\\n- A search bar\\n- A Select All checkbox\\n- A scrollable table list\\n3. User selects tables and clicks Deploy."`;

    // ── Call 2: Error Handling + Affected Areas + Limitations ─────────────────
    // Uses a shorter context slice — these sections don't need the full code
    const supportingPrompt = `You are a Senior PM at Zoho Analytics writing a PRD. Based on the source code below, generate ONLY the supporting sections.

${supportingContext}

Return ONLY valid JSON with these fields (no featureName, useCases, or overview):
{
  "errorHandling": [
    { "errorCase": "string", "content": "Title: ...\\n\\nContent: ...\\n\\nHelp doc link: NA\\n\\nVideo link: NA" }
  ],
  "affectedAreas": [
    { "module": "string", "subModule": "string", "areasAffected": "string", "dependency": "string" }
  ],
  "limitations": [
    { "limitation": "string", "comments": "string" }
  ]
}

Rules:
- errorHandling: minimum 5 entries (data fetch failure, save failure, create failure, permission error, + feature-specific errors)
- affectedAreas: one row per distinct component/area found in code
- limitations: minimum 3 entries (things NOT built — e.g. no real-time, no export, no mobile, prototype-only)`;

    console.log('🤖 [PRD Generator] Running 2 parallel PlatformAI calls...');
    const [rawUseCases, rawSupporting] = await Promise.all([
        callPlatformAI(useCasesPrompt, { temperature: 0.2, maxTokens: 16000, zohoToken, req }),
        callPlatformAI(supportingPrompt, { temperature: 0.2, zohoToken, req }),
    ]);
    console.log(`✅ [PRD Generator] Calls done. Lengths: ${rawUseCases.length} / ${rawSupporting.length}`);

    function parseJSON(raw: string, label: string): any {
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) { console.warn(`⚠️  [PRD] No JSON found in ${label}`); return {}; }
        try { return JSON.parse(match[0]); }
        catch {
            try {
                const r = JSON.parse(jsonrepair(match[0]));
                console.log(`⚠️  [PRD] Used jsonrepair for ${label}`);
                return r;
            } catch (e) { console.error(`❌ [PRD] Parse failed for ${label}:`, (e as Error).message); return {}; }
        }
    }

    const part1 = parseJSON(rawUseCases, 'useCases');
    const part2 = parseJSON(rawSupporting, 'supporting');

    const parsed: PRDSheetData = {
        featureName: part1.featureName || fileName,
        module: part1.module || '',
        subModule: part1.subModule || '',
        overview: part1.overview || { pmOwner: '', developers: '', uiOwner: '', qaMembers: '', documentationOwner: '' },
        useCases: part1.useCases || [],
        errorHandling: part2.errorHandling || [],
        affectedAreas: part2.affectedAreas || [],
        limitations: part2.limitations || [],
    };

    console.log(`✅ [PRD Generator] Parsed PRD: ${parsed.featureName}, ${parsed.useCases.length} use cases, ${parsed.errorHandling.length} errors`);
    return parsed;
}
