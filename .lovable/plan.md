

# Update Railway WebSocket Gateway URL

## Change Required

Update the voice gateway URL in the Twilio inbound function to point to your new Railway deployment.

## File to Modify

**`supabase/functions/twilio-voice-inbound/index.ts`** (Line 665)

## Current Code

```typescript
const voiceGatewayUrl = `wss://assistant-production-ef06.up.railway.app/twilio?company_id=${companyIdForUrls}&token=${voiceGatewayToken}`;
```

## Updated Code

```typescript
const voiceGatewayUrl = `wss://shimmering-caring-production.up.railway.app/twilio?company_id=${companyIdForUrls}&token=${voiceGatewayToken}`;
```

## Technical Details

- This is a single-line change on line 665
- The WebSocket protocol (`wss://`) and path (`/twilio`) remain the same
- Query parameters (`company_id`, `token`) continue to be passed as before
- The Edge Function will automatically redeploy with the new URL

## Impact

After this change:
- All inbound Twilio calls will stream to your new Railway gateway
- The gateway should call `GET /functions/v1/get-ai-context?company_id=xxx` to fetch AI settings
- OpenAI Realtime sessions will be configured with company-specific prompts, voice, and tools

