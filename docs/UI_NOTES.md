# Riders Path — UI Architecture & Design System Notes

This document provides a technical guide to the rebuilt student UI, design tokens, component library, API contract integration, and environment configurations.

---

## 1. Design Tokens & Styling

Defined in `src/styles/index.css` with dark theme default and light theme readiness:

### Color Palette
- **Canvas Base**: `#0a0a0a` (`bg-neutral-950`)
- **Surface Elevation**: `#141414` (`bg-neutral-900`), `#1e1e1e` (`bg-neutral-850`)
- **Border**: `#2e2e2e` (`border-neutral-800`), `#242424` (`border-neutral-850`)
- **Brand Accent**: `#f59e0b` (`amber-500`), `#d97706` (`amber-600`), `#fbbf24` (`amber-400`)
- **Status Tones**:
  - Success: `#052e16` / `#34d399` (`emerald-400`)
  - Warning: `#451a03` / `#fbbf24` (`amber-400`)
  - Danger: `#4c0519` / `#fb7185` (`rose-400`)
  - Info: `#083344` / `#22d3ee` (`cyan-400`)

### Typography
- **Heading**: `'Syne', sans-serif` (Bold editorial character, tracking-tight)
- **Body**: `'Plus Jakarta Sans', sans-serif` (High legibility, humanist geometry)
- **Code / Accents**: `'JetBrains Mono', monospace` (For rates, passcodes, plates, badges)

### Touch & Accessibility Standards
- **Minimum Interactive Target**: 44×44px (`min-h-[44px] min-w-[44px]`) on buttons, inputs, tabs, dropdowns, and close targets.
- **Focus Rings**: Accessible `focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2`.
- **Contrast**: WCAG 2.1 AA certified (text-to-background contrast >= 4.5:1).
- **Reduced Motion**: Honored globally via `@media (prefers-reduced-motion: reduce)`.
- **Screen Reader Alerts**: All errors and toast notifications emit via `aria-live="polite"` or `role="alert"`.

---

## 2. Reusable UI Components (`src/components/ui/`)

| Component | File | Key Features & Accessibility |
| :--- | :--- | :--- |
| **Button** | `Button.tsx` | Variants (`primary`, `secondary`, `outline`, `ghost`, `danger`), sizes, min 44px target, `isLoading` with spinner, `aria-busy`. |
| **Input** | `Input.tsx` | Associated `<label htmlFor={id}>`, `error` alert, `helperText`, `aria-invalid`, `aria-describedby`. |
| **Select** | `Select.tsx` | Native accessible `<select>` with custom styled chevron, accessible error states. |
| **DateTimePicker** | `DateTimePicker.tsx` | ISO string value management, localized datetime-local input, min/max guards. |
| **Card** | `Card.tsx` | Standard, elevated, and interactive variants with semantic headers and descriptions. |
| **Badge** | `Badge.tsx` | High-contrast status indicators in `default`, `success`, `warning`, `danger`, `info`, `accent`. |
| **Modal** | `Modal.tsx` | Accessible dialog with `role="dialog"`, `aria-modal="true"`, ESC key trap, scroll lock, backdrop click. |
| **Toast** | `Toast.tsx` | Provider & hook (`useToast()`), accessible region with `aria-live="polite"`, auto-dismiss countdown. |
| **Skeleton** | `Skeleton.tsx` | Accessible loading placeholder with `role="status"` and `aria-busy="true"`. |
| **EmptyState** | `EmptyState.tsx` | Clean empty state with icon, title, description, and primary CTA. |
| **ErrorState** | `ErrorState.tsx` | Accessible error banner with `role="alert"`, retry button, and clear message. |
| **Stepper** | `Stepper.tsx` | Multi-step progress indicator with `role="list"`, `aria-current="step"`, completed checkmarks. |

---

## 3. Switching Between Mock API and Real Backend

The API client (`src/api/client.ts`) centralizes all network operations. Components **never** call `fetch()` directly.

### Configuration via Environment Variables

To use the **Mock Layer** (enabled by default for development and testing):
```bash
# In .env or shell:
VITE_USE_MOCK_API=true
```

To switch to the **Hardened Real Backend**:
```bash
# In .env or production environment:
VITE_USE_MOCK_API=false
VITE_API_URL=https://your-hardened-backend.railway.app/api
```

### Security & Authentication Protocol
- **No localStorage Tokens**: Authentication relies entirely on `httpOnly` secure session cookies (`credentials: 'include'`). The frontend client stores zero access tokens or sensitive user credentials in `localStorage`.
- **Double Submit Protection**: Mutating actions (such as booking creation and owner onboarding) automatically attach a unique `Idempotency-Key` header and disable submit buttons during flight.
- **Server-Side Pricing**: Rental charges, platform fees, and deposit calculations are computed exclusively by the server/mock layer (`/pricing/calculate`) and verified at booking time.
- **Zero Browser AI Calls**: No Gemini SDK or AI Studio secrets are embedded in or called from the client bundle.

---

## 4. Key Assumptions & Config (`src/config/platform.config.ts`)

1. **Campus**: ICFAI Foundation for Higher Education (IFHE), Hyderabad.
2. **Allowed Email Domain**: `@icfaiuniversity.in` (configurable in `platform.config.ts`).
3. **Enrollment Number Format**: RegEx `^[0-9]{2}[A-Za-z]{2,4}[0-9]{3,6}$` (e.g. `21BSPH0412`).
4. **Deposit Options**:
   - Laptop deposit (physical working laptop handed to coordinator at key pickup).
   - Cash hub deposit (₹1,500 refundable security deposit).
5. **No Aadhaar Policy**: Aadhaar collection is completely eliminated to protect student privacy and comply with UIDAI regulations. Verification requires only physical ICFAI Student ID Card + State Two-Wheeler Driving Licence.
6. **Admin Dashboard**: Admin coordination screens are prepared for deployment as an isolated, authenticated workspace under `apps/admin` or guarded admin routes.
