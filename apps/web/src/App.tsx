import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { ToastProvider } from './components/ui/Toast';
import { AuthProvider } from './context/AuthContext';
import { Navbar } from './components/layout/Navbar';
import { Footer } from './components/layout/Footer';
import { AuthModal } from './components/auth/AuthModal';
import { Skeleton } from './components/ui/Skeleton';
import { PageMetadata } from './components/layout/PageMetadata';
import { LandingPage } from './pages/LandingPage';

// Lazy-loaded routes for optimal bundle splitting and performance
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
const SignInPage = lazy(() =>
  import('./pages/SignInPage').then((m) => ({ default: m.SignInPage }))
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

export const AppRoutes: React.FC = () => {
  const location = useLocation();
  const backgroundLocation = (location.state as { backgroundLocation?: ReturnType<typeof useLocation> } | null)
    ?.backgroundLocation;

  return (
    <ToastProvider>
      <AuthProvider>
        <PageMetadata noIndex={['/my-bookings', '/owner', '/signin'].includes(location.pathname)} />
        <div className="min-h-screen flex flex-col bg-neutral-950 text-neutral-100 selection:bg-amber-500 selection:text-slate-950">
          <Navbar />

          <main className="flex-1 flex flex-col">
            <Suspense fallback={<PageLoadingFallback />}>
              <Routes location={backgroundLocation || location}>
                <Route path="/" element={<LandingPage />} />
                <Route path="/browse" element={<BrowseBikesPage />} />
                <Route path="/bikes/:id" element={<BikeDetailPage />} />
                <Route path="/book/:id" element={<BookingFlowPage />} />
                <Route path="/my-bookings" element={<MyBookingsPage />} />
                <Route path="/owner" element={<OwnerOnboardPage />} />
                <Route path="/signin" element={<SignInPage />} />
                <Route path="/how-it-works" element={<LandingPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/refund-policy" element={<RefundPolicyPage />} />
                <Route path="/safety" element={<SafetyPage />} />
                <Route path="/faq" element={<LandingPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
              {backgroundLocation && (
                <Routes>
                  <Route path="/signin" element={<SignInPage />} />
                </Routes>
              )}
            </Suspense>
          </main>

          <Footer />
          <AuthModal />
        </div>
      </AuthProvider>
    </ToastProvider>
  );
};

export const App: React.FC = () => (
  <BrowserRouter>
    <AppRoutes />
  </BrowserRouter>
);

export default App;
