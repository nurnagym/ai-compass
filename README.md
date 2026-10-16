# AI Compass

A Russian-first, session-only AI discovery experience. A short open introduction and adaptive interactions become up to three useful tool discoveries, each with evidence, a practical first action, and an official product link. No accounts, database, or saved personal profile.

## Start locally

Requires **Node 22.12+** (Node 24 tested) and npm. Use this checkout directly; cloud tasks are already isolated and do not need a Git worktree.

```bash
npm ci
npm run dev
```

Open the address printed by Vite in your own browser. Demo mode is the default: it needs no API key and makes no paid API calls. Start with one required open answer about a task you want to simplify. After that, the director selects relevant interaction formats; ready-made choices and optional text/voice remain available. Demo responses use keyword-based simulation, **not a real AI director**. Answers are sent to the same-origin Worker for in-memory processing, not to OpenAI. The development-only component gallery is available using the footer or `/#gallery`; it is excluded from production.

In the restricted cloud workspace, use writable tool paths:

```bash
export npm_config_cache=/tmp/ai-compass-npm
export XDG_CONFIG_HOME=/tmp/ai-compass-config
npm ci
npm run dev -- --port 5173
```

## One open introduction, then the adaptive engine

The first question is always **VoiceTextQuestion**: «Какую задачу вы хотели бы упростить?» One short phrase is enough. This first answer is required: Continue is disabled for empty/whitespace input, there is no Skip action, and both the session state machine and backend reject a skipped or non-open introduction. No director request is made until the user submits that answer. With transcription configured, users can record and edit their first answer before submitting it.

After the introduction, the engine chooses relevant questions and formats based on that answer. Demo mode uses curated rules; live mode uses the existing OpenAI Responses integration. Both retain safeguards against long interviews and consecutive open questions, introduce swipes early, check practical constraints, and terminate within seven interactions. The live director can select all six component types, including one additional short open clarification when useful. It does not return to three mandatory open questions. Back/restart always restore the same required open introduction.

Single-selection cards advance immediately. Multiple-selection cards still require Continue. On closed questions users can switch to editable text/voice and back to choices without losing their draft. Every actual answer retains evidence provenance; unselected options are never evidence.

Each question has a **20-second timebox**, configurable through `ANSWER_SECONDS` in `src/hooks/useAnswerTimer.ts`. Users can add 20 seconds or disable time limits for the session. It pauses for hidden tabs, the privacy dialog, microphone permission, recording and transcription. New swipe cards receive a fresh budget. Expiry preserves the answer and shows a gentle prompt; it never submits an unconfirmed answer or skips the mandatory introduction.

In demo mode the server extracts explicit keywords from the opening text and later choices, updates evidence, and selects curated questions. This is **deterministic simulation, not AI**. Product unfamiliarity does not imply use or rejection of that product's whole category. In live mode a key plus `AI_ENABLED=true` activates model-selected content through Structured Outputs. This change does not configure a key or enable paid calls.

## Enable the real AI director and voice

```bash
cp .dev.vars.example .dev.vars
```

Edit **only the ignored `.dev.vars`** file:

```dotenv
AI_ENABLED=true
COMPASS_API_KEY=your-key-entered-locally
AI_MODEL=gpt-4.1-mini
TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
```

Restart the development server, then choose **Включить AI** on the welcome screen. The key is never included in the browser bundle. `OPENAI_API_KEY` is also accepted by the Worker for conventional deployments, but `COMPASS_API_KEY` avoids reserved names in cloud environment secret bindings. Do not prefix secrets with `VITE_`, commit them, or paste them into chat.

Live questions use OpenAI **Responses API + Structured Outputs** with server-side Zod validation, `store: false`, a 25-second request timeout, zero automatic retries, and a 2,200-token response limit. `gpt-4.1-mini` is the configurable affordable default; confirm model availability and current pricing in your OpenAI project before launch.

Voice requests microphone permission only after a click. Recording is limited to 45 seconds / 4 MiB, selects a supported WebM, MP4, or Ogg format, and stops tracks after recording/cancellation/navigation. The Worker forwards audio to OpenAI transcription and returns editable text. Submission is a separate action. Voice requires HTTPS or a browser-recognized secure local origin. Demo mode explicitly does **not** simulate successful transcription; text always works.

## Checks

```bash
npm run test          # memory, readiness, ranking, state machine, UI, Worker contracts
npm run lint
npm run smoke         # with the development server running; exercises five HTTP journeys
npm run build         # strict TypeScript + Worker/static-asset production build
npx playwright install chromium
npm run test:e2e      # full desktop + mobile Chromium journeys
```

If Chromium is already provided by the machine, skip the download:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e
```

For a different local test port, set `COMPASS_TEST_ORIGIN=http://127.0.0.1:5178` for both the browser tests and smoke command. The browser runner starts that port with strict port checking, so it cannot silently test a different server.

Test provider calls are mocked. A passing API contract test does not demonstrate a real paid API call, actual speech recognition quality, or a successful Cloudflare deployment. See [validation notes](docs/validation.md) for current evidence and limitations.

## Deploy to Cloudflare Workers

1. Create a Cloudflare account and an OpenAI project with a small budget. Review provider data policies before inviting testers.
2. Run `npx wrangler login` in your own terminal, or configure Cloudflare's supported CI credentials securely.
3. Change `name` in `wrangler.jsonc` if necessary. The native `AI_RATE_LIMITER` binding is already configured (12 paid requests per IP per 60 seconds, shared between onboarding and transcription). The numeric namespace is an arbitrary account-local namespace: change it if another Worker intentionally must not share that namespace.
4. Set the production secret interactively: `npx wrangler secret put COMPASS_API_KEY`. Local `.dev.vars` is **not** deployed.
5. For live mode change `vars.AI_ENABLED` to `"true"` in `wrangler.jsonc`; leave `false` for a public demo. Adjust `AI_MODEL` and `TRANSCRIPTION_MODEL` there if desired.
6. Run `npm run deploy`. Wrangler uses the Cloudflare Vite build output. Review deployment output and test the published origin, including `/api/status` and one full live session. Use a tiny non-sensitive test recording to verify voice on iOS Safari and Android Chrome.
7. To stop paid calls immediately set `AI_ENABLED=false` in Cloudflare's Worker settings and redeploy if updating the file. This disables both model and transcription calls.

No deployment has been performed by this build task. A Cloudflare account and valid API credentials are required for those manual steps. Production assets use SPA fallback; `/api/*` routes execute the Worker first. No database binding is needed.

## Structure

- `src/components/onboarding/` — six fixed, accessible interaction components, quick-answer/timer wrapper and dev gallery
- `src/features/onboarding/` — explicit session state machine, ephemeral memory, demo director and orchestration
- `src/features/evidence/` — deterministic evidence readiness, constraints, diversity ranking, information-gain heuristics
- `src/data/tools.json` — editable 40-product catalog, including 30 source-verified active entries
- `src/data/assets.ts` — fixed Lucide asset allowlist; no generated images or remote image URLs
- `src/lib/schemas.ts` — bounded request and Structured Output schemas
- `src/lib/i18n.ts` — reusable Russian UI copy; add a locale dictionary here, then externalize question/demo copy for English
- `worker/index.ts` — onboarding, speech and capability endpoints; credentials stay here
- `tests/`, `e2e/` — unit/component/contract and browser tests

## Edit the tool catalog

Each entry includes ID, official URL, category, conservative supported use cases, audience, experience, platforms, limitations, verification date/source, status and first action. Review the actual official source, not only its HTTP status. Mark an entry `verified` **only after its claimed features and limitations are checked**. The engine excludes `pending` and `archived` entries from both live and demo recommendations. See [catalog review](docs/catalog.md).

Some popular cloud products remain pending because their authoritative product pages were blocked during this task. They do not appear in results. The active sample leans toward source-verifiable open tools and desktop apps. Installation limitations are always shown. Do not add pricing/integration claims without current authoritative evidence. The catalog is not sent wholesale to the model: each request includes at most eight verified candidates.

## Readiness and question priorities

`src/features/evidence/evaluator.ts` documents prototype RRS heuristics: coverage up to 40, reliability up to 35, fit up to 25. These numbers are **not calibrated probabilities** and are not shown to users. Strong results require explicit positive evidence from at least two source interactions, a verified matching capability, score at least 75, and no known contradiction/incompatibility. Model hypotheses never raise readiness. Explicit negative facts/goals and unresolved factual contradictions disqualify matching candidates; negative swipe interests do not erase unrelated positive needs. Unfamiliarity is not classified as use. Familiar products receive a ranking penalty, not blanket exclusion.

Unknown needs yield clearly labeled exploratory ideas; incompatible tools are filtered even from exploratory results. Fewer than three results (including none) is valid when constraints leave insufficient candidates. We do not manufacture certainty. More refined per-capability device/OS/price constraints are future work; review the displayed limitations before installing any recommended tool.

Question-priority heuristics rank contradictions (100), installation constraints (85), familiarity (65), and supported needs (55), while checking gaps together with their interaction format to allow focused clarification through a different mechanic. The model can propose completion but cannot override minimum interaction/evidence rules. The interview aims for 4–7 answers and always terminates at seven. Back removes later evidence so a corrected answer is re-evaluated; restart clears the entire session. Conflicting statements are not silently treated as corrections—use Back to correct the source answer.

## Privacy and abuse protection

There is no localStorage, sessionStorage, IndexedDB, session cookie, persistent session ID, server history or database. Application memory exists in React state; requests carry at most seven interactions. Restart and pagehide clear it, including browser back/forward-cache navigation. Feedback is local to a recommendation card. No answer/audio/provider error logging is implemented, and Worker observability is disabled. Hosting infrastructure and AI providers may still process operational data under their own terms; `store: false` does **not** promise zero provider retention.

Request body size is checked while streaming (24 KB JSON / 4 MiB audio plus bounded multipart overhead), not just through Content-Length. Unknown UI types, assets, catalog IDs and malformed model responses are rejected; model text is rendered as text by React. Both paid endpoints require the kill switch, a secret and a native limiter binding. Browser cross-origin requests are rejected. API responses are not cached. Keep source maps and tool access appropriately restricted in your deployment.

Cloudflare rate limits are approximate and scoped to a location, not a global durable monthly budget. Shared IPs may share a quota, distributed attackers can spread requests, and duplicate calls from separate tabs are still separate calls. Configure Cloudflare WAF/Turnstile and tighter account limits before a larger public launch. No authentication or per-user record is added. Use provider project spending controls, monitor usage, start with text-only testing, and keep sessions small. The app cannot guarantee a $100 cap or a fixed number of sessions at any future model price.

## Known limitations

- Live API and genuine microphone transcription need credentials and device verification; only their contracts and failure paths are tested in this environment.
- Native rate limiting is emulated locally; production effectiveness must be verified after deployment.
- Demo extraction is deliberately simple (Russian/English keywords), not semantic understanding. Live mode uses the actual model.
- Corrections require Back; contradictory statements in separate answers trigger clarification/exclusion.
- The catalog has broad use-case matching rather than fine-grained support for every product feature. Spreadsheet-specific coverage is limited; unsupported spreadsheet capabilities are not invented.
- English localization is not shipped; UI, model instructions and demo questions are Russian-first.
- Desktop and mobile Chromium are automated; real Safari/Firefox and actual audio devices still need manual QA.

## Official references

Implementation reviewed the official [Cloudflare React guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/react/), [Vite plugin guide](https://developers.cloudflare.com/workers/vite-plugin/get-started/), [OpenAI Node SDK](https://github.com/openai/openai-node), its [Zod helpers](https://github.com/openai/openai-node/blob/master/src/helpers/zod.ts), [Vite](https://vite.dev/guide/), [shadcn Vite setup](https://ui.shadcn.com/docs/installation/vite), and [Motion](https://motion.dev/docs/react). Where documentation sites were blocked, their official GitHub source was read. Apple's HIG site was blocked; the UI uses original system-font typography and original decorative shapes, with no Apple assets or trademarks. No optional applecn components were adopted. The local Button follows the MIT shadcn/ui pattern; see [third-party notices](docs/third-party.md).
