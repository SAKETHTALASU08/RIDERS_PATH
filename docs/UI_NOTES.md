# Student app UI notes

## App shape

- Student UI lives in `apps/web`; shared runtime contracts and validation live in `packages/shared`.
- The UI calls the Express API by default. The mock API is enabled only for test mode or when `VITE_USE_MOCK_API=true` is explicitly set.
- Mutating API requests fetch a double-submit CSRF token and send it in `X-CSRF-Token`; authentication remains in HTTP-only cookies.
- Routes are lazy-loaded except the landing page, which is prerendered for the initial HTML response.

## Assumptions and configuration

- Brand colors use amber with dark mode as the default. Students can switch to light mode; the preference stored in local storage is only a visual theme choice.
- The canonical origin defaults to `https://riderspath.netlify.app`; set `VITE_SITE_URL` for the deployment's actual public URL.
- Allowed email domains, enrollment format, and example are read from the public API config. The UI shows no hardcoded college domain; if config loading fails, the server remains the eligibility authority.
- Current campus name, hubs, terms versions, deposit options, and safety rules come from the shared platform configuration until they are supplied by the public runtime config endpoint.
- Legal copy is intentionally marked `[LEGAL TEXT TO BE REVIEWED]` on Terms, Privacy, and Refund/Deposit pages.

## Local development

- `npm run dev:web` starts the Vite student UI at `http://localhost:5173/` and proxies `/api` to `http://localhost:3000/`.
- `npm run dev` starts the Express API. It requires `OTP_HMAC_SECRET` and other environment values defined in `server/config/env.ts`; the local workspace does not currently provide them, so API-backed actions are unavailable until a local environment is configured.
- `npm run typecheck`, `npm run lint`, `npm run build`, and `npm test` are the workspace verification commands.

## Scope notes

- Payments are labeled “Pay at handover.” The UI does not promise a deposit refund outcome; the legal terms remain placeholders.
- A successful availability response is worded as a point-in-time check. The booking API remains authoritative when a request is submitted.
- User-provided listing text is rendered as escaped React text and identified as owner-provided notes; it is never inserted as HTML.
