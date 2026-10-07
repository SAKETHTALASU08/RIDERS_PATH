# Riders Path — UI & Frontend Audit Report

## 1. Architectural & Codebase Inventory

### Framework & Libraries
- **UI Framework**: React 19 (`react` 19.0.1, `react-dom` 19.0.1).
- **Build Tool**: Vite 6 (`vite` 6.2.3, `@vitejs/plugin-react` 5.0.4).
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite`, `tailwindcss` 4.1.14) with custom typography imported via Google Fonts: *Syne* (display/headings), *Plus Jakarta Sans* (body), and *JetBrains Mono* (labels/codes).
- **Icons**: Lucide React (`lucide-react` 0.546.0).
- **Animation**: Motion (`motion` 12.23.24).
- **Data Validation & Typing**: Added `zod` for API contracts and request/response validation.
- **Testing**: Added `vitest`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`, and `axe-core`.

### Routing Architecture
- **Current State**: Monolithic state-driven switch statement (`currentView` string state: `'home'`, `'bikes'`, `'bike-details'`, `'book'`, `'booking-status'`, `'student-dashboard'`, `'onboard'`, `'how-it-works'`, `'faq'`, `'terms'`, `'contact'`, `'admin'`).
- **Deficiencies**:
  - No HTML5 History API integration; URLs never change.
  - Page reload resets the user back to the home view, losing user context.
  - No deep-linking support (cannot share link to a specific bike or booking pass).
  - Browser back/forward navigation is completely broken.

### State Management
- **Current State**: Scattered `useState` in root component with prop drilling and an ad-hoc React Context (`createContext`).
- **Deficiencies**: Auth tokens (`rp_student_token`, `rp_admin_token`) and full student profile records (`rp_student_user`) are persisted insecurely in `localStorage`.

### API Communication Pattern
- **Current State**: Unabstracted `fetch()` calls scattered across components with string concatenation (`${API_BASE}/bikes`, `${API_BASE}/bookings`, etc.).
- **Deficiencies**:
  - Direct token extraction via `localStorage.getItem()`.
  - No typed schemas or response runtime validation.
  - No request cancellation, timeout handling, retry logic, or idempotency headers to prevent duplicate operations.

### Pages & Components
1. **Landing View (`home`)**: Hero section, 3-step value prop, safety banners, featured bikes, campus hubs overview, FAQs, footer.
2. **Catalog View (`bikes`)**: Search input, category/fuel filters, price range slider, pickup hub selector, bike card grid.
3. **Bike Detail View (`bike-details`)**: Image carousel/gallery, bike specifications, location info, pricing details, direct booking trigger.
4. **Booking Stepper (`book`)**: Multi-step modal/view for rental dates, hub selection, document uploads, deposit consent, and review.
5. **Booking Pass View (`booking-status`)**: Digital handover pass with QR code placeholder, reservation details, security deposit reminder.
6. **Student Dashboard (`student-dashboard`)**: Active bookings list, booking status badges, past rentals, listed bikes tab.
7. **Owner Onboarding (`onboard`)**: Vehicle listing form (make, model, year, registration, photos, rental pricing, pickup hub).
8. **Static Pages**: `how-it-works`, `faq`, `terms`, `contact`.
9. **Admin Views**: Admin login modal and dashboard (`Ly`, `_y`, `Hy`, `By`, `zy` tabs for bookings, verifications, approvals, user lists, platform settings).

### User-Supplied Content Rendering
- Bike listing details: make, model, owner notes, mileage, registration number.
- Student profile data: renter name, enrollment number, phone number.
- Admin feedback: rejection explanations, review notes, inspection comments.
- **Rendering mechanism**: JSX text nodes (safe from raw HTML injection), but without content sanitization or proper length trimming.

---

## 2. Issues: UX, Accessibility, Responsiveness & Security

### Security & Privacy
1. **Illegal / High-Risk Aadhaar Collection**:
   - The original code requested students to upload Aadhaar card scans and enter Aadhaar details.
   - *Impact*: Under the Aadhaar Act (Section 29) and Supreme Court rulings in India, private entities and student platforms without statutory backing cannot collect, store, or demand unmasked Aadhaar documents.
   - *Fix*: Remove all Aadhaar fields and requests. Only collect institutional Student ID card and State Two-Wheeler Driving Licence.
2. **Insecure Storage of Auth Tokens in `localStorage`**:
   - `localStorage` holds `rp_student_token` and `rp_admin_token`. Any XSS vector or browser extension can exfiltrate tokens.
   - *Fix*: Auth must use `httpOnly` secure cookies. Client memory never stores raw credentials or long-lived tokens in localStorage.
3. **Sensitive PII Leakage in Public DTOs**:
   - Original bike responses exposed owner phone numbers, vehicle registration numbers, and student enrollment numbers before any booking was confirmed.
   - *Fix*: Strict Public Bike DTO stripping owner contact, full registration, and enrollment numbers.
4. **Double-Submit / Race Conditions**:
   - Booking creation and listing submissions lacked idempotency keys or click debounce, allowing duplicate bookings or duplicate charges.
   - *Fix*: Client-generated idempotency keys (`Idempotency-Key` header) and disabling submit buttons during flight.

### Copy & Compliance (Overstated Verification)
1. **Misleading Marketing Claims**:
   - Copy claimed "100% Verified rides", "Campus Verified Fleet", and "Instant Official Verification".
   - In reality, verifications are manual peer audits conducted by student coordinators without access to official RTO/police or university registrar APIs.
   - *Fix*: Replace with transparent, accurate wording: *"Student Coordinator Inspected"*, *"Campus Community Verified"*, *"Physical Handover Checklist"*.

### Accessibility (WCAG 2.1 AA)
1. **Missing Form Labels**: Inputs frequently lacked `<label for="...">` associations, relying on floating text or placeholder text.
2. **Poor Contrast**: `text-neutral-500` and `text-neutral-600` on `bg-neutral-950` fall below 4.5:1 contrast ratio.
3. **Screen Reader Blindness**: Dynamic error messages, status alerts, and toast banners lacked `aria-live="polite"` or `role="alert"`.
4. **Interactive Target Sizes**: Action icons and calendar day buttons were smaller than the 44×44px minimum touch target size.
5. **Keyboard Focus**: Missing visible `focus-visible` outline rings on buttons, custom dropdowns, and modal close triggers.
6. **Motion Sensitivity**: Animations lacked `@media (prefers-reduced-motion)` suppression.

### Responsiveness & Mobile UX
1. **Desktop-Centric Grids**: Multi-column grids failed gracefully on narrow screens (< 380px), causing text truncation and broken layouts.
2. **Horizontal Overflow**: Date range selectors and spec tables introduced horizontal scrolling on mobile viewports.

---

## 3. Plan & Key Assumptions

### Plan
- **Step 1**: Implement `src/shared` contract (Zod schemas, DTOs, error shapes) and typed API client (`src/api/client.ts`) with toggleable mock layer (`src/api/mock.ts`).
- **Step 2**: Build modular Design System tokens & accessible components (`Button`, `Input`, `Select`, `DateTimePicker`, `Card`, `Badge`, `Modal`, `Toast`, `Skeleton`, `EmptyState`, `ErrorState`, `Stepper`).
- **Step 3**: Rebuild all Student-Facing screens (Landing, Email OTP Auth, Catalog & Filters, Bike Detail & Live Availability, Booking Stepper with Server Pricing & DL/ID Upload, My Bookings Timeline, Owner Onboarding & Earnings, Static Policy Pages).
- **Step 4**: Enforce quality standards (responsive 360px+, accessibility with axe, vitest component tests, double submit prevention, SEO metadata, `docs/UI_NOTES.md`).

### Assumptions & Configuration (`src/config/platform.config.ts`)
- **Institution**: ICFAI Foundation for Higher Education (IFHE), Hyderabad.
- **Allowed Email Domains**: unset in the repository; configure the actual domain(s) with `ALLOWED_EMAIL_DOMAINS`. OTP requests fail closed until configured.
- **Student Enrollment Number Format**: configurable with `ENROLLMENT_FORMAT_REGEX`; the permissive default is a documented placeholder, not an official format.
- **Security Deposit**: Refundable security deposit (laptop or hub deposit) held during rental; payment is offline *"Pay at Handover"*.
- **Required Documents**: Valid Indian Driving Licence (Two-Wheeler) + Physical ICFAI Student ID Card. NO Aadhaar.
