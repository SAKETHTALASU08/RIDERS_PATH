# Riders Path — Backend Security & Architecture Audit Report

## 1. System Inventory & Existing Architecture

- **Entry Point**: `server.ts` (1,380 lines) running Express 4.21.2 on port 3000.
- **Data Persistence**:
  - Legacy state used in-memory JavaScript collections (`this.data.bikes`, `this.data.bookings`, `this.data.users`, `this.data.owners`, `this.data.verifications`, `this.data.pickupLocations`) inside an uncommitted `server/db.js`.
  - Process termination, restarts, or crashes wiped all runtime records back to seed data.
  - No transactional safety, no relational integrity, no uniqueness constraints on active bookings, and no concurrency locks.
- **Admin Password & Hashing**:
  - **Hashing Method**: *None*. Passwords were evaluated via direct plaintext equality checks.
  - **Default Passwords**: `"riderspath210"`, `"admin"`, and `"admin123"`.
  - Passwords were hardcoded in code and inadvertently embedded into the public client bundle.
- **Document Handling & Storage**:
  - Documents (Aadhaar scans, Driving Licences, Student ID cards) were accepted as raw Base64 data inside standard JSON bodies via an oversized 25MB body limit (`express.json({ limit: '25mb' })`).
  - Stored verbatim as long Base64 strings in memory.
  - No magic-byte file signature validation, no file type restrictions, no server-side virus scanning, and high risk of memory exhaustion (DoS).
- **Secrets in Client Bundle**:
  - `GEMINI_API_KEY` was in `.env` and kept on the server.
  - However, client bundle contained plaintext admin verification fallback logic with default passwords.
- **Unauthenticated Routes Returning Data**:
  1. `GET /api/health`: Exposes server status and timestamp.
  2. `GET /api/config`: Exposes configuration keys.
  3. `POST /api/users/login`: Unauthenticated student creation/login.
  4. `GET /api/bikes`: Exposes all bikes **with raw owner PII** (phone number, enrollment number, academic course, full vehicle registration).
  5. `GET /api/bikes/:id`: Exposes single bike **with full owner contact details**.
  6. `GET /api/bikes/:id/availability`: Leaks entire booking conflict records (renter details, dates).
  7. `GET /api/bookings`: **CRITICAL DATA LEAK**. Allows anyone on the internet to list all campus bookings or query by student enrollment / ID without credentials.
  8. `GET /api/bookings/:id`: **CRITICAL DATA LEAK**. Allows anyone to inspect any booking ID, downloading full student PII and uploaded document Base64 images.
  9. `POST /api/bookings`: Allows unauthenticated booking submissions, creates users with dummy fallback data, and sets `verified: true`.
  10. `POST /api/owner/onboard`: Allows unauthenticated users to create bike listings and automatically escalate user roles to `owner`.
  11. `POST /api/verify-document`: Open Gemini OCR proxy endpoint callable by anyone without authentication or rate limits.
  12. `GET /api/pickup-locations`: Returns hub listings.

---

## 2. Shared Contract vs. Current API Gaps

| Contract Specification (`src/shared/contract.ts`) | Legacy API (`server.ts`) | Required Remediation |
| :--- | :--- | :--- |
| **Public Bike DTO**: Only public fields (`brand`, `model`, `year`, `hourlyRateInr`, `dailyRateInr`, `hubName`, `registrationMasked`). No owner PII. | Returns raw DB object with `ownerPhone`, `ownerEnrollment`, `ownerCourse`, unmasked `registrationNumber`. | Sanitize response through `PublicBikeDtoSchema`. |
| **Availability Check**: `{ available: boolean, reason?: string, blockedRanges?: [{ start, end }] }` | `{ available: boolean, conflicts: Booking[] }` returning full booking models. | Strip conflicts down to ISO time ranges only. |
| **Server-Computed Pricing**: `POST /api/pricing/calculate` computes duration, rental charge, platform fee, deposit from timestamps. | Accepts client-supplied `durationDays` and computes pricing in-line. | Provide dedicated pricing route and enforce server-side calculation on booking creation. |
| **Authentication**: Server-side sessions via `httpOnly` cookies (`/api/auth/otp/request`, `/api/auth/otp/verify`, `/api/auth/me`). | `POST /api/users/login` with Bearer tokens stored in `localStorage` or no auth at all. | Implement session store in DB with SHA-256 hashed session IDs and `httpOnly` cookies. |
| **Booking Ownership**: Students can view only their own bookings via `/api/bookings/my` and `/api/bookings/:id` with ownership verification. | Unauthenticated `GET /api/bookings` leaks all student reservations. | Require student session; restrict `/api/bookings/my` to `req.user.id`. |
| **Zero Aadhaar**: Strict prohibition of Aadhaar collection; only DL and Student ID. | Accepts, stores, and evaluates `aadharDoc` via Gemini. | Completely eliminate Aadhaar fields and database columns. |
| **Owner Onboarding**: Requires authenticated student session; does not auto-escalate permissions. | Public route; auto-assigns `role: 'owner'` and auto-verifies user. | Enforce `requireUser` and preserve student role until coordinator approval. |

---

## 3. Plan & Key Assumptions

### Plan
1. **Step 1: Persistence & Config**:
   - Implement `better-sqlite3` storage module behind a typed `db` interface with foreign keys, indexes (`bike_id + start_time + end_time`), and parameterized queries.
   - Setup migration scripts for SQLite (`server/database.ts` and `server/migrations/`).
   - Environment validation with Zod (`server/config/env.ts`) and sanitized `.env.example`.
2. **Step 2: Sessions, Security Headers & Middleware**:
   - Server-side session management (`sessions` table) storing SHA-256 hashes of random 256-bit crypto tokens.
   - `httpOnly`, `Secure` (in production), `SameSite=Lax` cookies for students (`rp_student_session`) and `Strict` for admins (`rp_admin_session`).
   - Middleware: `requireUser`, `requireAdmin`, `helmet`, strict CORS allowlist, CSRF protection, and centralized error handler without stack trace leaks.
3. **Step 3: Authorization & Data Exposure Fixes**:
   - Implement Public Bike DTO stripping all owner contact details and masking plates.
   - Enforce ownership on bookings: `GET /api/bookings/my` and `GET /api/bookings/:id`.
   - Protect availability endpoint to return only `{ available, reason?, blockedRanges? }`.
   - Prevent mass assignment on all update/write endpoints.
   - Require authenticated user on `POST /api/owner/onboard`.
4. **Step 4: Abuse & Cost Protection**:
   - Multi-tier rate limiting with `express-rate-limit` (global, auth, bookings, and Gemini).
   - Dedicated file upload handling with 5MB limit, magic-byte MIME validation (JPEG, PNG, WebP only), and body limit reduced to 100KB.
   - Hardened Gemini prompt with advisory-only outputs.
5. **Step 5: Booking Integrity**:
   - Atomic transaction for overlap check and booking creation.
   - Server-computed pricing ignoring client duration.
   - Booking state machine validation.
6. **Step 6: Audit Logging**:
   - Structured audit logs in `audit_logs` table (actor ID, role, action, target, IP, user-agent, diff; zero secrets or tokens).
7. **Step 7: Integration Tests**:
   - Vitest + Supertest integration tests covering authentication, authorization, availability privacy, mass-assignment rejection, atomic concurrency, and rate limiting.
