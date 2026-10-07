# Student Authentication: Flow, Limits, and Threat Model

This phase adds passwordless student sign-in with email OTP and existing server-side sessions. Admin authentication is unchanged and is not part of this flow.

## Configuration and manual setup

Set these values in the server environment before enabling student OTP:

| Variable | Purpose | Default / requirement |
| --- | --- | --- |
| `ALLOWED_EMAIL_DOMAINS` | Comma-separated campus domains | Required operationally. If empty or unset, the server warns at startup and OTP requests fail closed. |
| `ENROLLMENT_FORMAT_REGEX` | Enrollment format accepted by profile and manual-review forms | `^[A-Za-z0-9-]{4,20}$`, a documented permissive placeholder. Replace it with the institution's format. |
| `ENROLLMENT_FORMAT_EXAMPLE` | Human-readable enrollment example | `ABCD-123 (placeholder)`; replace it with an official example. |
| `OTP_HMAC_SECRET` | HMAC key used to protect OTP records | Required; at least 32 bytes. Generate a unique secret, for example with `openssl rand -hex 32`. |
| `OTP_TTL_MINUTES` | Code lifetime | 10 minutes. |
| `OTP_MAX_ATTEMPTS` | Wrong-code attempts per code | 5. The code is invalidated at the limit. |
| `OTP_RESEND_COOLDOWN_SECONDS` | Minimum delay between sends to one address | 60 seconds. |
| `OTP_MAX_SENDS_PER_HOUR` | Per-address hourly send cap | 5. |
| `OTP_MAX_SENDS_PER_IP_PER_HOUR` | Per-IP hourly send cap | 20. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Production mail delivery | All required and validated at startup in production. |

In development (`NODE_ENV` other than `production`), the selected mailer prints the OTP to the console. In production, the SMTP mailer never logs the OTP. Tests replace the mailer with an in-memory fake. Do not use the example OTP secret in a deployed environment.

## Student flow

1. The frontend loads `/api/config` and displays any configured public campus email domains. The browser validates email syntax only; it does not reveal allowlist decisions.
2. `POST /api/auth/otp/request` normalizes the email, audits a truncated SHA-256 email key and IP, checks the configured domain and durable SQLite send limits, then generates a six-digit code with `crypto.randomInt`.
3. The database stores an HMAC-SHA256 of the normalized email and code, its expiry, attempt count, and creation time. The code itself is sent through the `Mailer` interface and is never stored in the OTP record. Send-limit records keep a SHA-256 email key and IP, not the address. Older plaintext send-log keys are converted during migration.
4. A successful send returns the same generic message and response shape regardless of whether an account exists or the address is in the allowlist. Send-limit responses are also generic and include a server-calculated retry delay. If SMTP fails, the unsent OTP record is deleted and the generic response is preserved.
5. `POST /api/auth/otp/verify` checks expiry, compares fixed-size HMACs with `crypto.timingSafeEqual`, increments failures, and locks the code after the configured maximum. Attempt counting and code consumption are serialized in SQLite, so stale or concurrent verification requests cannot replay a code or bypass the attempt limit. A successful code is deleted, then the student account is found or created with `emailVerified=true`, `profileComplete=false`, `verificationStatus=unverified`, and `drivingLicenceVerified=false` unless it already has reviewed state.
6. The server issues a fresh random session ID in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production). The database stores only its SHA-256 hash. The response contains the shared `UserProfile` shape and no session token.
7. `GET /api/auth/me` restores the user from the cookie. `POST /api/auth/logout` revokes the current session and clears the cookie. Email or role changes invalidate all sessions for that user.
8. `PUT /api/users/me/profile` requires a session and verified email. It validates the full name, configured enrollment format, Indian mobile number, course, and academic year. Enrollment uniqueness conflicts return a generic message.

Browsing stays public. Booking and owner onboarding require a verified email and complete profile. Booking also requires `drivingLicenceVerified` to be approved; the enforcement hook is active, and the admin review UI is deferred to the admin phase. No route in this phase sets licence or identity-review state to verified automatically.

## Limits and audit records

- OTP lifetime: 10 minutes by default.
- Wrong attempts: 5 by default; the fifth invalidates the code.
- Resend cooldown: 60 seconds per address by default.
- Send caps: 5 per address/hour and 20 per IP/hour by default.
- Email/IP send reservations live in SQLite and are checked atomically, so they persist across process restarts.
- Manual verification requests use the auth rate limiter, create a `PENDING` database row, and never issue a session or access.
- Audit actions include OTP request, verify success/failure, lockout, logout, profile completion, and manual verification request. OTP audit identifiers are hashed; audit records do not contain OTP values, full email addresses, or session IDs.
- CSRF origin verification applies to the state-changing auth and profile routes through the existing middleware.
- A one-time migration revokes legacy student sessions from the removed enrollment/dev login flow while preserving admin sessions.

## Threat model and boundaries

The flow is designed to reduce email-account enumeration, OTP guessing, replay, session fixation, database disclosure, and accidental credential logging. The request endpoint does not query whether a student account exists. It returns a generic result for allowed and disallowed addresses; the public config endpoint separately exposes the configured allowlist so the UI can guide students.

The OTP is a short-lived possession check for the configured email domain. It does not verify enrollment, identity documents, age, or driving eligibility. Enrollment conflicts are non-leaking but require human review. Admin approval screens, admin-auth changes, email-change UX, and document review are outside this phase. The frontend uses the real API by default; `VITE_USE_MOCK_API=true` is an explicit mock-only demo setting.

## Manual steps remaining

Before production deployment, set the actual `ALLOWED_EMAIL_DOMAINS`, official enrollment regex and example, unique `OTP_HMAC_SECRET`, and working SMTP credentials and sender. The default enrollment rule is only a placeholder until the institution supplies its real format.
