# Integrating Zoho PlatformAI into a Web App
### Step-by-step guide based on ZAPM Co-pilot integration (March 2026)

---

## Overview

Zoho PlatformAI allows internal Zoho apps to call AI models (OpenAI GPT, Anthropic Claude) via a unified API without managing individual vendor API keys. This guide documents exactly how we got it working — including all the dead ends — so you don't repeat the same debugging.

---

## Step 1: Create a PlatformAI Portal

1. Go to the Zoho PlatformAI console (internal)
2. Create a new portal — choose **Keyless Portal** (no API key required for users)
3. Note your **Portal ID** (e.g., `ZAPM`)

> A keyless portal means individual users authenticate with their own Zoho OAuth token — no shared API key needed.

---

## Step 2: Set Up Zoho OAuth (User-level Auth)

PlatformAI uses **per-user OAuth tokens** — each user must log in with their own Zoho account.

### 2a. Register an OAuth App
1. Go to [https://api-console.zoho.in/](https://api-console.zoho.in/)
2. Create a **Web Based Application**
3. Set Authorized Redirect URI (e.g., `https://yourapp.com/api/auth/callback`)
4. Copy **Client ID** and **Client Secret**

### 2b. Request the PlatformAI Scope
Add `PlatformAI.organizations.all` to your OAuth scope list.

```

### 2c. Implement OAuth Flow
Standard Zoho OAuth 2.0 authorization code flow:

```
GET https://accounts.zoho.in/oauth/v2/auth
  ?response_type=code
  &client_id=YOUR_CLIENT_ID
  &scope=PlatformAI.organizations.all,...
  &redirect_uri=YOUR_REDIRECT_URI
  &access_type=offline
  &prompt=consent
```

Exchange code for token at:
```
POST https://accounts.zoho.in/oauth/v2/token
```

Store `access_token` and `refresh_token` in the user's session.

---

## Step 3: Make PlatformAI API Calls

### Endpoint
```
POST https://platformai.zoho.in/internalapi/v2/ai/chat
```

> **Why `/internalapi/...`?**
> The docs say: *"append the `/internalapi` prefix to the URL."*
> The non-prefixed `/v2/ai/chat` requires additional `service` and `service_org_id` headers that are service-specific. The `/internalapi` version works with just the portal ID for keyless portals.

### Headers
```http
Content-Type: application/json
portal_id: ZAPM
Authorization: Zoho-oauthtoken {user_access_token}
```

> Only these 3 headers are needed. No `service`, `service_org_id`, or any other headers required for keyless portals.

### Request Body
```json
{
  "messages": [
    { "role": "user", "content": "Your prompt here" }
  ],
  "model": "claude-sonnet-4-6",
  "ai_vendor": "anthropic"
}
```

### Response Shape
```json
{
  "data": {
    "results": ["AI response text here"],
    "model": "claude-sonnet-4-6",
    "usage": {
      "zoho_total_credits": 0.19,
      "ai_stats": { "total_tokens": 20, "input_tokens": 11, "output_tokens": 9 }
    }
  }
}
```

Extract the response text from: `response.data.data.results[0]`

---

## Step 4: Available Models (Tested)

| Model | Vendor | Status |
|---|---|---|
| `claude-sonnet-4-6` | `anthropic` | ✅ Works — **recommended** |
| `gpt-4o` | `openai` | ✅ Works |
| `claude-3-haiku-20240307` | `anthropic` | ✅ Works |
| `claude-3-5-sonnet-20241022` | `anthropic` | ❌ Not supported for this endpoint |
| `claude-sonnet-4-5` | `anthropic` | ❌ Invalid model param |

> To use OpenAI models, set `"ai_vendor": "openai"` and `"model": "gpt-4o"`.

---

## Step 5: Node.js / TypeScript Wrapper

```typescript
// server/utils/platformAI.ts

const PLATFORM_AI_BASE = 'https://platformai.zoho.in/internalapi/v2/ai/chat';
const PORTAL_ID = process.env.ZOHO_PLATFORM_AI_PORTAL_ID || 'ZAPM';

export async function callPlatformAI(
    prompt: string,
    options: {
        model?: string;
        ai_vendor?: string;
        zohoToken?: string;
    } = {}
): Promise<string> {
    const { model = 'claude-sonnet-4-6', ai_vendor = 'anthropic', zohoToken } = options;

    if (!zohoToken) {
        throw new Error('zohoToken is required — user must be logged in with Zoho');
    }

    const res = await fetch(PLATFORM_AI_BASE, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'portal_id': PORTAL_ID,
            'Authorization': `Zoho-oauthtoken ${zohoToken}`,
        },
        body: JSON.stringify({
            messages: [{ role: 'user', content: prompt }],
            model,
            ai_vendor,
        }),
    });

    const data = await res.json() as any;

    if (!res.ok) {
        throw new Error(`PlatformAI error ${res.status}: ${data?.error?.message}`);
    }

    return data?.data?.results?.[0];
}
```

Pass the user's OAuth token from their session on every call:
```typescript
const zohoToken = req.session.zoho?.accessToken;
const result = await callPlatformAI(prompt, { zohoToken });
```

---

## Step 6: Handle Token Limits on Responses

PlatformAI has an output token limit (~2,500–3,000 tokens / ~10–12KB of text). If your AI call generates long structured JSON (e.g., a PRD with 30+ use cases), the response will be **silently truncated**, resulting in broken JSON.

### Fix 1 — Use `jsonrepair` for truncated JSON
```bash
npm install jsonrepair
```
```typescript
import { jsonrepair } from 'jsonrepair';

try {
    parsed = JSON.parse(raw);
} catch {
    parsed = JSON.parse(jsonrepair(raw)); // fixes truncated/malformed JSON
}
```

### Fix 2 — Split large outputs across parallel calls
Instead of one call that generates a 20KB JSON response, split by section:

```typescript
const [part1, part2] = await Promise.all([
    callPlatformAI(promptForUseCases, { zohoToken }),
    callPlatformAI(promptForErrorsAndLimitations, { zohoToken }),
]);
// merge results
```

---

## What We Tried That Didn't Work

| Approach | Error | Reason |
|---|---|---|
| `/v2/ai/chat` (no prefix) | `service_org_id is missing` | Requires service-specific headers not needed for keyless portals |
| `/v2/ai/chat` + `service_org_id` | 500 `Oops! Something went wrong` | Portal not configured for this endpoint |
| `/internalapi/v2/ai/rephrase` | Works but is meant for rephrasing | Use `/internalapi/v2/ai/chat` instead |
| `claude-3-5-sonnet-20241022` | `Model is not supported` | Not enabled for chat endpoint on this portal |
| Wrong scope `ZohoPlatformAI.apis.ALL` | Scope not found | Internal scope name is `PlatformAI.organizations.all` |
| IAM ticket via `accounts.zoho.in/user/iamticket` | Returned HTML | Wrong URL; OAuth token works fine |

---

## Environment Variables

```env
ZOHO_CLIENT_ID=your_zoho_oauth_client_id
ZOHO_CLIENT_SECRET=your_zoho_oauth_client_secret
ZOHO_REDIRECT_URI=https://yourapp.com/api/auth/callback
ZOHO_PLATFORM_AI_PORTAL_ID=ZAPM
```

---

## Summary

1. Create a keyless PlatformAI portal → get your Portal ID
2. Register a Zoho OAuth app → add `PlatformAI.organizations.all` scope (needs whitelisting)
3. Each user logs in with their Zoho account → store their `access_token` in session
4. Call `POST https://platformai.zoho.in/internalapi/v2/ai/chat` with `portal_id` header + `Authorization: Zoho-oauthtoken {token}`
5. Use `claude-sonnet-4-6` + `ai_vendor: anthropic` as the default model
6. Handle output token limits with `jsonrepair` and/or parallel split calls
