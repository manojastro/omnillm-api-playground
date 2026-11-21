# OmniLLM — Universal LLM API Playground

OmniLLM combines a ChatGPT-style conversation, an LLM playground, a Postman-like request builder, a raw traffic inspector, and side-by-side provider comparison in one application.

> Any endpoint. Any model. One playground.

## What works

- Chat with the built-in Mock LLM without a key.
- Configure OpenAI, Anthropic, Gemini, OpenAI-compatible, local, and custom APIs.
- Enter any model ID; preset model names are suggestions, not restrictions.
- Build a custom request with POST, GET, or PUT; bearer, key-header, query, basic, custom-header, or no authentication; unlimited headers and query parameters; and a raw JSON template.
- Substitute `{{API_KEY}}`, `{{MODEL}}`, `{{PROMPT}}`, `{{SYSTEM_PROMPT}}`, `{{MESSAGES}}`, and `{{CONVERSATION}}` safely after JSON parsing.
- Extract provider text through a configured JSON path or automatic response detection. Unknown shapes fall back to formatted raw JSON.
- Stream supported SSE responses and stop generation.
- Inspect the redacted request, filtered response headers, raw response, latency, TTFT, token usage, and generated cURL, JavaScript, and Python examples.
- Compare up to four provider configurations concurrently.
- Save provider profiles and request history without API keys, search history, export responses, and view an activity dashboard.
- Use Direct / Local mode for browser-accessible localhost servers such as Ollama and LM Studio.

## Architecture

The UI uses React, TypeScript, Tailwind, shadcn primitives, Zustand, and the Next-compatible Vinext runtime. Cloudflare Workers execute route handlers, and D1 stores provider profiles, redacted request history, and rate-limit counters.

The adapter boundary lives under `lib/llm/`:

- `buildProviderRequest` translates the normalized `ChatMessage[]` format into provider requests.
- `extractText` and `extractUsage` normalize known and custom response shapes.
- `extractStreamDelta` handles common OpenAI, Anthropic, Gemini, and generic SSE token events.
- UI components depend only on normalized requests and responses, so compatible aliases reuse adapters instead of duplicating provider logic.

Primary routes:

- `/` — chat playground and traffic inspector
- `/compare` — parallel provider comparison
- `/history` — searchable request history
- `/providers` — presets, profiles, import/export, and no-code provider builder
- `/dashboard` — real request health and usage metrics
- `/settings` — appearance, request defaults, privacy, export, and deletion

## Local development

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

The site starts at `http://localhost:3000`.

Build and run the production Worker locally:

```bash
npm run build
npm start
```

Generate a migration after changing `db/schema.ts`:

```bash
npm run db:generate
```

## Custom API example

For an unfamiliar endpoint with `X-API-Key` authentication and a response at `result.answer`:

1. Select **Custom API**.
2. Enter the endpoint and any model ID.
3. Select **API key header** and set the header to `X-API-Key`.
4. Use this request template:

```json
{
  "model": "{{MODEL}}",
  "prompt": "{{PROMPT}}"
}
```

5. Set the response path to `result.answer` and send a prompt.

No code change is required. Template variables are replaced structurally, and JSON paths are parsed without `eval`.

## API keys and security

API keys are held in client memory, sent only for the current request, and excluded from profiles, history, exports, generated masked code, analytics, and application logs. The hosted proxy requires HTTPS, rejects URL credentials and unsafe headers, blocks obvious loopback/private/link-local/internal destinations, validates each redirect, forbids cross-host redirects, caps request/response sizes, enforces timeouts and per-client limits, sanitizes upstream errors, and filters returned headers.

Direct / Local mode sends requests from the browser. It is intended for trusted localhost APIs and HTTPS endpoints, depends on the provider's CORS policy, and exposes the credential to that endpoint by design.

No `.env` file is committed. `.env.example` contains only a public-origin placeholder.

## Adding a provider

Most providers need only a preset that points to an existing adapter. Add the preset in `lib/llm/defaults.ts`, keeping the endpoint, authentication, request mode, and response path editable. Add a new adapter behavior in `lib/llm/adapters.ts` only when the provider's request or stream shape is genuinely different.

Users can also define providers from `/providers` without editing code.

## Docker

```bash
docker compose up -d --build
```

The container serves OmniLLM on `http://localhost:3000`.

## Testing and validation

The build compiles the strict TypeScript project and produces a Cloudflare Worker. Adapter, transformation, error, response-path, security, and streaming logic are designed as small deterministic modules so they can be exercised independently. Run the production build before deploying:

```bash
npm run build
```

## Deployment

This repository is configured for OpenAI Sites. Sites owns the production D1 database, applies the generated Drizzle migrations, packages the Worker output, and publishes saved versions to the deployed URL.

