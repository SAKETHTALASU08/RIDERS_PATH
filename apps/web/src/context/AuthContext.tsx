import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserProfile, ProfileCompletion } from '@riders-path/shared';
import { apiClient } from '../api/client';
import { useToast } from '../components/ui/Toast';

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  requestOtp: (email: string) => Promise<{ success: boolean; message: string; cooldownSeconds?: number }>;
  verifyOtp: (email: string, code: string) => Promise<{ requiresProfileCompletion: boolean }>;
  completeProfile: (data: ProfileCompletion) => Promise<void>;
  submitManualVerification: (data: { name: string; enrollmentNumber: string; alternateEmail: string; note?: string }) => Promise<{ success: boolean; message: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const toast = useToast();

  const refreshUser = useCallback(async () => {
    try {
      const current = await apiClient.getCurrentUser();
      setUser(current);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const requestOtp = async (email: string) => {
    return apiClient.requestOtp(email);
  };

  const verifyOtp = async (email: string, code: string) => {
    const res = await apiClient.verifyOtp(email, code);
    if (!res.requiresProfileCompletion && res.user) {
      setUser(res.user);
      toast.success('Welcome back!', `Signed in as ${res.user.name}`);
      setIsAuthModalOpen(false);
    }
    return { requiresProfileCompletion: res.requiresProfileCompletion };
  };

  const completeProfile = async (data: ProfileCompletion) => {
    const updated = await apiClient.updateProfile(data);
    setUser(updated);
    toast.success('Profile created successfully!', 'Your student account is active.');
    setIsAuthModalOpen(false);
  };

  const submitManualVerification = async (data: { name: string; enrollmentNumber: string; alternateEmail: string; note?: string }) => {
    const res = await apiClient.submitManualVerification(data);
    toast.info('Request Submitted', 'The team will review your student details.');
    return res;
  };

  const logout = async () => {
    await apiClient.logout();
    setUser(null);
    toast.info('Signed out', 'You have been signed out of your account.');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthModalOpen,
        openAuthModal: () => setIsAuthModalOpen(true),
        closeAuthModal: () => setIsAuthModalOpen(false),
        requestOtp,
        verifyOtp,
        completeProfile,
        submitManualVerification,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
