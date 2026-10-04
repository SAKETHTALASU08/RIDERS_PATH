import React, { useState, useEffect, useRef } from 'react';
import { Mail, ArrowRight, ShieldCheck, RefreshCw, KeyRound, UserCheck } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { useAuth } from '../../context/AuthContext';
import { PLATFORM_CONFIG } from '../../config/platform.config';
import { ProfileCompletionSchema } from '../../shared/contract';

export const AuthModal: React.FC = () => {
  const { isAuthModalOpen, closeAuthModal, requestOtp, verifyOtp, completeProfile } = useAuth();

  // Steps: 'email' | 'otp' | 'profile'
  const [step, setStep] = useState<'email' | 'otp' | 'profile'>('email');
  const [email, setEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [resendSeconds, setResendSeconds] = useState(60);
  const [canResend, setCanResend] = useState(false);

  // Profile completion fields
  const [profileData, setProfileData] = useState({
    name: '',
    enrollmentNumber: '',
    phone: '',
    course: '',
    year: '1st Year' as '1st Year' | '2nd Year' | '3rd Year' | '4th Year' | 'Postgraduate',
  });
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});

  const digitInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Reset modal state when opened/closed
  useEffect(() => {
    if (isAuthModalOpen) {
      setStep('email');
      setEmail('');
      setOtpDigits(['', '', '', '', '', '']);
      setErrorMessage('');
      setProfileErrors({});
    }
  }, [isAuthModalOpen]);

  // Resend countdown timer
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (step === 'otp' && resendSeconds > 0) {
      timer = setTimeout(() => setResendSeconds((prev) => prev - 1), 1000);
    } else if (resendSeconds === 0) {
      setCanResend(true);
    }
    return () => clearTimeout(timer);
  }, [step, resendSeconds]);

  // 1. Submit email for OTP
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const trimmed = email.toLowerCase().trim();
    if (!trimmed) {
      setErrorMessage('Please enter your campus email');
      return;
    }

    if (
      !trimmed.endsWith(`@${PLATFORM_CONFIG.allowedEmailDomain}`) &&
      !trimmed.endsWith('.icfaiuniversity.in') &&
      !trimmed.endsWith('@ifheindia.org')
    ) {
      setErrorMessage(`Please use your official ICFAI email address (@${PLATFORM_CONFIG.allowedEmailDomain})`);
      return;
    }

    setIsLoading(true);
    try {
      await requestOtp(trimmed);
      setStep('otp');
      setResendSeconds(60);
      setCanResend(false);
      setTimeout(() => {
        digitInputRefs.current[0]?.focus();
      }, 100);
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to send OTP. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Handle 6-digit OTP input with auto-advance and paste
  const handleDigitChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newDigits = [...otpDigits];
    newDigits[index] = value.slice(-1);
    setOtpDigits(newDigits);
    setErrorMessage('');

    // Auto-advance
    if (value && index < 5) {
      digitInputRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      digitInputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').trim();
    if (/^\d{6}$/.test(pasteData)) {
      const digits = pasteData.split('');
      setOtpDigits(digits);
      digitInputRefs.current[5]?.focus();
      handleVerifyCode(digits.join(''));
    }
  };

  const handleVerifyCode = async (codeToVerify?: string) => {
    const code = codeToVerify || otpDigits.join('');
    if (code.length !== 6) {
      setErrorMessage('Please enter the complete 6-digit code');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    try {
      const result = await verifyOtp(email, code);
      if (result.requiresProfileCompletion) {
        setStep('profile');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Invalid or expired verification code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!canResend || isLoading) return;
    setIsLoading(true);
    setErrorMessage('');
    try {
      await requestOtp(email);
      setResendSeconds(60);
      setCanResend(false);
      setOtpDigits(['', '', '', '', '', '']);
      digitInputRefs.current[0]?.focus();
    } catch (err: any) {
      setErrorMessage(err.message || 'Could not resend OTP');
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Complete profile for new student
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileErrors({});

    const result = ProfileCompletionSchema.safeParse(profileData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        if (issue.path[0]) {
          fieldErrors[issue.path[0] as string] = issue.message;
        }
      });
      setProfileErrors(fieldErrors);
      return;
    }

    setIsLoading(true);
    try {
      await completeProfile(result.data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update student profile');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isAuthModalOpen}
      onClose={closeAuthModal}
      title={
        step === 'email'
          ? 'ICFAI Student Access'
          : step === 'otp'
          ? 'Enter 6-Digit Code'
          : 'Complete Student Profile'
      }
      description={
        step === 'email'
          ? 'Single sign-in with your official university email'
          : step === 'otp'
          ? `Code sent to ${email}`
          : 'Provide your enrollment details for campus handover clearance'
      }
    >
      {/* Step 1: Campus Email */}
      {step === 'email' && (
        <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Restricted to verified students of <strong>{PLATFORM_CONFIG.campusName}</strong>.
            </span>
          </div>

          <Input
            id="campus-email"
            label="College Email Address"
            type="email"
            required
            autoFocus
            autoComplete="email"
            placeholder={`name@${PLATFORM_CONFIG.allowedEmailDomain}`}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErrorMessage('');
            }}
            error={errorMessage}
            helperText={`Must end in @${PLATFORM_CONFIG.allowedEmailDomain}`}
            leftIcon={<Mail className="w-4 h-4" />}
          />

          <Button
            type="submit"
            isLoading={isLoading}
            className="w-full mt-2"
            rightIcon={<ArrowRight className="w-4 h-4" />}
          >
            Send Verification Code
          </Button>
        </form>
      )}

      {/* Step 2: 6-Digit Code */}
      {step === 'otp' && (
        <div className="flex flex-col gap-5">
          <div className="flex justify-center gap-2 sm:gap-2.5 my-2" onPaste={handlePaste}>
            {otpDigits.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (digitInputRefs.current[index] = el)}
                type="text"
                inputMode="numeric"
                maxLength={1}
                pattern="\d*"
                value={digit}
                onChange={(e) => handleDigitChange(index, e.target.value)}
                onKeyDown={(e) => handleDigitKeyDown(index, e)}
                aria-label={`Digit ${index + 1} of 6`}
                className="w-11 h-14 sm:w-12 sm:h-14 text-center text-xl font-bold font-mono rounded-xl bg-neutral-900 border border-neutral-700 text-neutral-100 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
              />
            ))}
          </div>

          {errorMessage && (
            <p role="alert" aria-live="polite" className="text-xs font-medium text-rose-400 text-center">
              {errorMessage}
            </p>
          )}

          <div className="flex flex-col gap-3">
            <Button
              type="button"
              onClick={() => handleVerifyCode()}
              isLoading={isLoading}
              className="w-full"
              leftIcon={<KeyRound className="w-4 h-4" />}
            >
              Verify Code
            </Button>

            <div className="flex items-center justify-between text-xs pt-2 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => setStep('email')}
                className="text-neutral-400 hover:text-neutral-200 cursor-pointer p-1 min-h-[44px] flex items-center"
              >
                Change Email
              </button>

              <button
                type="button"
                disabled={!canResend || isLoading}
                onClick={handleResendOtp}
                className="text-amber-400 hover:text-amber-300 disabled:text-neutral-600 disabled:cursor-not-allowed cursor-pointer p-1 min-h-[44px] flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>
                  {canResend ? 'Resend Code' : `Resend in ${resendSeconds}s`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Profile Completion for new students */}
      {step === 'profile' && (
        <form onSubmit={handleProfileSubmit} className="flex flex-col gap-3.5">
          <Input
            id="student-name"
            label="Full Student Name"
            required
            placeholder="As on University ID Card"
            value={profileData.name}
            onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
            error={profileErrors.name}
          />

          <Input
            id="student-enrollment"
            label="ICFAI Enrollment Number"
            required
            placeholder="e.g. 21BSPH0412"
            value={profileData.enrollmentNumber}
            onChange={(e) =>
              setProfileData({ ...profileData, enrollmentNumber: e.target.value.toUpperCase() })
            }
            error={profileErrors.enrollmentNumber}
            helperText="Matches format: 2-digit year + faculty letters + digits"
          />

          <Input
            id="student-phone"
            label="Mobile Number (WhatsApp Handover Contact)"
            type="tel"
            required
            placeholder="10-digit mobile number"
            value={profileData.phone}
            onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
            error={profileErrors.phone}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              id="student-course"
              label="Course / Program"
              required
              placeholder="e.g. B.Tech CSE / BBA"
              value={profileData.course}
              onChange={(e) => setProfileData({ ...profileData, course: e.target.value })}
              error={profileErrors.course}
            />

            <Select
              id="student-year"
              label="Academic Year"
              required
              value={profileData.year}
              onChange={(e) =>
                setProfileData({
                  ...profileData,
                  year: e.target.value as any,
                })
              }
              options={[
                { value: '1st Year', label: '1st Year' },
                { value: '2nd Year', label: '2nd Year' },
                { value: '3rd Year', label: '3rd Year' },
                { value: '4th Year', label: '4th Year' },
                { value: 'Postgraduate', label: 'Postgraduate' },
              ]}
            />
          </div>

          <Button
            type="submit"
            isLoading={isLoading}
            className="w-full mt-2"
            leftIcon={<UserCheck className="w-4 h-4" />}
          >
            Activate Student Account
          </Button>
        </form>
      )}
    </Modal>
  );
};
