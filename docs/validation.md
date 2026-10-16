# Validation evidence

Validated in this cloud workspace on 2026-10-16 with Node 24.19.0, npm 11.9.0 and the project dependency lockfile. The repository started empty; all application files were created for this build. No deployment, Git push, or environment publication was performed.

## Passed

- `npm ci --no-audit --no-fund`: fresh frozen dependency installation completed successfully using a writable npm cache.
- `npm run test`: **46 passing tests** in three suites. Includes source-quote validation, goals versus hypotheses, contradictory evidence, candidate ranking, explicit constraints, familiarity, budget enforcement, four demo personas, vague/skipped answers, invalid model schemas, corrections/restart, duplicate submission guards and recoverable errors.
- UI tests cover all six interaction types plus recommendation links/feedback. Microphone-denial and simulated recording-to-editable-transcript behavior passed. Audio fixtures and provider responses are mocked; this does not prove actual transcription quality.
- Worker tests cover input/body bounds, malformed JSON, unknown UI, source validation, origin checks, paid-call kill switch, native limiter contract, missing-binding fail-closed behavior, provider errors and multipart/MIME handling. Responses structured parsing and transcription calls use a mocked OpenAI client.
- `npm run test:e2e` with system Chromium: **16 passing desktop/mobile tests**. Includes all four personas, complete student/creative journeys, edit/back, restart, skipped/vague answers, network error recovery, gallery and automated WCAG A/AA checks. Automated accessibility scans passed on the welcome screen, six components and representative results. These do not replace manual assistive-technology testing.
- `npm run lint`: no warnings or errors.
- `npm run format:check`: all checked source/configuration files conform.
- `npm run build`: strict frontend and Worker TypeScript plus production Vite builds pass. Client JS approximately 469 KB / 145 KB gzip; Worker uncompressed bundle approximately 1.26 MB. Rollup reports harmless annotation-position warnings in Zod's dependency source; no verification or checks were disabled.
- `npm run smoke` against the actual development Worker: student 4 steps, creative 6, office 4, everyday 4, all-skipped 5. Each ends with 3 catalog-backed results; skipped answers produce only exploratory suggestions. Evidence quotes are checked against submitted answers.
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
