# Riders Path — Backend API Specification & Contract

This document provides a comprehensive technical catalog of all HTTP API endpoints implemented in the hardened Riders Path Express backend (`server.ts`).

---

## 1. Security & Authentication Architecture

### 1.1 Session Storage & Cookies
- **Student Sessions (`rp_student_session`)**:
  - Issued upon successful email OTP verification or development login.
  - Stored as cryptographically random 256-bit hex tokens (`crypto.randomBytes(32)`).
  - Stored in SQLite as SHA-256 hashes (`sessions` table) to prevent token theft from database backups.
  - Delivered via `httpOnly`, `SameSite=Lax`, and `Secure` (production) cookies with 7-day expiration.
- **Admin Sessions (`rp_admin_session`)**:
  - Issued upon administrative credential verification.
  - Strictly separated from student sessions. Student sessions can **never** access admin endpoints, and admin sessions cannot pose as student renters.
  - Delivered via `httpOnly`, `SameSite=Strict`, and `Secure` (production) cookies with 24-hour expiration.

### 1.2 Defense-in-Depth Middleware
- **Security Headers (`helmet`)**: Content Security Policy (restricting scripts, fonts, images), frameguard, noSniff, and XSS filter.
- **CORS Allowlist**: Strictly checked against `CORS_ORIGIN` env variable with support for local dev origins (`http://localhost:5173`, `http://localhost:3000`).
- **CSRF Verification**: State-changing requests (`POST`, `PUT`, `DELETE`, `PATCH`) require matching `Origin` or `Referer` headers when called with browser credentials.
- **Tiered Rate Limiting (`express-rate-limit`)**:
  - Global API: 300 requests / 15 minutes per IP.
  - Authentication (`/api/auth/*`, `/api/admin/login`): 10 requests / 15 minutes per IP.
  - OTP Dispatch (`/api/auth/otp/request`): 3 requests / 5 minutes per IP.
  - Booking Creation (`POST /api/bookings`): 10 requests / 15 minutes per student.
  - Document Uploads & Gemini AI: 5 requests / 15 minutes per IP.
- **Payload Limits**: JSON and URL-encoded bodies capped at 100 KB. Multipart uploads capped at 5 MB across max 2 files.
- **Magic-Byte MIME Validation**: Multer disk storage validates actual file headers (JPEG `FF D8 FF`, PNG `89 50 4E 47`, WebP `52 49 46 46`), instantly deleting disguised executables or scripts.

---

## 2. API Endpoints Catalog

### 2.1 System & Configuration

#### `GET /api/health`
Checks server health, uptime, and database connectivity.
- **Auth**: Public
- **Response `200 OK`**:
```json
{
  "status": "healthy",
  "version": "2.0.0",
  "environment": "development",
  "timestamp": "2026-10-04T13:30:00.000Z",
  "database": {
    "connected": true,
    "activeBookings": 12,
    "activeBikes": 8
  }
}
```

#### `GET /api/config`
Returns safe, non-sensitive platform configurations (campus hubs, email domain, terms version, deposit policy). Contains **zero** secrets or server tokens.
- **Auth**: Public
- **Response `200 OK`**:
```json
{
  "campusName": "ICFAI Foundation for Higher Education, Hyderabad",
  "allowedEmailDomain": "icfaiuniversity.in",
  "hubs": [
    {
      "id": "hub_main_gate",
      "name": "Main Campus Gate (Gate 1)",
      "description": "24/7 security guard post opposite ICFAI Bus Bay",
      "landmark": "Near Security Booth & ATM kiosk"
    }
  ],
  "depositPolicy": {
    "standardAmountInr": 1500,
    "laptopOptionDescription": "Hold student laptop / tablet at campus hub lockers during ride",
    "platformFeePercent": 8
  },
  "currentTermsVersion": "v2.1-campus-2026"
}
```

---

### 2.2 Authentication & User Profile

#### `POST /api/auth/otp/request`
Requests a 6-digit numeric OTP sent to an official ICFAI email address.
- **Auth**: Public (Rate-limited: 3 req / 5 min)
- **Request Body**:
```json
{
  "email": "student@icfaiuniversity.in"
}
```
- **Response `200 OK`**:
```json
{
  "success": true,
  "message": "A 6-digit verification code has been dispatched to student@icfaiuniversity.in."
}
```
*(Uniform response returned whether the user already exists or not to prevent account enumeration attacks).*

#### `POST /api/auth/otp/verify`
Verifies the 6-digit code and establishes an httpOnly session.
- **Auth**: Public
- **Request Body**:
```json
{
  "email": "student@icfaiuniversity.in",
  "code": "123456"
}
```
- **Set-Cookie**: `rp_student_session=<token>; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`
- **Response `200 OK`**:
```json
{
  "requiresProfileCompletion": false,
  "user": {
    "id": "usr_94bca28014",
    "name": "Suhash Reddy",
    "email": "suhash.reddy@icfaiuniversity.in",
    "phone": "+91 98480 11223",
    "enrollmentNumber": "21BSPH0101",
    "course": "B.Tech CSE",
    "year": "3rd Year",
    "isVerified": true,
    "createdAt": "2026-10-04T10:00:00.000Z"
  }
}
```

#### `POST /api/auth/dev-login`
Development-only login bypass helper. **Permanently disabled and returns 404 when `NODE_ENV=production`**.
- **Auth**: Public (Dev/Test only)
- **Request Body**:
```json
{
  "enrollment": "21BSPH0101",
  "email": "student@icfaiuniversity.in",
  "fullName": "Suhash Reddy"
}
```
- **Response `200 OK`**:
```json
{
  "success": true,
  "token": "a1f9408e...",
  "user": { ... }
}
```

#### `GET /api/auth/me`
Retrieves currently authenticated student's profile.
- **Auth**: Student Session Cookie
- **Response `200 OK`**: User profile object
- **Errors**: `401 Unauthorized` if session is missing, invalid, or expired.

#### `PUT /api/auth/profile`
Updates profile information with strict validation. Rejects mass-assignment of `role`, `id`, `passwordHash`, or admin flags.
- **Auth**: Student Session Cookie
- **Request Body**:
```json
{
  "name": "Suhash Reddy",
  "enrollmentNumber": "21BSPH0101",
  "phone": "9848011223",
  "course": "B.Tech CSE",
  "year": "3rd Year"
}
```
- **Response `200 OK`**: Updated profile object.

#### `POST /api/auth/logout`
Destroys session in database and clears the session cookie.
- **Auth**: Public / Student Session
- **Response `200 OK`**: `{"success": true, "message": "Logged out successfully"}`

---

### 2.3 Administration Authentication

#### `POST /api/admin/login`
Authenticates campus fleet staff using bcrypt salted password verification.
- **Auth**: Public (Strictly rate-limited: 10 req / 15 min)
- **Request Body**:
```json
{
  "username": "admin",
  "password": "admin123!Safe"
}
```
- **Set-Cookie**: `rp_admin_session=<token>; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`
- **Response `200 OK`**: `{"success": true, "message": "Admin authenticated successfully"}`
- **Errors**: `401 Unauthorized` on wrong credentials.

#### `POST /api/admin/logout`
Revokes admin session and clears `rp_admin_session` cookie.
- **Auth**: Admin Session Cookie
- **Response `200 OK`**: `{"success": true, "message": "Admin session closed"}`

---

### 2.4 Vehicles & Availability

#### `GET /api/bikes`
Public catalog of approved, available campus bikes.
- **Auth**: Public
- **Query Parameters**:
  - `q`: Search term (matches brand, model)
  - `bikeType`: Filter (`scooter`, `commuter`, `sports`, `cruiser`, `electric`)
  - `fuelType`: Filter (`petrol`, `electric`)
  - `hubId`: Filter by campus hub (`hub_main_gate`, `hub_block_c`, `hub_hostel_circus`)
  - `maxHourlyRate`: Maximum price in INR
  - `sortBy`: `price_asc`, `price_desc`, `rating`
- **Data Protection**: Strips owner phone number, owner enrollment, course, and raw registration plate. Returns `registrationMasked` (e.g. `TS08-****`).
- **Response `200 OK`**: Array of `PublicBikeDto`.

#### `GET /api/bikes/:id`
Retrieves public details for a single vehicle.
- **Auth**: Public
- **Response `200 OK`**: `PublicBikeDto`
- **Errors**: `404 Not Found` if vehicle does not exist.

#### `GET /api/bikes/:id/availability`
Live real-time availability check for a specific vehicle and date window.
- **Auth**: Public
- **Query Parameters**: `startTime` (ISO-8601), `endTime` (ISO-8601)
- **Data Protection**: **Never** returns booking objects, student names, or contact details. Returns only blocked date ranges.
- **Response `200 OK`**:
```json
{
  "available": false,
  "reason": "Selected vehicle is already reserved for this duration at campus hub",
  "blockedRanges": [
    {
      "start": "2026-10-10T10:00:00.000Z",
      "end": "2026-10-10T14:00:00.000Z",
      "reason": "Reserved by another student"
    }
  ]
}
```

---

### 2.5 Pricing Engine

#### `POST /api/pricing/calculate`
Calculates authoritative, tamper-proof rental charges and platform fees.
- **Auth**: Public
- **Request Body**:
```json
{
  "bikeId": "bike-ather-450x",
  "startTime": "2026-10-10T10:00:00.000Z",
  "endTime": "2026-10-10T14:00:00.000Z",
  "depositType": "laptop"
}
```
- **Response `200 OK`**:
```json
{
  "durationHours": 4,
  "rentalChargeInr": 260,
  "platformFeeInr": 21,
  "depositInr": 0,
  "depositType": "laptop",
  "totalPayableAtHandoverInr": 281,
  "isServerCalculated": true
}
```

---

### 2.6 Bookings Management

#### `POST /api/bookings`
Reserves a bike for a campus student.
- **Auth**: Student Session Cookie (Rate-limited: 10 req / 15 min)
- **Concurrency & Integrity**:
  - Computes pricing and duration strictly on the server from timestamps; client duration and price fields are discarded.
  - Executes inside an atomic SQLite transaction with an overlap check.
  - Idempotency key prevents double submissions.
  - Active reservation cap of 3 bookings per student.
- **Request Body**:
```json
{
  "bikeId": "bike-ather-450x",
  "startTime": "2026-10-10T10:00:00.000Z",
  "endTime": "2026-10-10T14:00:00.000Z",
  "pickupHubId": "hub_block_c",
  "depositType": "laptop",
  "drivingLicenceImage": "/uploads/documents/dl_scan.jpg",
  "studentIdCardImage": "/uploads/documents/id_scan.jpg",
  "agreedToTermsVersion": "v2.1-campus-2026",
  "idempotencyKey": "idemp_b72948ca-9182"
}
```
- **Response `201 Created`**: Complete booking pass with `handoverCode` and `qrPassCode`.
- **Errors**:
  - `400 Bad Request`: Validation failure, pickup time in past, or active booking limit exceeded.
  - `409 Conflict`: Bike was just reserved by another student for those dates.

#### `GET /api/bookings/my`
Retrieves the logged-in student's personal bookings. Derives student ID strictly from session token.
- **Auth**: Student Session Cookie
- **Response `200 OK`**: Array of `BookingResponse` records belonging to the authenticated student.

#### `GET /api/bookings/:id`
Retrieves a specific booking record.
- **Auth**: Student Session Cookie or Admin Session Cookie
- **Authorization**: Students can **only** access their own bookings. Accessing another student's booking returns `403 Forbidden`.
- **Response `200 OK`**: `BookingResponse`
- **Errors**: `404 Not Found`, `403 Forbidden`.

#### `POST /api/bookings/:id/cancel`
Cancels an unconfirmed or active booking.
- **Auth**: Student Session Cookie
- **State Machine Protection**: Bookings already `CANCELLED`, `COMPLETED`, or `REJECTED` cannot be cancelled again.
- **Request Body**:
```json
{
  "reason": "Lecture timetable rescheduled"
}
```
- **Response `200 OK`**: Updated booking record with `status: "CANCELLED"`.
- **Errors**: `400 Bad Request` on invalid state transition.

---

### 2.7 Peer Owner Vehicle Onboarding

#### `POST /api/owner/onboard`
Submits a student's personal two-wheeler for campus peer-rental listing.
- **Auth**: Student Session Cookie (Rate-limited: 5 req / 15 min)
- **Security**: The listing is initially marked `PENDING_APPROVAL` with `availabilityStatus: "UNAVAILABLE"`. Public users cannot view or book it until verified and approved by campus fleet admin. The user's role is updated to `owner` safely without granting admin permissions.
- **Request Body**: `OwnerOnboardingSchema` (brand, model, year, rates, images, RC document, insurance document, payout UPI ID).
- **Response `201 Created`**: New bike record.

#### `GET /api/owner/listings`
Returns vehicle listings submitted by the authenticated student owner.
- **Auth**: Student Session Cookie
- **Response `200 OK`**: Array of owner's vehicles with unmasked plates and approval status.

---

### 2.8 Document Verification & AI Advisory

#### `POST /api/upload/documents`
Secure multipart file upload for Driving Licence and Student ID scans.
- **Auth**: Student Session Cookie
- **Form Data**: `files` (Max 2 files, max 5MB each).
- **Security Inspection**: Magic bytes checked; non-image files are deleted immediately from disk.
- **Response `200 OK`**:
```json
{
  "success": true,
  "files": [
    {
      "originalName": "dl.jpg",
      "path": "/uploads/documents/doc-1728045600000-98471283.jpg",
      "size": 412582,
      "mimetype": "image/jpeg"
    }
  ]
}
```

#### `POST /api/verify-document`
Submits uploaded document to Gemini Vision AI for advisory pre-validation.
- **Auth**: Student Session Cookie (Rate-limited: 5 req / 15 min)
- **Security Controls**:
  - System prompt instructs AI to ignore any malicious instructions inside images (prompt injection defense).
  - AI output is structured and schema-validated.
  - AI verdict is **strictly advisory**: does not auto-approve user verification without human campus fleet desk sign-off.
- **Request Body**:
```json
{
  "documentType": "DRIVING_LICENCE",
  "documentUrl": "/uploads/documents/doc-1728045600000-98471283.jpg"
}
```
- **Response `200 OK`**:
```json
{
  "decision": "VALID",
  "confidence": 0.94,
  "confidenceScore": 94,
  "extractedData": {
    "name": "Suhash Reddy",
    "documentNumber": "DL-08-20210091823"
  },
  "flags": [],
  "isAdvisoryOnly": true,
  "reviewRequired": false
}
```

---

### 2.9 Fleet Administration

#### `GET /api/bikes/all`
Returns all registered campus vehicles, including unapproved and inactive listings.
- **Auth**: Admin Session Cookie (`rp_admin_session`)
- **Response `200 OK`**: Array of all bikes.

#### `POST /api/admin/bikes/:id/approve`
Approves a student owner's pending vehicle listing.
- **Auth**: Admin Session Cookie
- **Request Body**:
```json
{
  "approvalStatus": "APPROVED",
  "conditionNotes": "Physical inspection verified at Gate 1; battery and tyres confirmed."
}
```
- **Response `200 OK`**: Updated bike record.
- **Audit**: Writes entry to `audit_logs` table.

#### `GET /api/admin/actions`
Retrieves immutable system audit logs.
- **Auth**: Admin Session Cookie
- **Response `200 OK`**:
```json
[
  {
    "id": 1,
    "timestamp": "2026-10-04T12:00:00.000Z",
    "actorId": "usr_system_admin",
    "actorRole": "admin",
    "action": "ADMIN_LOGIN_SUCCESS",
    "targetType": "auth",
    "targetId": "admin",
    "ipAddress": "127.0.0.1",
    "userAgent": "Mozilla/5.0..."
  }
]
```
