import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LockKeyhole } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';

interface SignInLocationState {
  backgroundLocation?: { pathname: string; search?: string; hash?: string };
  returnTo?: string;
  fallbackTo?: string;
}

export const SignInPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isLoading, isAuthModalOpen, openAuthModal, closeAuthModal } = useAuth();
  const [opened, setOpened] = useState(false);
  const state = location.state as SignInLocationState | null;
  const returnTo = state?.returnTo || '/browse';
  const fallbackTo = state?.fallbackTo || '/browse';

  useEffect(() => {
    if (isLoading) return;
    if (user?.emailVerified && user.profileComplete) {
      closeAuthModal();
      navigate(returnTo, { replace: true, state: null });
      return;
    }
    if (!opened) {
      setOpened(true);
      openAuthModal();
      return;
    }
    if (!isAuthModalOpen) navigate(fallbackTo, { replace: true, state: null });
  }, [closeAuthModal, fallbackTo, isAuthModalOpen, isLoading, navigate, openAuthModal, opened, returnTo, user]);

  return (
    <section className="w-full max-w-xl mx-auto px-4 py-16 text-center">
      <LockKeyhole className="w-10 h-10 text-amber-400 mx-auto mb-4" aria-hidden="true" />
      <h1 className="text-2xl font-bold text-neutral-100">Sign in to continue</h1>
      <p className="mt-2 text-sm text-neutral-400">
        Verify your email to continue. Your current booking step will be waiting when you return.
      </p>
      <Button className="mt-6" onClick={openAuthModal}>Continue to sign in</Button>
    </section>
  );
};
