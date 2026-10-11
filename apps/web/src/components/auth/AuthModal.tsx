import React, { useState, useEffect, useRef } from 'react';
import { Mail, ArrowRight, ShieldCheck, RefreshCw, KeyRound, UserCheck } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { useAuth } from '../../context/AuthContext';
import { apiClient } from '../../api/client';
import { createProfileCompletionSchema } from '@riders-path/shared';
import { DEFAULT_ENROLLMENT_EXAMPLE, DEFAULT_ENROLLMENT_REGEX } from '@riders-path/shared';

function apiErrorMessage(error: any, fallback: string) {
  if (error instanceof TypeError) return 'Network error. Check your connection and try again.';
  if (error?.message) return error.message;
  if (error?.error) return error.error;
  return fallback;
}

export const AuthModal: React.FC = () => {
  const { user, isAuthModalOpen, closeAuthModal, requestOtp, verifyOtp, completeProfile } = useAuth();

  // Steps: 'email' | 'otp' | 'profile'
  const [step, setStep] = useState<'email' | 'otp' | 'profile'>('email');
  const [email, setEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [resendSeconds, setResendSeconds] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [resendUntil, setResendUntil] = useState<number | null>(null);
  const [otpLocked, setOtpLocked] = useState(false);
  const [enrollmentRegex, setEnrollmentRegex] = useState(DEFAULT_ENROLLMENT_REGEX);
  const [enrollmentExample, setEnrollmentExample] = useState(DEFAULT_ENROLLMENT_EXAMPLE);

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
  const modalWasOpen = useRef(false);

  // Fetch the server-configured enrollment format.
  useEffect(() => {
    let isMounted = true;
    apiClient.getConfig().then((cfg: any) => {
      if (isMounted && cfg) {
        if (typeof cfg.enrollmentFormatRegex === 'string') setEnrollmentRegex(cfg.enrollmentFormatRegex);
        if (typeof cfg.enrollmentFormatExample === 'string') setEnrollmentExample(cfg.enrollmentFormatExample);
      }
    }).catch(() => undefined);
    return () => { isMounted = false; };
  }, []);

  // Reset once each time the modal opens. A late /me response must not erase
  // the email or OTP a student has already entered.
  useEffect(() => {
    if (isAuthModalOpen && !modalWasOpen.current) {
      setStep(user?.emailVerified && !user.profileComplete ? 'profile' : 'email');
      setEmail('');
      setOtpDigits(['', '', '', '', '', '']);
      setErrorMessage('');
      setOtpLocked(false);
      setProfileErrors({});
    }
    modalWasOpen.current = isAuthModalOpen;
  }, [isAuthModalOpen]);

  const startResendCooldown = (seconds: number) => {
    const safeSeconds = Math.max(0, Math.ceil(seconds));
    setResendSeconds(safeSeconds);
    setCanResend(safeSeconds === 0);
    setResendUntil(safeSeconds > 0 ? Date.now() + safeSeconds * 1000 : null);
  };

  // Count down from the server-provided cooldown using a deadline to avoid timer drift.
  useEffect(() => {
    if (step !== 'otp' || resendUntil === null) return;
    const updateRemaining = () => {
      const remaining = Math.max(0, Math.ceil((resendUntil - Date.now()) / 1000));
      setResendSeconds(remaining);
      setCanResend(remaining === 0);
      if (remaining === 0) setResendUntil(null);
    };
    updateRemaining();
    const timer = setInterval(updateRemaining, 250);
    return () => clearInterval(timer);
  }, [step, resendUntil]);

  // 1. Submit email for OTP
  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    const trimmed = email.toLowerCase().trim();
    if (!trimmed) {
      setErrorMessage('Please enter your email address');
      return;
    }

    setIsLoading(true);
    try {
      const res = await requestOtp(trimmed);
      setStep('otp');
      setOtpLocked(false);
      startResendCooldown(res.cooldownSeconds);
      setTimeout(() => {
        digitInputRefs.current[0]?.focus();
      }, 100);
    } catch (err: any) {
      const cooldown = Number(err?.cooldownSeconds ?? err?.retryAfterSeconds);
      if (cooldown > 0) {
        setStep('otp');
        startResendCooldown(cooldown);
      }
      setErrorMessage(err?.code === 'OTP_RATE_LIMITED' && cooldown > 0
        ? `Too many code requests. Try again in ${cooldown} seconds.`
        : apiErrorMessage(err, 'Unable to process the verification request. Please try again.'));
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
      const code = err?.code;
      if (code === 'OTP_LOCKED_OUT') {
        setOtpLocked(true);
        setOtpDigits(['', '', '', '', '', '']);
      }
      const attempts = Number(err?.attemptsRemaining);
      const suffix = attempts > 0 ? ` ${attempts} attempt${attempts === 1 ? '' : 's'} remaining.` : '';
      const message = code === 'OTP_EXPIRED'
        ? 'That code has expired. Request a new code to continue.'
        : code === 'INVALID_OTP'
          ? 'That code is incorrect. Check it and try again, or request a new code.'
        : code === 'OTP_LOCKED_OUT'
          ? 'Too many incorrect attempts. Request a new code to continue.'
          : apiErrorMessage(err, 'Unable to verify this code. Please try again.');
      setErrorMessage(`${message}${suffix}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!canResend || isLoading) return;
    setIsLoading(true);
    setErrorMessage('');
    try {
      const res = await requestOtp(email);
      startResendCooldown(res.cooldownSeconds);
      setOtpLocked(false);
      setOtpDigits(['', '', '', '', '', '']);
      digitInputRefs.current[0]?.focus();
    } catch (err: any) {
      const cooldown = Number(err?.cooldownSeconds ?? err?.retryAfterSeconds);
      if (cooldown > 0) startResendCooldown(cooldown);
      setErrorMessage(err?.code === 'OTP_RATE_LIMITED' && cooldown > 0
        ? `Too many code requests. Try again in ${cooldown} seconds.`
        : apiErrorMessage(err, 'Unable to process the verification request. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Complete profile for new student
  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileErrors({});

    const result = createProfileCompletionSchema(enrollmentRegex, enrollmentExample).safeParse(profileData);
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
      setErrorMessage(apiErrorMessage(err, 'Failed to update student profile'));
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
          ? 'Sign in with email'
          : step === 'otp'
          ? 'Enter 6-Digit Code'
          : 'Complete Student Profile'
      }
      description={
        step === 'email'
          ? 'Use any email address to receive a one-time verification code.'
          : step === 'otp'
          ? `A code will be sent to ${email}.`
          : 'Provide your enrollment details for campus handover clearance'
      }
    >
      {/* Step 1: Email */}
      {step === 'email' && (
        <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Use any email address you can access. We will confirm ownership with a one-time code; licence documents are reviewed by the team.
            </span>
          </div>

          <Input
            id="email"
            label="Email Address"
            type="email"
            required
            autoFocus
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setErrorMessage('');
            }}
            error={errorMessage}
            helperText="We will send a six-digit code to this address."
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
              disabled={isLoading || (otpLocked && !canResend)}
              onClick={() => otpLocked ? handleResendOtp() : handleVerifyCode()}
              isLoading={isLoading}
              className="w-full"
              leftIcon={<KeyRound className="w-4 h-4" />}
            >
              {otpLocked ? 'Request a New Code' : 'Verify Code'}
            </Button>

            <div className="flex items-center justify-between text-xs pt-2 border-t border-neutral-800">
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setErrorMessage('');
                }}
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
          {errorMessage && (
            <p role="alert" aria-live="polite" className="text-xs font-medium text-rose-400">
              {errorMessage}
            </p>
          )}

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
            label="Campus Enrollment Number"
            required
            placeholder={enrollmentExample}
            value={profileData.enrollmentNumber}
            onChange={(e) =>
              setProfileData({ ...profileData, enrollmentNumber: e.target.value.toUpperCase() })
            }
            error={profileErrors.enrollmentNumber}
            helperText={`Must match configured campus format (example: ${enrollmentExample})`}
          />

          <Input
            id="student-phone"
            label="Mobile Number (Handover Contact)"
            type="tel"
            required
            placeholder="10-digit Indian phone number"
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
