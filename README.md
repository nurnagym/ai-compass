# AI Compass

A Russian-first, session-only AI discovery experience. A short open introduction and adaptive interactions become two or three practical AI workflows across different life areas, each with evidence, a practical first action, and an official product link. No accounts, database, or permanent personal profile; only the current tab uses sessionStorage.

The supplied implementation requirements are preserved in [MVP v0.1 specification](docs/mvp-spec.md). The project keeps Vite, React and its existing Cloudflare Worker.

## Start locally

Requires **Node 22.12+** (Node 24 tested) and npm. Use this checkout directly; cloud tasks are already isolated and do not need a Git worktree.

```bash
npm ci
npm run dev
```

Open the address printed by Vite in your own browser. Demo mode is the default: it needs no API key and makes no paid API calls. Start with one required open introduction about yourself, your activities and interests. After that, the director selects relevant interaction formats; ready-made choices and optional text/voice remain available. Demo responses use keyword-based simulation, **not a real AI director**. Answers are sent to the same-origin Worker for in-memory processing, not to OpenAI. The development-only component gallery is available using the footer or `/#gallery`; it is excluded from production.

In the restricted cloud workspace, use writable tool paths:

```bash
export npm_config_cache=/tmp/ai-compass-npm
export XDG_CONFIG_HOME=/tmp/ai-compass-config
npm ci
npm run dev -- --port 5173
```

## One open introduction, then the adaptive engine

The first question is always **VoiceTextQuestion**: «Расскажите немного о себе.» A couple of sentences about work, studies, hobbies or everyday life is enough; no task or goal needs to be stated. This first answer is required: Continue is disabled for empty/whitespace input, there is no Skip action, and both the session state machine and backend reject a skipped or non-open introduction. No director request is made until the user submits that answer. With transcription configured, users can record and edit their first answer before submitting it.

After the introduction, the engine first asks about activities and preferences relevant to that person, then explores useful opportunities through swipes. It chooses questions and formats from actual answers, without assuming difficulties or needs from an occupation or hobby. Demo mode uses curated rules; live mode uses the existing OpenAI Responses integration. Both retain safeguards against long interviews and consecutive open questions, introduce swipes early, check practical constraints, and terminate within seven interactions. The live director can select all six component types, including one additional short open clarification when useful. It does not return to three mandatory open questions. Back/restart always restore the same required open introduction.

After «ищу работу», the next question explores another life area. Work, learning, creativity, everyday life and relationships are tracked separately from technical use cases such as writing or audio. A single biographical answer never counts as several independent probes. Results contain practical workflows, reasons, first steps and official links. Demo uses the verified local catalog; production live mode selects from the connected tools sheet, with web search on a genuine catalog miss. Some workflows may use the same tool in different contexts.

Single-selection cards advance immediately. Multiple-selection cards still require Continue. On closed questions users can switch to editable text/voice and back to choices without losing their draft. Every actual answer retains evidence provenance; unselected options are never evidence.

Each question has a **20-second timebox**, configurable through `ANSWER_SECONDS` in `src/hooks/useAnswerTimer.ts`. Users can add 20 seconds or disable time limits for the session. It pauses for hidden tabs, the privacy dialog, microphone permission, recording and transcription. New swipe cards receive a fresh budget. Expiry preserves the answer and shows a gentle prompt; it never submits an unconfirmed answer or skips the mandatory introduction.

In demo mode the server extracts explicit keywords from the opening text and later choices, updates evidence, and selects curated questions. This is **deterministic simulation, not AI**. Product unfamiliarity does not imply use or rejection of that product's whole category. In live mode a key plus `AI_ENABLED=true` activates model-proposed content through Structured Outputs; code selects the question and completion. This change does not configure a key or enable paid calls.

## Enable the real AI director and voice

```bash
cp .dev.vars.example .dev.vars
```

Edit **only the ignored `.dev.vars`** file:

```dotenv
AI_ENABLED=true
COMPASS_API_KEY=your-key-entered-locally
AI_MODEL=gpt-6.1-sol
AI_REASONING_EFFORT=low
TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
```

Restart the development server, then choose **Включить AI** on the welcome screen. The key is never included in the browser bundle. `OPENAI_API_KEY` is also accepted by the Worker for conventional deployments, but `COMPASS_API_KEY` avoids reserved names in cloud environment secret bindings. Do not prefix secrets with `VITE_`, commit them, or paste them into chat.

Live questions use OpenAI **Responses API + Structured Outputs** with server-side Zod validation, `store: false`, a 25-second request timeout, zero automatic retries, and an 8,000-token response limit (it includes hidden reasoning tokens; `AI_REASONING_EFFORT=low` keeps them small — leave it empty for models without reasoning). `gpt-6.1-sol` is the configured default; model availability, current pricing, and a successful real Responses request must be confirmed in your OpenAI project. No authenticated GPT-6.1 Sol call has been validated in this workspace.

Live API failures return an allowlisted `errorCode`, and the onboarding screen shows its corresponding Russian explanation: unavailable model, rejected key, access denied, exhausted quota, temporary rate limit, rejected request parameters, timeout or invalid/incomplete response. Raw provider error text, input and credentials are never returned or logged. A provider failure keeps the current answer and AI mode; the app does not silently switch to demo or retry paid calls. `/api/status` reports configuration only and does not contact OpenAI or establish model access.

Voice requests microphone permission only after a click. Recording is limited to 45 seconds / 4 MiB, selects a supported WebM, MP4, or Ogg format, and stops tracks after recording/cancellation/navigation. The Worker forwards audio to OpenAI transcription and returns editable text. Submission is a separate action. Voice requires HTTPS or a browser-recognized secure local origin. Demo mode explicitly does **not** simulate successful transcription; text always works.

## Three sources and conditional tool search

The latest user request adds these sources to the MVP and supersedes the original specification's exclusion of live tool search:

| Role                           | Google Sheet                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Prepared use cases             | [Use cases](https://docs.google.com/spreadsheets/d/1Uk3-nk4VPg2wX_uYDhXYBUF7jWabbSyYHVM3Tl7sJVI/edit) |
| Possible solutions             | [Solutions](https://docs.google.com/spreadsheets/d/13dH8yDs8HL1drgZXz9KqoamT61tSYAEqDLmv66gzzFs/edit) |
| Tools database, first priority | [Tools](https://docs.google.com/spreadsheets/d/1TIMQB7ZdTtL2tKcUu9RISB33TEXjdHDRSuMTRlVowjU/edit)     |

`SHEETS_ENABLED=true` is deployed in `wrangler.jsonc`. Demo remains an offline catalog simulation and does not read Sheets or search. Live mode reads the three tables server-side via Google's CSV endpoint. The tables must be readable without Google login; this implementation does not have a private Google service-account binding. Give link-view access only if their contents are intended to be publicly readable. No answers are written to Google.

By default each source uses its **first tab**, without assuming that its gid is 0. To select a specific tab, set `KNOWLEDGE_1_GID`, `KNOWLEDGE_2_GID` or `TOOLS_GID` to the numeric gid from its URL. Updates are loaded within five minutes in a warm Worker; cold Workers reload them. Failures are not cached and stale data is not silently substituted.

Each CSV needs one unique, non-empty header row, followed by records (no merged heading rows). The first two tables can use arbitrary descriptive columns. Their 20 most relevant rows per table, ranked by lexical overlap with the validated memory, are supplied to the director and final selector; cells are capped at 800 characters in this reference context. They suggest use cases/solutions, never facts about the person. Applicability, coverage and interview completion stay under the existing quoted-evidence and code-scoring rules. The fixed life areas and domains remain the taxonomy. Scenarios missing from the small demo mapping (for example, work with data or presentations) can be created from actual cited signals within those domains, then adapted using the source cases and solutions. This does not introduce new UI mechanics.

The tools table needs a **name** and **official website** column, with descriptive capability/constraint columns strongly recommended. Automatic bilingual aliases include `Name`, `Tool Name`, `Product`, `Название`, `Инструмент`, `Website`, `Official URL`, `Official website`, `Сайт`, `Официальный сайт`, `URL`, `Link` and `Ссылка`. An explicit official website column takes precedence over a generic link column. Configure exact custom headers with `TOOL_NAME_COLUMN` / `TOOL_URL_COLUMN` if necessary. HTTPS websites are required; a `www.` URL receives an HTTPS prefix. Invalid/unnamed rows cause a configuration error, not an invented catalog miss. Import bounds: 2 MiB, 500 records, 60 columns per source, cells up to 6,000 characters; the final selection prompt is capped at 240,000 characters. Split or clean larger sources before use.

At completion the model proposes a tool for each code-scored opportunity from the **entire imported tools database**, considering explicit constraints and the first two sources. The server accepts only existing tool IDs and referenced context rows, preserves evidence and readiness, and takes official URLs directly from the database. A null selection means no compatible database tool was found; only these missing targets go to a second Responses request with `web_search`, live internet access and up to four search actions. The search receives prepared generic task descriptions and normalized setup constraints (including common restrictions written as free text), without the raw answer history. It must produce an official source on the same hostname as the recommended website. The server requires an actual completed search and matching source metadata/citations; invented links are rejected. Search evidence supports provenance but does not independently prove every product feature or the site's ownership. Suitability and website identity still require semantic model judgment.

Each additional provider request consumes the native limiter before execution. A normal discovery turn uses one Responses request; a final turn uses two, or three if web search is needed. All use `store:false`, zero retries and the configured model/reasoning effort. Selection has a 25-second timeout, search 45 seconds, the complete live turn 110 seconds and the browser 120 seconds. Web search has additional provider charges and requires a model/project supporting that tool. Source/schema/provider/search failures keep the answer and display a safe explanation; the app does not silently switch to the demo catalog.

Cards include the chosen website, why the tool fits, steps, a database/search source link, retrieval date and any cited use-case/solution rows. Reload preserves bounded external display metadata and workflows while recomputing scores from evidence; it never automatically repeats a paid search. Browser metadata is not sent back as authoritative catalog data.

For read-only integration diagnostics, open `/api/sources` on the deployed origin: it reads the configured sources and returns `ready`, row counts, roles and retrieval time, or a safe source error. It makes no OpenAI calls and uses the native IP limiter. `/api/status` continues to report AI configuration only. Actual table contents and paid web search were **not validated here**: this workspace's egress proxy blocks `docs.google.com`, and no local API key is configured. A saved network draft adds the Google domain but requires environment publication to apply. Actual headers, tab selection and a successful live session remain to be checked with real access.

## Checks

```bash
npm run test          # memory, readiness, ranking, state machine, UI, Worker contracts
npm run lint
npm run smoke         # with the development server running; exercises six HTTP journeys including job search
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
5. `vars.AI_ENABLED` is set to `"true"` in `wrangler.jsonc` for live testing. AI remains unavailable until a server-side API key is configured; the welcome screen still starts in demo mode until the user selects AI. Set the flag to `"false"` to disable paid endpoints. Adjust `AI_MODEL` and `TRANSCRIPTION_MODEL` there if desired.
6. Run `npm run deploy`. Wrangler uses the Cloudflare Vite build output. Review deployment output and test the published origin, including `/api/status` and one full live session. Use a tiny non-sensitive test recording to verify voice on iOS Safari and Android Chrome.
7. To stop paid calls immediately set `AI_ENABLED=false` in Cloudflare's Worker settings and redeploy if updating the file. This disables both model and transcription calls.

For an existing GitHub-connected Worker, wait for the latest successful build, then open **Workers & Pages → ai-compass → Settings → Variables and Secrets → Add**. Choose **Secret**, name it `COMPASS_API_KEY`, enter an OpenAI API project key, and save/deploy. Never put the key in build variables or GitHub source. The project flag already enables live mode when that secret exists. Refresh the product and select **Включить AI** before starting. To check capability, open `/api/status` on the deployed product origin: `aiEnabled` must be `true`; this indicates configuration, not proof of a successful provider call. Complete a real session to verify the integration. An OpenAI API project with billing is required; a ChatGPT subscription does not fund API usage.

No deployment has been performed by this build task. A Cloudflare account and valid API credentials are required for those manual steps. Production assets use SPA fallback; `/api/*` routes execute the Worker first. No database binding is needed.

## Structure

- `src/components/onboarding/` — six fixed, accessible interaction components, quick-answer/timer wrapper and dev gallery
- `src/features/onboarding/` — session state machine, cited signal memory, life-area interpretation, director and bounded tab-session restoration
- `src/features/evidence/scoring.ts` — explicit opportunity RRS, approximate EIG, independent coverage, hypotheses and completion
- `src/features/evidence/evaluator.ts` — existing tool compatibility and ranking checks reused by opportunity selection
- `src/data/opportunities.ts` — curated life occasions, workflows and verified-tool mappings
- `worker/sources.ts`, `worker/recommendations.ts` — three-source CSV import, database selection and conditional OpenAI web search
- `src/data/tools.json` — editable demo catalog of 40 products, including 30 source-verified active entries
- `src/data/assets.ts` — fixed Lucide asset allowlist; no generated images or remote image URLs
- `src/lib/schemas.ts` — bounded request and Structured Output schemas
- `src/lib/i18n.ts` — reusable Russian UI copy; add a locale dictionary here, then externalize question/demo copy for English
- `worker/index.ts` — onboarding, speech and capability endpoints; credentials stay here
- `tests/`, `e2e/` — unit/component/contract and browser tests

## Edit the tool catalog

Each entry includes ID, official URL, category, conservative supported use cases, audience, experience, platforms, limitations, verification date/source, status and first action. Review the actual official source, not only its HTTP status. Mark an entry `verified` **only after its claimed features and limitations are checked**. The engine excludes `pending` and `archived` entries from both live and demo recommendations. See [catalog review](docs/catalog.md).

Some popular cloud products remain pending because their authoritative product pages were blocked during this task. They do not appear in results. The active sample leans toward source-verifiable open tools and desktop apps. Installation limitations are always shown. Do not add pricing/integration claims without current authoritative evidence. The catalog is not sent wholesale to the model: each request includes at most eight verified candidates.

## Turn contract and decision loop

The browser uses `POST /api/turn` with `{ session: { version: 1, mode, history, signals }, answer: Interaction }`. The server returns `{ session: { version, mode, history, signals, result }, action: { type: 'question', question } | { type: 'results', recommendations } }`. The previous onboarding route remains a compatibility alias to the same engine. There is no Next.js migration or duplicate API implementation.

Every request validates bounded browser history and cited signals. Cached results or numeric scores are discarded. Signals survive later turns only when their exact quote and source are present in non-skipped history. Back discards subsequent sources. A live turn makes one server-only Responses request, returning `signals`, tentative `hypotheses`, and up to three `candidateQuestions`. The model is asked for 2–3 candidates including one outside the dominant area, but receives no completion field. The server adds curated candidates, validates formats and content, computes scores and chooses the next action. Invalid proposals use a safe prepared question; provider errors retain the explicit error screen.

## Prototype RRS, approximate EIG and coverage

These are transparent test heuristics, **not calibrated probabilities, measured entropy or OpenAI API features**. Scores are internal and are not shown as percentages to users.

`calculateCoverage` counts independently answered life areas from cited positive signals. One interaction contributes at most one area; constraints, familiarity, skipped/vague answers and normalized duplicate answers add none. Coverage points equal `100 × independent areas / 5`. Different work topics do not establish independent life areas.

`calculateRRS` scores a specific curated opportunity, not an application in isolation:

- Independent cited source interactions: 20 points each, capped at 40.
- Distinct supporting quotations: 10 points each, capped at 20.
- Explicit goal or positive interest: 15 points; factual context alone: 5 points.
- At least two independently explored areas: 15 points.
- Answered practical constraints: 10 points.

Unsupported hypotheses never add points. A strong match also requires at least two independent sources for the same opportunity, RRS ≥75, enough breadth and a compatible verified tool. Negative evidence and contradictions are scoped to the life area; declining work letters does not reject creative writing. Tentative alternatives remain separate and their confidence decreases with conflicting evidence.

`estimateEIG` scores prepared questions: a new area adds 45 points until two areas are explored, then 15; an area or use case with only one supporting source adds 25; a relevant contradiction adds 35; installation constraints add 50; unfamiliar formats add 10. Repeat gaps lose 15 per previous probe; returning to an already supported area immediately loses 20. Answer effort costs 8 for open text or 1 for a closed choice. Repeated titles and a third probe of the same area/gap are excluded. These weights are hypotheses for testing, not learned or calibrated values.

Completion is exclusively code-owned: before seven turns, require at least five answers, two independent areas, answered constraints, no unresolved factual contradictions, at least two strong opportunities, and next-question EIG <45. At seven turns the session always ends. Unsupported results are labeled exploratory; narrow or skipped sessions never become confident just because the budget ended. Prefer 2–3 different life areas; fewer results are possible when verified compatible tools are unavailable rather than inventing capabilities. Repeat detection is lexical and area classification in demo mode uses heuristics.

## Current-tab restoration

`sessionStorage` retains a bounded, versioned snapshot of this passage: history, cited signals, current question, mode, timer preference and text draft. Reload restores the screen; cached RRS/EIG are recomputed from validated evidence. Demo recommendations are rebuilt from the local catalog; live external display metadata and workflows are validated and restored without a new paid call. An interrupted request restores as a recoverable error and never automatically repeats a paid call. Restart removes this app's key without deleting other tab data. Storage-denied/private-browser cases continue in memory. Audio recordings, API keys and permanent identifiers are not stored. Browser session restoration may preserve sessionStorage according to browser settings; this is not a promise of deletion across all browser restarts.

## Privacy and abuse protection

There is no localStorage, IndexedDB, session cookie, persistent session ID, server history or database. Only the current passage is retained in tab-scoped sessionStorage; Restart clears it. Requests carry at most seven interactions and 28 validated cached signals. Feedback remains local to a recommendation card. Answers, audio, credentials and raw provider errors are never logged. Worker observability remains as configured for deployment metadata; it does not add application content logging. Hosting infrastructure and AI providers may process operational data under their terms; `store: false` does **not** promise zero provider retention.

Request body size is checked while streaming (24 KB JSON / 4 MiB audio plus bounded multipart overhead), not just through Content-Length. Malformed model output uses a safe prepared question without a second model call. Oversized model text is clipped, invalid claims are dropped, and an unusable proposed question (unknown catalog IDs, wrong option count) is replaced by the curated next question instead of stopping the session; model text is rendered as text by React. Both paid endpoints require the kill switch, a secret and a native limiter binding. Browser cross-origin requests are rejected. API responses are not cached. Keep source maps and tool access appropriately restricted in your deployment.

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
