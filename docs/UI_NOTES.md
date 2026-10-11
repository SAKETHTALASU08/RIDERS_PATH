# Student and admin UI notes

## App shape

- `apps/web` is the student Vite/React app. Its routes are lazy-loaded except the landing page, which is prerendered by `npm run build`.
- `apps/admin` is a separate Vite app. It has its own build, development server, `noindex` metadata, and review screens.
- Both clients use the same Express API and share only the schemas in `packages/shared`.
- Student mutations send the CSRF header and both apps use HTTP-only session cookies. OTPs and session tokens are never written to browser storage or URLs.
- The student catalog calls the public API by default. The in-memory mock is limited to tests or explicit `VITE_USE_MOCK_API=true` demos.

## Assumptions and configuration

- The existing amber and charcoal brand palette remains the default. The student app also supports a light theme; only the visual theme preference is stored locally.
- Sign-in accepts any valid email address. Email ownership is confirmed with a one-time code; student eligibility is collected during profile completion and document review.
- Enrollment validation uses a placeholder 4–20 character alphanumeric/hyphen format until the campus provides the official format. Set `ENROLLMENT_FORMAT_REGEX` and `ENROLLMENT_FORMAT_EXAMPLE` on the API.
- Campus name, hubs, operating hours, fee rules, safety rules, and terms versions currently come from the shared platform config. Confirm them with the campus before launch.
- `REQUIRE_AADHAAR_UPLOAD` defaults to `true`; set it to `false` to turn that required upload off. The masked-copy reminder is advisory and does not claim to detect masking.
- The default retention policy deletes unused uploads after 7 days and documents for completed, cancelled, or rejected bookings 30 days after the terminal state. Configure `UNUSED_DOCUMENT_RETENTION_DAYS` and `DOCUMENT_RETENTION_DAYS` on the API.
- Terms, Privacy, and Refund/Deposit content are placeholders marked `[LEGAL TEXT TO BE REVIEWED]`; have counsel and the campus review the actual wording before launch.
- “Nearest hub” sorting is not offered because the hub config has no coordinates and the app has no location permission flow. Sorting by hub name is available.

## Local development

1. Copy `.env.example` to `.env` and generate unique values for `OTP_HMAC_SECRET` (`openssl rand -hex 32`) and `DOCUMENT_ENCRYPTION_KEY` (`openssl rand -base64 32`). Keep `.env` out of source control.
2. Development OTPs are written to the API terminal by the development mail adapter. For real delivery, configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM`.
3. Run `npm run dev` for the API, `npm run dev:web` for students at `http://localhost:5173`, and `npm run dev:admin` for admins at `http://localhost:5174`.
4. If the UI and API contracts were both edited while `npm run dev` was already running, restart the API. The frontend dev server hot reloads; the API process does not reload automatically.

## Separate Netlify sites

- Student site: use the root `netlify.toml`, publish `dist/web`, and set `VITE_API_URL` to the API base ending in `/api` plus `VITE_SITE_URL` to the student canonical origin.
- Admin site: create a second Netlify site using `netlify.admin.toml`, publish `dist/admin`, and set `VITE_ADMIN_API_URL` to the same API base ending in `/api`. The admin HTML sends `noindex` directives.
- Set API `CORS_ORIGIN` to the student origin and `ADMIN_CORS_ORIGIN` to the admin origin. The API checks the admin origin only for `/api/admin/*` routes and the student origin for student/public routes.
- Use student and admin custom subdomains under the same registrable domain as the API (for example `students.example.edu`, `admin.example.edu`, and `api.example.edu`) so browser cookie `SameSite` rules work predictably. Replace the example hostnames in `apps/web/.env.example` and `apps/admin/.env.example`; they are placeholders, not real deployment values.
- Production document storage must use a private S3-compatible bucket with `DOCUMENT_STORAGE_DRIVER=s3`, bucket, region, and KMS key configured. For versioned buckets, configure a lifecycle rule to expire noncurrent object versions too. Grant the API identity only the needed put/get/delete permissions.

## Checks and remaining manual work

- `npm run typecheck`, `npm run lint`, `npm run build`, and `npm test` are the workspace checks. `npm run build:web` also scans the student bundle to prevent admin route/code strings from leaking into it.
- Before deployment: set the real enrollment format; verify campus hub, fee, safety, and terms data; provision the private bucket and KMS key; set retention values and S3 lifecycle policy; configure both Netlify origins and API CORS; replace legal placeholders; configure SMTP; and test OTP delivery.
- Ratings are omitted because there is no review dataset. Saved bikes sync to a signed-in student's account and remain local for guests.
- A successful availability result is a point-in-time check. The booking API checks conflicts again at submission. Payment is due at handover.
- Owner-provided listing notes are rendered as escaped React text; the app does not use `dangerouslySetInnerHTML` for user content.
