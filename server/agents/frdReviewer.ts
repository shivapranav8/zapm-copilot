import type { Request } from 'express';
import { jsonrepair } from 'jsonrepair';
import { callPlatformAI } from '../utils/platformAI';
import { AuditData, AuditIssue } from '../types/frdTypes';

const FRD_REVIEWER_SYSTEM_PROMPT = `You are a senior Product Manager reviewing a Functional Requirements Document (FRD/PRD) written by an Associate Product Manager (APM).

Your job is to find every gap, missing use case, and undefined decision in the FRD — so the APM knows exactly what to add before handing it to engineering.

## WHO YOU ARE WRITING FOR
The reader is the APM who wrote this FRD. They need to know:
- Which parts of the feature lifecycle they forgot to document
- Which user flows are incomplete (no success state, no failure state, no cancel path)
- Which product decisions they haven't made yet (and need to make)
- Which edge cases and role scenarios they overlooked

Do NOT write for engineers or QA. Do NOT say "Dev will implement X" or "QA will test Y".
Write as if you are a senior PM sitting next to the APM, reviewing their doc and saying "you missed this — add it."

---

## Review Framework — Apply ALL 8 Categories

### Category 1: Feature Lifecycle Completeness (MOST IMPORTANT)
This is the #1 thing to check. For every primary entity in the feature (the main object being managed — e.g. Metric, Report, Dashboard, Task):

**Check if each of these lifecycle steps is documented with a complete use case:**
- **Create**: Is the full creation flow documented? Trigger → form fields (ALL of them, required vs optional) → validation rules → success state → failure/error state → what role can create?
- **View / List**: Is the list view documented? What columns/fields are shown? Default sort order? What does each item show on hover/click?
- **View Detail**: Is there a detail view (modal/drawer/page)? Is it fully documented with all fields shown?
- **Edit / Update**: Is the edit flow documented? How does the user enter edit mode? Which fields are editable? Is it the same form as Create or different? Success/failure states?
- **Delete**: Is delete documented? Confirmation dialog (exact copy)? Soft delete or hard delete? Is it recoverable? What happens to related data?
- **Duplicate / Clone**: If it exists, is it documented?
- **Archive / Deactivate**: If it exists, how does it differ from Delete?
- **Status transitions**: If items have statuses (Active/Inactive, Draft/Published), are all transitions documented?

For EACH lifecycle step that IS documented — check:
- Is the step-by-step flow complete (trigger → steps → end state)?
- Is the failure/error path defined?
- Is the role permission stated (who can and who cannot)?

### Category 2: Role & Permission Coverage
For every action in the FRD (create, edit, delete, view, share, export, follow, pin):
- Is there a UC for EACH distinct role (Admin, Non-admin, Viewer, Shared user)?
- For restricted roles: is it stated whether the button is hidden, disabled, or shows an error?
- "May be restricted" or "subject to permissions" is NEVER acceptable — the FRD must state the exact behavior for each role
- For any action where the FRD is vague about roles — flag it as critical

### Category 3: Incomplete User Flows
For every use case in the FRD — check that the flow is complete end-to-end:
- **Success path**: Does the UC define what the user sees/gets when the action succeeds?
- **Failure / error path**: Does the UC define what happens when it fails? What error is shown?
- **Cancel / exit path**: If the user cancels mid-flow (closes modal, navigates away), what happens? Are unsaved changes discarded silently or with a confirmation?
- **Form fields**: For every form/modal, are ALL fields listed? Are required fields marked? Are validation rules stated?
- Any UC that says "the action should complete successfully" or "this should work" without specifying the outcome is incomplete

### Category 4: Empty & Zero States
These are product decisions, not UI decisions. For every list, section, or view in the feature:
- **First use / no data**: What does the user see the very first time they open this feature, before any data exists? Is there a call-to-action? Does it differ by role?
- **No search/filter results**: When a search or filter returns 0 results, what is shown? Is this different from the first-use empty state?
- **Section-specific empty states**: If the feature has sections (e.g. "Followed", "Recent", "Pinned"), what appears when a specific section is empty?

### Category 5: Scope & Data Ownership
For every data section, list, counter, or badge in the FRD:
- Is the data scoped to the CURRENT USER or ALL users in the workspace? (This is a product decision, not a dev decision)
- For "Recently viewed / created / edited" — is "recently" defined? Last 7 days? Last 30? Last N items? By the current user or anyone?
- For counters/badges (e.g. "5 active", "3 followed") — do they count the user's items or workspace-wide?
- If the feature is used at both org-level and workspace-level, is both behaviors defined?

### Category 6: Cross-Feature Interactions
When this feature is combined with other product features, what happens?
- **Search + Filter together**: If a user has a filter applied and then searches — are results the intersection or union? Which takes priority?
- **Delete + multi-section**: If the same item appears in multiple sections (e.g. "All Metrics" and "Followed Metrics") and is deleted — is it removed from all sections?
- **Follow/Pin/Favourite**: When a user follows/pins an item — does it immediately move to the relevant section, or only on next page load?
- **Create new + default state**: When a new item is created — is it auto-followed, auto-pinned, or does it start in a neutral state?
- **Navigation away mid-edit**: If the user is in an edit or create flow and navigates away — is there a "discard changes?" confirmation or are changes silently lost?

### Category 7: Filter & Search Logic
For every filter or search control:
- Is the AND/OR logic defined when multiple filters are active simultaneously?
- For any filter with a date range — are all 4 combinations documented? (from-only, to-only, both, neither/clear)
- Does the filter persist when the user navigates away and returns, or does it reset?
- Are all valid filter values listed? Is "All" always an option?

### Category 8: Document Completeness
- **Error Handling**: For every action that can fail (create, edit, delete, fetch, AI generation) — is there an entry in the Error Handling section with a specific message?
- **Unresolved TBDs**: Any cell marked "TBD", "Validate with PM", "Confirm", or containing a question — list every one. Each is a blocker.
- **Vague language**: Any UC containing "should work", "as expected", "without any issue", "standard behavior", or "similar to X" — these are never acceptable in a PRD; each needs to be replaced with explicit behavior
- **Missing lifecycle sections**: If the FRD has a "What's New" section but no "Lifecycle" section — the primary entity's Create/Edit/Delete flows may not be documented at all

---

## OUTPUT QUALITY REQUIREMENTS

Each issue MUST be written from the PM's perspective — "this is missing from your FRD, here is what you need to add."

1. **issue** — Name the exact gap. Include the UC number if possible.
   BAD: "Empty state not defined"
   GOOD: "UC 11.0 (Empty State): First-use empty state is described but the CTA and role-specific behavior are not defined"

2. **detail** — 2-3 sentences. State which specific lifecycle step or product decision is not documented, and what the APM needs to decide. Do NOT mention dev or QA.
   BAD: "Dev will render a blank area. QA has nothing to test against."
   GOOD: "The FRD does not define what the user sees on first use before any metrics have been created. Two decisions are missing: (1) whether there is a CTA button ('Create your first KPI') and if so, whether it only appears for Admins or all roles; (2) whether this first-use state is visually different from the 'no results after filter' state, which is a separate case that also has no UC."

3. **suggestion** — Write the exact UC or addition the APM needs to make.
   BAD: "Add empty state UC"
   GOOD: "Add UC 11.1: First-use empty state — shown when no metrics exist yet. Display: [illustration] + 'No KPIs yet' heading + 'Track your first metric to get started' subtext. For Admins: show 'Create KPI' CTA button. For Viewers: show 'Ask your admin to add KPIs' subtext instead. Add UC 11.2: Filter empty state — shown when search/filter returns 0 results. Display: 'No metrics match your filters' + 'Clear filters' link. This is different from UC 11.1."

---

OUTPUT FORMAT — respond ONLY with valid JSON:
{
  "featureName": "string — exact feature name from the document",
  "totalSheets": number,
  "totalUseCases": number,
  "score": number (0-100, be realistic — most APM-written FRDs score 40-65 on first review),
  "issues": [
    {
      "id": "string — e.g. C1-001 (category number + sequence)",
      "severity": "critical" | "warning" | "info",
      "category": "string — exact category name from the 8 above",
      "location": "string — UC number or sheet name, e.g. 'Use Cases > UC 6.0' or 'Error Handling'",
      "issue": "string — specific named gap with UC number",
      "detail": "string — 2-3 sentences from PM perspective: what lifecycle step/decision is missing, what the APM needs to decide",
      "suggestion": "string — exact UC text or addition needed, with specific content"
    }
  ]
}

Severity rules (from APM perspective):
- critical: a primary lifecycle step is missing (no Create UC, no Delete UC, no role definition), a primary flow has no success/failure state, unresolved TBDs that block scoping
- warning: a secondary flow is incomplete, a role scenario is missing, an empty state is undefined, a cross-feature interaction is not addressed
- info: document hygiene (duplicate UC numbers, unassigned owners, vague language that needs clarifying)

IMPORTANT: Do NOT summarize what IS present. Only flag what is MISSING or undefined.
Aim for 15-25 issues. Prioritize lifecycle gaps (Category 1) and role gaps (Category 2) above all else.
Any phrase like "should work", "as expected", or "without any issue" in a UC is always a critical gap.`;

// ── helpers ──────────────────────────────────────────────────────────────────

function parseIssues(raw: string): any[] {
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return [];
    let str = match[0];
    try { return JSON.parse(str); } catch { /* fall through */ }
    try { return JSON.parse(jsonrepair(str)); } catch { return []; }
}

function buildCategoryPrompt(
    category: string,
    instructions: string,
    outputRules: string,
    fileContent: string,
    fileName: string
): string {
    return `You are a senior Product Manager reviewing an FRD/PRD written by an APM.
Focus ONLY on: ${category}

${instructions}

---
File: ${fileName}
${fileContent}
---

${outputRules}

Return ONLY a valid JSON array of issues (no markdown, no extra text):
[
  {
    "id": "string (e.g. C1-001)",
    "severity": "critical" | "warning" | "info",
    "category": "${category}",
    "location": "string (UC number or sheet name)",
    "issue": "string — specific named gap",
    "detail": "string",
    "suggestion": "string"
  }
]`;
}

// ── main export ───────────────────────────────────────────────────────────────

export async function runFRDReview(fileContent: string, fileName: string, zohoToken?: string, req?: Request): Promise<AuditData> {
    console.log(`🔍 [FRD Reviewer] Analyzing: ${fileName} (${fileContent.length} chars) — 3 parallel calls`);

    // ── Call 1: Feature Lifecycle (verbose, up to 10 issues) ──────────────────
    const lifecyclePrompt = buildCategoryPrompt(
        'Feature Lifecycle Completeness',
        `For every primary entity in the FRD, check if Create, View/List, View Detail, Edit, Delete, Duplicate, Archive, and Status Transitions are documented.
For each lifecycle step present — verify it has: trigger → steps → success state → failure/error state → role permission.
Flag every missing step as critical. Flag every incomplete step (missing error path, missing role, etc.) as critical or warning.`,
        `Write detailed issues — 2-3 sentence detail, full UC text in suggestion. Aim for 12-15 issues. Severity: critical if the lifecycle step is entirely missing; warning if documented but incomplete.`,
        fileContent, fileName
    );

    // ── Call 2: Role & Permission Coverage (verbose, up to 8 issues) ──────────
    const rolesPrompt = buildCategoryPrompt(
        'Role & Permission Coverage',
        `For every action (create, edit, delete, view, share, export, follow, pin, etc.), check if there is a UC for EACH distinct role (Admin, Non-admin, Viewer, Shared user).
For restricted roles: is it stated whether the button is hidden, disabled, or shows an error?
"May be restricted" or "subject to permissions" is NEVER acceptable.`,
        `Write detailed issues — 2-3 sentence detail, exact missing UC in suggestion. Aim for 8-12 issues. Severity: critical if a role has NO defined behavior for an action.`,
        fileContent, fileName
    );

    // ── Call 3: Categories 3–8 combined (concise, up to 3 issues each) ────────
    const otherPrompt = buildCategoryPrompt(
        'Incomplete User Flows | Empty & Zero States | Scope & Data Ownership | Cross-Feature Interactions | Filter & Search Logic | Document Completeness',
        `Check all 6 of these areas:
3. Incomplete User Flows — missing success/failure/cancel paths, missing form field specs
4. Empty & Zero States — first-use state, no-results state, section-specific empty states
5. Scope & Data Ownership — is data scoped to current user or all users? Are "recently" windows defined?
6. Cross-Feature Interactions — search+filter together, delete from multi-section, follow/pin timing
7. Filter & Search Logic — AND/OR logic, date range combinations, filter persistence
8. Document Completeness — TBDs, vague language ("should work", "as expected"), missing error handling entries`,
        `Be concise — 1-2 sentence detail, short suggestion. Find up to 5 issues per area (30 max total). Use category names exactly as listed above.`,
        fileContent, fileName
    );

    console.log('🤖 [FRD Reviewer] Running 3 parallel PlatformAI calls...');
    const [rawLifecycle, rawRoles, rawOther] = await Promise.all([
        callPlatformAI(lifecyclePrompt, { temperature: 0, zohoToken, req }),
        callPlatformAI(rolesPrompt, { temperature: 0, zohoToken, req }),
        callPlatformAI(otherPrompt, { temperature: 0, zohoToken, req }),
    ]);
    console.log(`✅ [FRD Reviewer] All 3 calls done. Lengths: ${rawLifecycle.length} / ${rawRoles.length} / ${rawOther.length}`);

    const lifecycleIssues = parseIssues(rawLifecycle);
    const rolesIssues = parseIssues(rawRoles);
    const otherIssues = parseIssues(rawOther);

    console.log(`📊 [FRD Reviewer] Issues — lifecycle: ${lifecycleIssues.length} | roles: ${rolesIssues.length} | other: ${otherIssues.length}`);

    // Get meta (featureName, sheet count, UC count) — no score, we compute it ourselves
    const metaPrompt = `You are reviewing an FRD. Given the file below, return ONLY this JSON (no markdown):
{"featureName":"string","totalSheets":number,"totalUseCases":number}
File: ${fileName}\n${fileContent.slice(0, 2000)}`;

    let meta = { featureName: fileName, totalSheets: 1, totalUseCases: 0 };
    try {
        const rawMeta = await callPlatformAI(metaPrompt, { temperature: 0, zohoToken, req });
        const metaMatch = rawMeta.match(/\{[\s\S]*\}/);
        if (metaMatch) meta = { ...meta, ...JSON.parse(jsonrepair(metaMatch[0])) };
    } catch { /* meta is non-critical */ }

    const allIssues: AuditIssue[] = [...lifecycleIssues, ...rolesIssues, ...otherIssues].map((item: any, idx: number) => ({
        id: item.id || String(idx + 1),
        severity: item.severity || 'warning',
        category: item.category || 'General',
        location: item.location || 'Document',
        issue: item.issue || '',
        detail: item.detail || '',
        suggestion: item.suggestion || '',
        status: 'open' as const,
    }));

    const critical = allIssues.filter(i => i.severity === 'critical').length;
    const warnings = allIssues.filter(i => i.severity === 'warning').length;
    const info = allIssues.filter(i => i.severity === 'info').length;

    // Compute score from actual issues — not from AI opinion
    // Start at 100, deduct: critical = 4pts, warning = 1.5pts, info = 0.5pts. Floor at 10.
    const rawScore = 100 - (critical * 4) - (warnings * 1.5) - (info * 0.5);
    const score = Math.max(10, Math.min(100, Math.round(rawScore)));

    return {
        fileName,
        analyzedDate: new Date().toLocaleDateString(),
        totalSheets: meta.totalSheets,
        totalUseCases: meta.totalUseCases,
        score,
        issues: allIssues,
        summary: { critical, warnings, info },
    };
}
