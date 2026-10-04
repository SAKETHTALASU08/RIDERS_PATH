import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ToastProvider } from './components/ui/Toast';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { AuthModal } from './components/auth/AuthModal';
import { Skeleton } from './components/ui/Skeleton';

// Lazy-loaded routes for optimal bundle splitting and performance
const LandingPage = lazy(() =>
  import('./pages/LandingPage').then((m) => ({ default: m.LandingPage }))
);
const BrowseBikesPage = lazy(() =>
  import('./pages/BrowseBikesPage').then((m) => ({ default: m.BrowseBikesPage }))
);
const BikeDetailPage = lazy(() =>
  import('./pages/BikeDetailPage').then((m) => ({ default: m.BikeDetailPage }))
);
const BookingFlowPage = lazy(() =>
  import('./pages/BookingFlowPage').then((m) => ({ default: m.BookingFlowPage }))
);
const MyBookingsPage = lazy(() =>
  import('./pages/MyBookingsPage').then((m) => ({ default: m.MyBookingsPage }))
);
const OwnerOnboardPage = lazy(() =>
  import('./pages/OwnerOnboardPage').then((m) => ({ default: m.OwnerOnboardPage }))
);
const TermsPage = lazy(() =>
  import('./pages/StaticPages').then((m) => ({ default: m.TermsPage }))
);
const PrivacyPage = lazy(() =>
  import('./pages/StaticPages').then((m) => ({ default: m.PrivacyPage }))
);
const RefundPolicyPage = lazy(() =>
  import('./pages/StaticPages').then((m) => ({ default: m.RefundPolicyPage }))
);
const SafetyPage = lazy(() =>
  import('./pages/StaticPages').then((m) => ({ default: m.SafetyPage }))
);
const NotFoundPage = lazy(() =>
  import('./pages/StaticPages').then((m) => ({ default: m.NotFoundPage }))
);

const PageLoadingFallback: React.FC = () => (
  <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12 w-full flex flex-col gap-6">
    <Skeleton height={48} width="35%" rounded="xl" />
    <Skeleton height={200} rounded="2xl" />
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Skeleton height={180} rounded="xl" />
      <Skeleton height={180} rounded="xl" />
      <Skeleton height={180} rounded="xl" />
    </div>
  </div>
);

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <div className="min-h-screen flex flex-col bg-neutral-950 text-neutral-100 selection:bg-amber-500 selection:text-neutral-950">
            <Navbar />

            <main className="flex-1 flex flex-col">
              <Suspense fallback={<PageLoadingFallback />}>
                <Routes>
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/browse" element={<BrowseBikesPage />} />
                  <Route path="/bikes/:id" element={<BikeDetailPage />} />
                  <Route path="/book/:id" element={<BookingFlowPage />} />
                  <Route path="/my-bookings" element={<MyBookingsPage />} />
                  <Route path="/owner" element={<OwnerOnboardPage />} />
                  <Route path="/how-it-works" element={<LandingPage />} />
                  <Route path="/terms" element={<TermsPage />} />
                  <Route path="/privacy" element={<PrivacyPage />} />
                  <Route path="/refund-policy" element={<RefundPolicyPage />} />
                  <Route path="/safety" element={<SafetyPage />} />
                  <Route path="/faq" element={<LandingPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            </main>

            <Footer />
            <AuthModal />
          </div>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
};

export default App;
