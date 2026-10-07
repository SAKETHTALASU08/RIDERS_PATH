# Changelog

## Passwordless student authentication

- Added email OTP request and verification with HMAC-only code storage, durable SQLite resend/IP limits, generic address responses, SMTP mailer abstraction, and hashed audit identifiers.
- Connected OTP, session restoration, profile completion, booking, owner onboarding, and manual verification to the real API by default.
- Added session rotation/revocation behavior, profile and enrollment validation, booking gates, manual-review persistence, and auth flow tests.
- Removed the student development login bypass and the legacy profile route alias.
- Added [`AUTH.md`](./AUTH.md) with configuration, operational limits, flow details, and threat boundaries.
- Required deployment setup: actual campus email domain(s), official enrollment format, OTP HMAC secret, and production SMTP credentials.
