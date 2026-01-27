
# Ensuring AI Settings Reach the WebSocket Voice Gateway

## Problem Analysis

The current architecture has a **data flow gap** between your AI settings UI and the real-time voice gateway:

```text
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────────┐
│  AI Settings UI │────▶│  ai_profiles DB  │     │  Railway WebSocket GW   │
│  (Lovable)      │     │  (Supabase)      │     │  (OpenAI Realtime)      │
└─────────────────┘     └──────────────────┘     └─────────────────────────┘
                                  │                         ▲
                                  │                         │
                                  │   ??? How to connect ???│
                                  └─────────────────────────┘
```

**Current State:**
- AI settings (greeting, disclosure, system prompt, allowed actions, language) are saved to the `ai_profiles` table
- The WebSocket gateway URL only passes `company_id`: `wss://assistant-production-ef06.up.railway.app/twilio?company_id=xxx`
- The Railway gateway must independently fetch these settings to configure the OpenAI Realtime session

---

## Solution Architecture

### Option A: Gateway Fetches Settings Directly (Recommended)

The Railway WebSocket gateway needs to query Supabase at session start:

```text
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────────┐
│  Twilio Call    │────▶│  Supabase Edge   │────▶│  Railway WebSocket GW   │
│  Inbound        │     │  (TwiML Stream)  │     │  wss://...?company_id=x │
└─────────────────┘     └──────────────────┘     └─────────────────────────┘
                                                            │
                                                            ▼
                                                 ┌─────────────────────────┐
                                                 │  Gateway server.js:     │
                                                 │  1. On connection       │
                                                 │  2. Extract company_id  │
                                                 │  3. Fetch from Supabase │
                                                 │  4. Build system prompt │
                                                 │  5. Configure OpenAI    │
                                                 └─────────────────────────┘
```

### Option B: Create a Prompt-Builder API Endpoint

Create a new Edge Function that returns the compiled prompt and settings:

```text
┌─────────────────────────┐
│  Railway WebSocket GW   │
│  On new connection:     │
│  1. Call Edge Function  │──────▶ GET /functions/v1/get-ai-context?company_id=xxx
│  2. Get compiled prompt │◀────── { system_prompt, voice, language, ... }
│  3. Configure OpenAI    │
└─────────────────────────┘
```

---

## Implementation Plan

### Step 1: Create `get-ai-context` Edge Function

A new Edge Function that compiles all AI settings into a single response for the gateway:

**Endpoint:** `GET /functions/v1/get-ai-context?company_id=xxx`

**Response:**
```json
{
  "system_prompt": "Combined: core_prompt + ai_profiles.system_prompt",
  "greeting_script": "Hello! Thank you for calling...",
  "disclosure_script": "You are speaking with an AI...",
  "after_hours_script": "We are currently closed...",
  "voice": "alloy",
  "language": "en-US",
  "allowed_actions": { "faq": true, "booking": true, ... },
  "escalation_rules": { "escalateOnRequest": true, ... },
  "business_hours_text": "Mon-Fri: 9AM-5PM...",
  "knowledge_base": [
    { "question": "...", "answer": "..." }
  ],
  "company_name": "Acme Plumbing",
  "industry": "plumber"
}
```

### Step 2: Update Railway Gateway (server.js)

The Railway-hosted `server.js` needs this patch at session start:

```javascript
// In the WebSocket connection handler
wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, 'wss://localhost');
  const companyId = url.searchParams.get('company_id');
  
  // Fetch AI context from Supabase Edge Function
  const contextResponse = await fetch(
    `${SUPABASE_URL}/functions/v1/get-ai-context?company_id=${companyId}`,
    {
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );
  const aiContext = await contextResponse.json();
  
  // Configure OpenAI Realtime session with fetched settings
  openaiWs.send(JSON.stringify({
    type: 'session.update',
    session: {
      instructions: aiContext.system_prompt,
      voice: aiContext.voice || 'alloy',
      // ... other OpenAI Realtime settings
    }
  }));
});
```

### Step 3: Add Environment Variables to Railway

The Railway gateway needs:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_ANON_KEY` - For authenticated requests
- `OPENAI_API_KEY` - For OpenAI Realtime (already configured)

---

## Technical Details

### Data Fetched by get-ai-context:

| Source Table | Fields |
|--------------|--------|
| `platform_settings` | `core_prompt`, `core_prompt_version` |
| `ai_profiles` | `system_prompt`, `greeting_script`, `disclosure_script`, `after_hours_script`, `voice_id`, `language`, `allowed_actions_json`, `escalation_rules_json`, `disclosure_required` |
| `company_hours` | Formatted as human-readable text |
| `knowledge_base_items` | Active FAQs and policies |
| `companies` | `name`, `industry`, `timezone` |

### Prompt Assembly Order:
1. **Core Prompt** (platform-wide rules, immutable)
2. **Company System Prompt** (from `ai_profiles`)
3. **Business Hours Context** (formatted from `company_hours`)
4. **Knowledge Base** (FAQs and policies)
5. **Allowed Actions** (what the AI can/cannot do)

### Security:
- The Edge Function validates `company_id` as UUID
- Uses service role key internally but exposes minimal data
- No sensitive credentials in the response

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `supabase/functions/get-ai-context/index.ts` | **Create** - New endpoint for gateway |
| `supabase/config.toml` | **Edit** - Register new function |
| Railway `server.js` | **External** - Must be patched separately |

---

## Alternative: Pass Settings via URL (Not Recommended)

Encoding all settings in the WebSocket URL is **not recommended** because:
- URL length limits (~2000 chars)
- Settings change frequently
- Security concerns with exposing prompts in URLs
- Would require re-provisioning phone numbers to update settings

---

## Action Required

Since the Railway gateway is externally hosted, you have two options:

1. **If you control the Railway server:** I can provide the exact `server.js` patch code
2. **If you need the Edge Function first:** I'll create `get-ai-context` so the gateway can call it

Would you like me to proceed with creating the `get-ai-context` Edge Function?
