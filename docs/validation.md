# Validation evidence

Validated in this cloud workspace on 2026-10-16 with Node 24.19.0, npm 11.9.0 and the project dependency lockfile. The repository started empty; all application files were created for this build. These checks do not deploy to Cloudflare or publish an environment snapshot. GitHub source updates are tracked separately through commits.

## Person-first introduction update

The first question is always open and required: «Расскажите немного о себе.» Empty/whitespace or skipped first answers are blocked in the UI, state machine and backend. A non-open first interaction is rejected by the API. No director request is sent until a real answer is submitted. Restart and Back restore the required opening.

The introduction asks about occupation, studies, hobbies and everyday life. No problem or goal needs to be stated. Follow-ups first clarify activities and preferences; relevant opportunities follow through swipes. Demo journeys use biographies without stated goals and verify that the engine keeps goals empty instead of inventing a need. The live director is instructed to follow the same approach, without inferring difficulties from a role or hobby. The live director may select all six mechanisms, including a focused open clarification, while avoiding consecutive open questions and enforcing the interview budget. Demo mode continues to simulate the same transition using rules; it does not activate paid AI calls. The 20-second timer and its extension/disabling/pause behavior are preserved and never bypass the required answer.

Five functional HTTP journeys cover four biographical opening answers without stated goals and a vague required opening with skipped follow-ups. They finish in 4–5 steps with 4–5 formats and catalog-backed results. Browser checks cover required input, adaptive choices/swipes, corrected opening answers, errors, timer expiry preserving the first answer, and restarted sessions. AI-provider calls remain mocked in automated tests.

## Live error diagnostics update

The API now classifies model access, authentication, permissions, quota, provider rate limits, request compatibility, SDK timeouts and incomplete/invalid responses into allowlisted error codes. The onboarding screen uses local Russian messages instead of raw provider error text. Answers and AI mode survive failures; errors never trigger silent demo fallback or automatic paid retries. Model, quota and timeout tests use actual SDK error classes with mocked provider calls. Browser tests exercise model/quota failures in live mode on desktop and mobile, including answer restoration and exclusion of private provider details.

The production site's generic failure has not been diagnosed: this workspace cannot reach its origin because the network proxy rejects the connection. No authenticated GPT-6.1 call has been tested, and the diagnostic update does not establish that the model is available. `/api/status` reports configuration only. Two initial browser tests were interrupted by a development page reload during concurrent build/documentation work; browser verification was repeated after those operations finished.

## Passed

- `npm ci --no-audit --no-fund`: fresh frozen dependency installation completed successfully using a writable npm cache.
- `npm run test`: **78 passing tests** in five suites. Includes source-quote validation, goals versus hypotheses, contradictory evidence, candidate ranking, explicit constraints, familiarity, budget enforcement, four demo personas, vague/skipped answers, invalid model schemas, corrections/restart, duplicate submission guards and recoverable errors.
- UI tests cover all six interaction types plus recommendation links/feedback. Microphone-denial and simulated recording-to-editable-transcript behavior passed. Audio fixtures and provider responses are mocked; this does not prove actual transcription quality.
- Worker tests cover input/body bounds, malformed JSON, unknown UI, source validation, origin checks, paid-call kill switch, native limiter contract, missing-binding fail-closed behavior, provider errors and multipart/MIME handling. Responses structured parsing and transcription calls use a mocked OpenAI client.
- `npm run test:e2e` with system Chromium: **24 passing desktop/mobile tests**. Includes all four personas with a required open introduction followed by quick selections and early swipes, edit/back, restart, skipped answers, first-answer validation, network error recovery, timer extension/disabling/expiry with draft preservation, gallery and automated WCAG A/AA checks. Automated accessibility scans passed on the welcome screen, six components and representative results. These do not replace manual assistive-technology testing.
- `npm run lint`: no warnings or errors.
- `npm run format:check`: all checked source/configuration files conform.
- `npm run build`: strict frontend and Worker TypeScript plus production Vite builds pass. Client JS approximately 473 KB / 146 KB gzip; Worker uncompressed bundle approximately 1.26 MB. Rollup reports harmless annotation-position warnings in Zod's dependency source; no verification or checks were disabled.
- `npm run smoke` against the actual development Worker: student 4 steps, creative 5, office 4, everyday 4, vague introduction with skipped follow-ups 5. Each ends with 3 catalog-backed results; vague introductions followed by skipped answers produce only exploratory suggestions. Evidence quotes are checked against submitted answers.
- The same five HTTP scenarios passed against the built production preview on a separate port.
- Production Chromium inspection: desktop/mobile load without JavaScript page errors or horizontal overflow, and the gallery is excluded. Static response security headers are supplied by `public/_headers`.

## Not verified / manual follow-up

- Real OpenAI Responses calls and actual audio transcription: no OpenAI key is configured. The app remains fully usable in clearly labeled demo mode. Enable the server-side key and kill-switch setting, then validate a live session and a short non-sensitive real recording.
- Real iOS Safari/Android microphone behavior, physical touch gestures and Firefox: not available in this run. Mobile tests use Chromium emulation.
- Cloudflare account deployment, production native rate-limit behavior, WAF settings, account spending controls and custom-domain setup: not executed. README documents exact manual steps.
- External product marketing URLs were blocked by network policy. Thirty active tools were checked through official project documentation sources, eight entries remain pending and two archived. Unverified/archived entries are excluded. This is documentation verification, not a runtime test of every third-party product or a guarantee that outbound links are reachable in every region.
- Apple's HIG site was blocked. Original system typography and artwork were used; no proprietary assets or optional applecn code was adopted.
- Environment `install_script` and `start_skill` were saved to a draft, with an optional personal `COMPASS_API_KEY` requirement and its `api.openai.com` network destination. Saving is not publication or credential provisioning. Review/save the draft in environment settings and publish to retain the prepared snapshot. Fresh-task restoration has not been tested.

## Environment-specific fixes

The default home directory is not writable here. Use `npm_config_cache=/tmp/ai-compass-npm` and `XDG_CONFIG_HOME=/tmp/ai-compass-config`; these were tested and saved in the reusable instructions. Downloading Playwright Chromium was blocked by egress, so the provided `/usr/bin/chromium` was selected using `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. No TLS, package checksums or signature verification was bypassed. Miniflare falls back to a placeholder Request.cf object when its optional metadata fetch is blocked; local functional tests still exercise the real Worker runtime.
