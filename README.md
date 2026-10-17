# 🏍️ Riders Path — Campus Bike Rental & Management Platform

A full-stack, secure campus bike rental ecosystem built with **React**, **Express**, **SQLite**, and **TypeScript**. Features a dedicated **Student Portal** for exploring and booking bikes with secure document uploads, and an **Admin Portal** for fleet control, document verification, and booking management.

---

## 🌟 Key Features

### 🎓 Student Rider Portal
- **Browse Fleet**: Explore verified campus bikes with specifications, hourly/daily rates, and real-time availability.
- **Booking Flow**: Dynamic date/time picker, automated server-computed pricing calculation, and pickup scheduling.
- **Secure Document Upload**: Upload required documents (Driving License, Student ID, Aadhaar) with client and server-side validation.
- **UPI QR Code Payment**: Integrated payment flow with display of dynamic/static UPI QR code for seamless transactions.
- **My Bookings Dashboard**: Track active, upcoming, and past booking requests with live status updates and document previews.
- **Email OTP Authentication**: Passwordless, secure OTP verification over SMTP (Gmail).

### 🛡️ Admin Management Portal
- **Two-Tab Management**: Streamlined view dedicated to **Bookings** and **Fleet Management**.
- **Booking Reviews**: Approve or reject booking requests with single-click actions and review notes.
- **Document Previews & Lightbox**: Direct thumbnail preview of user-uploaded verification documents per booking with high-resolution modal inspection.
- **Fleet Control**: Add, inspect, and toggle bike availability (`AVAILABLE` / `UNAVAILABLE`) instantly.
- **Audit Trails**: Security logs recording administrative actions, logins, and status transitions.

---

## 🏗️ Architecture & Tech Stack

```text
RIDERS_PATH/
├── apps/
│   ├── web/            # Student Rider Portal (React + Vite + Tailwind CSS)
│   └── admin/          # Admin Operations Portal (React + Vite + Tailwind CSS)
├── packages/
│   └── shared/         # Shared TypeScript schemas, Zod contracts & DTOs
├── server/             # Express server, SQLite DB, auth, rate limiting & storage
├── server.ts           # Main backend entry point
├── dist/               # Production build output
├── vercel.json         # Vercel deployment config for Student Portal
└── vercel.admin.json   # Vercel deployment config for Admin Portal
```

- **Frontend**: React 19, Vite, Tailwind CSS, Lucide Icons, Motion
- **Backend**: Express, TypeScript, Better-SQLite3, Multer, Helmet, Sharp
- **Security**: AES-256 encrypted private document storage, CSRF cookies, HMAC session signing, strict rate limiting, bcryptjs

---

## 🚀 Getting Started Locally

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or v20+ recommended)
- `npm`

### 1. Clone & Install
```bash
git clone https://github.com/SAKETHTALASU08/RIDERS_PATH.git
cd RIDERS_PATH
npm install
```

### 2. Environment Configuration
Create a `.env` file in the root directory (refer to `.env.example`):

```env
PORT=3000
NODE_ENV=development
DATABASE_PATH=riders_path.db

SESSION_SECRET=your_32_char_random_session_secret
OTP_HMAC_SECRET=your_32_char_random_otp_secret
DOCUMENT_STORAGE_DRIVER=local
DOCUMENT_ENCRYPTION_KEY=a99MOIQiZZ19lq0iFAiPu2/qEBEVqN+LJXGhmgEWiO8=

# Admin Login Credentials
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2a$10$wE6O6Rkm3y1rV7YVp5QeEeZcK/25K4V5f0E4y39mO54kG8Fw6p3jS

# SMTP Configuration for OTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=riderspath.210help@gmail.com
SMTP_PASS=your_16_char_google_app_password
MAIL_FROM="Riders Path" <riderspath.210help@gmail.com>
```

### 3. Run Development Servers
You can run the full stack simultaneously or individually:

- **Run Backend API**:
  ```bash
  npm run dev
  # Runs API at http://localhost:3000
  ```

- **Run Student Portal**:
  ```bash
  npm run dev:web
  # Runs at http://localhost:5173
  ```

- **Run Admin Portal**:
  ```bash
  npm run dev:admin
  # Runs at http://localhost:5174
  ```

---

## 📦 Production Build

```bash
# Build all apps & bundle backend
npm run build

# Or build individually
npm run build:web    # Builds apps/web -> dist/web
npm run build:admin  # Builds apps/admin -> dist/admin
```

---

## 🌐 Deployment

### 1. Backend API (Render / Railway / VPS)
- **Build Command**: `npm install && npm run build`
- **Start Command**: `node dist/server.cjs`
- Configure environment variables listed above.

### 2. Student & Admin Portals (Vercel)
- **Student Portal**:
  - Root: `./`
  - Build Command: `npm install && npm run build:web`
  - Output Directory: `dist/web`
- **Admin Portal**:
  - Root: `./`
  - Build Command: `npm install && npm run build:admin`
  - Output Directory: `dist/admin`

*Note: Update the proxy target in `vercel.json` and `vercel.admin.json` to point `/api/*` to your live backend URL.*

---

## 📄 License
This project is developed for educational and campus mobility management. All rights reserved.
