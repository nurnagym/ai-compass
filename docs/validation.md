# MVP v0.1 validation evidence

This change implements the supplied [MVP specification](mvp-spec.md) in the existing Vite/React/Cloudflare Worker repository. It starts from main commit `04ceb69`, retaining the subsequently merged model identifier, strict-compatible model schema approach, reasoning budget and curated fallback fixes. No Next.js migration, account system, persistent database, crawler or live tool search was added.

## Implementation map

| Responsibility                                                    | Files                                                                                               |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Life areas, signals, candidates and hypotheses                    | `src/types/session.ts`, `src/features/onboarding/lifeAreas.ts`, `src/features/onboarding/memory.ts` |
| RRS, approximate EIG, coverage and code-owned completion          | `src/features/evidence/scoring.ts`, orchestrated by `src/features/onboarding/director.ts`           |
| Existing tool compatibility and verification                      | `src/features/evidence/evaluator.ts`, `src/data/catalog.ts`                                         |
| Curated occasions, workflows and tool mappings                    | `src/data/opportunities.ts`                                                                         |
| Responses client, strict model output, normalization and turn API | `worker/index.ts`, `src/lib/schemas.ts`                                                             |
| Current-tab restoration and validation                            | `src/features/onboarding/storage.ts`, integrated with the existing reducer and `src/App.tsx`        |
| Existing six mechanics and workflow cards                         | `src/components/onboarding/`, `src/components/recommendations/RecommendationCard.tsx`               |

The model returns signals, tentative hypotheses and question candidates, without a completion decision or RRS/EIG scores. The server validates cited sources, merges prior valid signals, adds prepared candidates and makes the final decision. Browser-supplied cached results and metrics are discarded. The legacy onboarding API shares this engine as a compatibility route; the UI uses `/api/turn`.

## Checks passed

Executed with Node 24.19.0, npm 11.9.0 and the existing dependency lockfile.

- `npm run test`: **105 tests in seven suites**. Covers independent life areas after job search, several work topics counting as one area, duplicate/vague answers, quoted evidence, alternative hypotheses, contradictions, unsupported medical conclusions, explicit heuristic scores, code-owned completion, compatible verified workflows, semantic signal retention across turns and invalid cached evidence.
- Session tests cover bounded/versioned snapshots, intro drafts, restored questions, recomputed scores, interrupted requests recovering without paid retries, malformed/oversized data, selective restart clearing and storage-disabled browsers.
- Worker tests use actual SDK error classes with mocked provider calls. They cover the turn contract, cached-state tampering, schema fields, one provider call per live turn, safe candidate fallback, body limits, native limiter behavior, authentication/model/quota failures and transcription contracts. Mocked calls are not evidence of real provider/model availability.
- `npm run test:e2e` using system Chromium: **28 desktop/mobile tests passed**. Covers required open introduction, adaptive choices/swipes, Back/corrections, restart, skipped follow-ups, error recovery, live model/quota explanations, draft/question/result restoration, timer persistence, reload during a pending live request without an automatic retry, six-component gallery and automated WCAG A/AA scans.
- `npm run lint`: passed without warnings or errors.
- `npm run format:check`: passed.
- `npm run build`: strict frontend and Worker TypeScript checks and production builds passed. Client JS approximately 596 KB / 183 KB gzip, Worker approximately 1.30 MB uncompressed. Zod dependency annotation warnings and Vite's >500 KB chunk warning remain visible; no checks or warnings were disabled. Browser-side bounded snapshot validation and result recomputation add code to the client bundle.
- `npm run smoke` against the **built production Worker preview**: six complete HTTP journeys through `/api/turn`, required-introduction rejection, correct action envelopes, verified tool IDs, exact source quotations, distinct result life areas and concrete workflows.
- A production mobile Chromium run confirmed two workflow cards after skipped follow-ups, restored results after reload, no JavaScript page errors or horizontal overflow, and no production gallery. A screenshot was inspected after result animations settled.

| HTTP journey                           | Answers | Mechanics |             Results |
| -------------------------------------- | ------: | --------: | ------------------: |
| Student                                |       6 |         5 |                   3 |
| Creative                               |       6 |         5 |                   3 |
| Office                                 |       6 |         5 |                   3 |
| Everyday                               |       5 |         5 |                   3 |
| Job search                             |       6 |         5 |                   3 |
| Vague introduction, skipped follow-ups |       7 |         5 | 2 exploratory ideas |

The first browser run exposed two failures in the old swipe test helper: it waited for another question after the last swipe even though results had already rendered. The helper now explicitly accepts the result screen; the full 28-test run then passed. Assertions were retained.

## Behavioral limits

- RRS, approximate EIG, hypothesis confidence and coverage are explicit prototype heuristics, not calibrated probabilities or measured entropy. Their weights and stop rules are documented in README. Repeated/skipped answers do not fabricate confidence.
- Life-area interpretation in demo mode is keyword-based. Exact normalized duplicates are excluded, but semantic paraphrases can evade lexical repeat detection. Live extraction uses the configured model, with quotes and server guards; semantic correctness is not proven by a matching quote.
- The local verified catalog favors desktop applications and currently has only one web-capable tool. Some distinct workflows can therefore use the same verified product. Incompatible tools are excluded; fewer than two suggestions are possible if constraints or negative evidence leave too few compatible life areas. Unsupported spreadsheet capabilities are not invented.
- The first question remains mandatory and open; later open clarifications are limited. Existing timer controls are preserved. Snapshots retain text drafts, not recordings, and do not preserve partially clicked swipe/recognition sequences as completed evidence.
- Only the current tab passage uses sessionStorage. Restart deletes this app's key; storage denial falls back to memory. Browser session-restore settings can affect retention after closing/reopening the browser. There is no durable user profile or server-side session record.

## Not verified in this workspace

- Actual paid OpenAI Responses calls or real microphone transcription. No `COMPASS_API_KEY`, `OPENAI_API_KEY` or local credential file is configured here. The production model/credential settings were preserved, not provisioned or replaced.
- This change's Cloudflare account deployment, public-origin live session, native production rate limits or spending controls. GitHub source publication and a successful local production build do not prove a deployed live session works.
- Real iOS Safari, physical touch/microphone hardware or Firefox. Mobile checks use Chromium emulation; automated accessibility scans do not replace assistive-technology testing.
- Every external tool's runtime behavior, current pricing and regional link reachability. Existing catalog verification sources remain unchanged; no new live search or integrations were added.
- Fresh environment snapshot restoration. Existing setup/start instructions use the same npm workflow; saving an environment draft is separate from publication and runtime startup.

## Reproduce

Use the existing checkout, with no additional worktree:

```bash
cd /workspace/ai-compass
export npm_config_cache=/tmp/ai-compass-npm
export XDG_CONFIG_HOME=/tmp/ai-compass-config
npm ci --no-audit --no-fund
npm run test
npm run lint
npm run format:check
npm run build
npm run dev -- --port 5173 --strictPort
```

With that server running, use `npm run smoke` and `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`. For a separate production preview, run `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort`, then set `COMPASS_TEST_ORIGIN=http://127.0.0.1:4173` for the smoke command. Finish builds and file edits before browser tests, so development reloads do not interrupt a session. No TLS, package signature or checksum checks were bypassed.
