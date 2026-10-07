import React, { useState, useEffect, useId } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  Calendar,
  MapPin,
  Clock,
  AlertCircle,
  CheckCircle2,
  FileCheck,
  Upload,
  QrCode,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import {
  PublicBikeDto,
  PricingBreakdown,
  BookingResponse,
  BookingCreate,
} from '@riders-path/shared';
import { apiClient } from '../api/client';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Stepper, StepItem } from '../components/ui/Stepper';
import { DateTimePicker } from '../components/ui/DateTimePicker';
import { Select } from '../components/ui/Select';
import { Skeleton } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/ErrorState';
import { PLATFORM_CONFIG } from '@riders-path/shared';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';

export const BookingFlowPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const toast = useToast();

  const [bike, setBike] = useState<PublicBikeDto | null>(null);
  const [isLoadingBike, setIsLoadingBike] = useState(true);
  const [bikeError, setBikeError] = useState<string | null>(null);

  // Stepper state: 0 to 4
  const [currentStep, setCurrentStep] = useState(0);

  // Step 1: Dates & Hub (default starting tomorrow to avoid today's active mock bookings)
  const now = new Date();
  const defaultStartTime = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
  const defaultEndTime = new Date(now.getTime() + 28 * 3600 * 1000).toISOString();

  const [startTime, setStartTime] = useState(defaultStartTime);
  const [endTime, setEndTime] = useState(defaultEndTime);
  const [selectedHubId, setSelectedHubId] = useState('');
  const [depositType, setDepositType] = useState<'laptop' | 'cash_hub'>('laptop');
  const [step1Error, setStep1Error] = useState('');

  // Step 2: Server-calculated Pricing Breakdown
  const [pricing, setPricing] = useState<PricingBreakdown | null>(null);
  const [isCalculatingPrice, setIsCalculatingPrice] = useState(false);

  // Step 3: Document uploads (DL and Student ID) - NO Aadhaar
  const [dlPreview, setDlPreview] = useState<string>('');
  const [studentIdPreview, setStudentIdPreview] = useState<string>('');
  const [docConsentAgreed, setDocConsentAgreed] = useState(false);
  const [docError, setDocError] = useState('');

  // Step 4: Terms agreement & Submit
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Step 5: Confirmed Booking Pass
  const [confirmedBooking, setConfirmedBooking] = useState<BookingResponse | null>(null);

  // Generate idempotency key for this booking session
  const [idempotencyKey] = useState(() => 'idemp_' + Math.random().toString(36).substring(2, 12));

  // Load bike details
  useEffect(() => {
    if (!id) return;
    setIsLoadingBike(true);
    apiClient
      .getBikeById(id)
      .then((data) => {
        setBike(data);
        setSelectedHubId(data.hubId);
      })
      .catch((err) => setBikeError(err.message || 'Bike not found'))
      .finally(() => setIsLoadingBike(false));
  }, [id]);

  const steps: StepItem[] = [
    { id: 1, title: 'Dates & Hub', description: 'Duration' },
    { id: 2, title: 'Server Pricing', description: 'Pay at Handover' },
    { id: 3, title: 'Verification', description: 'DL & Student ID' },
    { id: 4, title: 'Compliance', description: 'Review Terms' },
    { id: 5, title: 'Booking Pass', description: 'Handover Ready' },
  ];

  // Advance from Step 1 to Step 2: Validate dates and compute pricing on server
  const handleProceedToPricing = async () => {
    setStep1Error('');
    if (!bike) return;

    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    if (isNaN(start) || isNaN(end) || end <= start) {
      setStep1Error('Return time must be later than pickup time');
      return;
    }

    if (start < Date.now() + 30 * 60 * 1000) {
      setStep1Error('Pickup time must be at least 30 minutes in advance');
      return;
    }

    // Check availability
    try {
      setIsCalculatingPrice(true);
      const avail = await apiClient.checkAvailability(bike.id, startTime, endTime);
      if (!avail.available) {
        setStep1Error(avail.reason || 'This bike is booked for this duration');
        return;
      }

      // Compute pricing strictly on the server
      const breakdown = await apiClient.computePricing(bike.id, startTime, endTime, depositType);
      setPricing(breakdown);
      setCurrentStep(1);
    } catch (err: any) {
      setStep1Error(err.message || 'Failed to compute pricing');
    } finally {
      setIsCalculatingPrice(false);
    }
  };

  // Document file upload handlers with size/type validation
  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (preview: string) => void,
    fieldName: string
  ) => {
    setDocError('');
    const file = e.target.files?.[0];
    if (!file) return;

    // Check type: images only
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setDocError(`${fieldName} must be a JPEG, PNG, or WebP image`);
      return;
    }

    // Check size: <= 5MB
    if (file.size > 5 * 1024 * 1024) {
      setDocError(`${fieldName} size exceeds 5MB limit`);
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setter(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Step 3 Validation: Ensure DL and ID are uploaded and consent checked
  const handleProceedToTerms = () => {
    setDocError('');
    if (!dlPreview) {
      setDocError('Please upload a clear scan or photo of your Driving Licence');
      return;
    }
    if (!studentIdPreview) {
      setDocError('Please upload a photo of your physical ICFAI Student ID Card');
      return;
    }
    if (!docConsentAgreed) {
      setDocError('You must review and agree to the document verification consent');
      return;
    }
    setCurrentStep(3);
  };

  // Step 4: Final Booking Submission (Idempotent)
  const handleFinalBookingSubmit = async () => {
    if (!user || !user.emailVerified || !user.profileComplete) {
      navigate('/signin', {
        state: {
          backgroundLocation: location,
          returnTo: location.pathname,
        },
      });
      return;
    }

    if (!termsAgreed) {
      setSubmitError('You must agree to the Campus Rental Terms');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');

    try {
      const payload: BookingCreate = {
        bikeId: bike!.id,
        startTime,
        endTime,
        pickupHubId: selectedHubId,
        depositType,
        drivingLicenceImage: dlPreview,
        studentIdCardImage: studentIdPreview,
        agreedToTermsVersion: PLATFORM_CONFIG.termsVersion,
        idempotencyKey,
      };

      const booking = await apiClient.createBooking(payload);
      setConfirmedBooking(booking);
      setCurrentStep(4);
      toast.success('Booking confirmed!', `Handover Code: ${booking.handoverCode}`);
    } catch (err: any) {
      setSubmitError(err.message || 'Unable to confirm booking. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingBike) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Skeleton height={32} width={200} className="mb-6" />
        <Skeleton height={400} rounded="2xl" />
      </div>
    );
  }

  if (bikeError || !bike) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16">
        <ErrorState
          title="Vehicle Not Found"
          message={bikeError || 'Vehicle is unavailable for booking'}
          onRetry={() => navigate('/browse')}
        />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 w-full">
      {/* Header */}
      <div className="mb-6">
        <Link
          to={`/bikes/${bike.id}`}
          className="inline-flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-100 transition-colors mb-4 min-h-[44px]"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Cancel & Back to Vehicle</span>
        </Link>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-heading text-neutral-100">
              Campus Rental Stepper
            </h1>
            <p className="text-xs text-neutral-400 mt-0.5">
              Renting: <strong className="text-neutral-200">{bike.brand} {bike.model}</strong> ({bike.registrationMasked})
            </p>
          </div>
          <Badge variant="accent" size="md">
            ₹{bike.hourlyRateInr}/hr
          </Badge>
        </div>
      </div>

      {/* Stepper Progress Indicator */}
      <div className="mb-8 p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800">
        <Stepper steps={steps} currentStep={currentStep} />
      </div>

      {/* STEP 1: Dates & Hub */}
      {currentStep === 0 && (
        <Card className="flex flex-col gap-5">
          <div className="border-b border-neutral-800 pb-3">
            <h2 className="text-base font-bold text-neutral-100">
              1. Choose Rental Duration & Pickup Hub
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Select your pickup and return schedule at an available campus hub.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DateTimePicker
              id="booking-start"
              label="Pickup Date & Time"
              value={startTime}
              onChange={setStartTime}
              min={new Date().toISOString()}
              required
            />

            <DateTimePicker
              id="booking-end"
              label="Return Date & Time"
              value={endTime}
              onChange={setEndTime}
              min={startTime}
              required
            />
          </div>

          <Select
            id="booking-hub"
            label="Campus Pickup & Return Hub"
            value={selectedHubId}
            onChange={(e) => setSelectedHubId(e.target.value)}
            options={PLATFORM_CONFIG.hubs.map((h) => ({
              value: h.id,
              label: `${h.name} (${h.code}) — ${h.operatingHours}`,
            }))}
            required
          />

          {/* Deposit Mode Selector */}
          <div className="flex flex-col gap-2 pt-2">
            <label className="text-xs font-semibold text-neutral-300">
              Choose Security Deposit Mode (Refundable at Return)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PLATFORM_CONFIG.depositPolicy.modes.map((mode) => (
                <label
                  key={mode.id}
                  className={`p-3.5 rounded-xl border flex flex-col gap-1 cursor-pointer transition-all ${
                    depositType === mode.id
                      ? 'bg-amber-500/10 border-amber-500 text-neutral-100'
                      : 'bg-neutral-950/60 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-neutral-200">{mode.label}</span>
                    <input
                      type="radio"
                      name="deposit"
                      checked={depositType === mode.id}
                      onChange={() => setDepositType(mode.id as any)}
                      className="text-amber-500 focus:ring-amber-500"
                    />
                  </div>
                  <span className="text-[11px] text-neutral-400 leading-relaxed">
                    {mode.description}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {step1Error && (
            <p role="alert" className="text-xs font-medium text-rose-400 bg-rose-950/30 p-3 rounded-xl border border-rose-900/50">
              {step1Error}
            </p>
          )}

          <Button
            onClick={handleProceedToPricing}
            isLoading={isCalculatingPrice}
            className="w-full mt-2"
            rightIcon={<ArrowRight className="w-4 h-4" />}
          >
            Compute Server Pricing
          </Button>
        </Card>
      )}

      {/* STEP 2: Server-Calculated Price Breakdown */}
      {currentStep === 1 && pricing && (
        <Card className="flex flex-col gap-5">
          <div className="border-b border-neutral-800 pb-3">
            <div className="flex items-center gap-2 text-xs font-mono text-emerald-400 mb-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>PRICE FROM SERVER</span>
            </div>
            <h2 className="text-base font-bold text-neutral-100">
              2. Transparent Pricing Breakdown
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              The server calculates rental, platform fee, and deposit. Payment is due at handover.
            </p>
          </div>

          {/* Pricing breakdown rows */}
          <div className="flex flex-col gap-3 p-4 rounded-xl bg-neutral-950/80 border border-neutral-800 text-xs">
            <div className="flex justify-between items-center text-neutral-300">
              <span>Rental Duration</span>
              <span className="font-mono font-semibold text-neutral-100">
                {pricing.durationHours} Hours
              </span>
            </div>

            <div className="flex justify-between items-center text-neutral-300">
              <span>Vehicle Rental Charge</span>
              <span className="font-mono font-semibold text-neutral-100">
                ₹{pricing.rentalChargeInr}
              </span>
            </div>

            <div className="flex justify-between items-center text-neutral-300">
              <span>Platform Coordination Fee ({PLATFORM_CONFIG.depositPolicy.platformFeePercent}%)</span>
              <span className="font-mono font-semibold text-neutral-100">
                ₹{pricing.platformFeeInr}
              </span>
            </div>

            <div className="flex justify-between items-center text-neutral-300">
              <span>Refundable Security Deposit ({pricing.depositType === 'laptop' ? 'Laptop' : '₹1,500 Cash'})</span>
              <span className="font-mono font-semibold text-neutral-100">
                {pricing.depositInr > 0 ? `₹${pricing.depositInr}` : 'Physical Laptop'}
              </span>
            </div>

            <div className="pt-3 border-t border-neutral-800 flex justify-between items-center text-sm font-bold text-neutral-100">
              <span>Total Payable at Handover</span>
              <span className="font-mono text-amber-400 text-base">
                ₹{pricing.totalPayableAtHandoverInr}
              </span>
            </div>
          </div>

          {/* Pay at Handover Notice */}
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-0.5">
              <span className="font-bold">Pay at Campus Handover</span>
              <span className="text-[11px] text-amber-200/80">
                You do not pay anything right now. Rental and deposit are settled with the student coordinator upon key collection.
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setCurrentStep(0)} className="w-1/3">
              Back
            </Button>
            <Button
              variant="primary"
              onClick={() => setCurrentStep(2)}
              className="w-2/3"
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Confirm & Upload IDs
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 3: Driving Licence & Student ID Upload (NO Aadhaar) */}
      {currentStep === 2 && (
        <Card className="flex flex-col gap-5">
          <div className="border-b border-neutral-800 pb-3">
            <h2 className="text-base font-bold text-neutral-100">
              3. Student Driving Clearance & ID Upload
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Strictly Indian Driving Licence and ICFAI Student ID Card. <strong>No Aadhaar is collected.</strong>
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Driving Licence Box */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-neutral-200 flex items-center justify-between">
                <span>Two-Wheeler Driving Licence</span>
                <span className="text-amber-500">*</span>
              </label>

              <div className="h-40 border-2 border-dashed border-neutral-700 rounded-2xl flex flex-col items-center justify-center relative overflow-hidden bg-neutral-950/60 p-3">
                {dlPreview ? (
                  <img src={dlPreview} alt="DL Preview" className="w-full h-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center text-center text-neutral-400">
                    <Upload className="w-6 h-6 text-neutral-500 mb-1" />
                    <span className="text-xs font-medium">Upload DL Scan / Photo</span>
                    <span className="text-[10px] text-neutral-500 mt-0.5">JPEG, PNG, WebP (Max 5MB)</span>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => handleFileUpload(e, setDlPreview, 'Driving Licence')}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  aria-label="Upload Driving Licence photo"
                />
              </div>
            </div>

            {/* Student ID Card Box */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-neutral-200 flex items-center justify-between">
                <span>ICFAI Student ID Card</span>
                <span className="text-amber-500">*</span>
              </label>

              <div className="h-40 border-2 border-dashed border-neutral-700 rounded-2xl flex flex-col items-center justify-center relative overflow-hidden bg-neutral-950/60 p-3">
                {studentIdPreview ? (
                  <img src={studentIdPreview} alt="ID Preview" className="w-full h-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center text-center text-neutral-400">
                    <Upload className="w-6 h-6 text-neutral-500 mb-1" />
                    <span className="text-xs font-medium">Upload Student ID Photo</span>
                    <span className="text-[10px] text-neutral-500 mt-0.5">JPEG, PNG, WebP (Max 5MB)</span>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => handleFileUpload(e, setStudentIdPreview, 'Student ID Card')}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  aria-label="Upload Student ID Card photo"
                />
              </div>
            </div>
          </div>

          {/* Privacy & Purpose Consent Notice */}
          <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 flex flex-col gap-2.5">
            <div className="flex items-center gap-2 text-xs font-bold text-neutral-200">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>Data Collection & Privacy Purpose</span>
            </div>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              We collect your Driving Licence and Student ID exclusively to verify that you are legally authorized to operate a two-wheeler and currently enrolled at ICFAI Hyderabad. Documents are used solely for vehicle custody verification during this rental cycle and are never shared with external marketers or third parties.
            </p>

            <label className="flex items-start gap-2.5 text-xs text-neutral-200 cursor-pointer select-none pt-1">
              <input
                type="checkbox"
                checked={docConsentAgreed}
                onChange={(e) => setDocConsentAgreed(e.target.checked)}
                className="w-4 h-4 rounded text-amber-500 bg-neutral-800 border-neutral-700 focus:ring-amber-500 mt-0.5"
              />
              <span>
                I confirm these documents are authentic, belong to me, and consent to their temporary inspection for this rental.
              </span>
            </label>
          </div>

          {docError && (
            <p role="alert" className="text-xs font-medium text-rose-400 bg-rose-950/30 p-3 rounded-xl border border-rose-900/50">
              {docError}
            </p>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setCurrentStep(1)} className="w-1/3">
              Back
            </Button>
            <Button
              variant="primary"
              onClick={handleProceedToTerms}
              className="w-2/3"
              rightIcon={<ArrowRight className="w-4 h-4" />}
            >
              Proceed to Terms
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 4: Compliance & Terms Review */}
      {currentStep === 3 && (
        <Card className="flex flex-col gap-5">
          <div className="border-b border-neutral-800 pb-3">
            <h2 className="text-base font-bold text-neutral-100">
              4. Review Safety Terms & Confirm
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Review and sign off on campus safety directives and rental compliance ({PLATFORM_CONFIG.termsVersion}).
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-neutral-950 border border-neutral-800/80 flex flex-col gap-3 text-xs text-neutral-300">
            <span className="font-bold text-neutral-200">Mandatory Campus Directives:</span>
            <ul className="list-disc pl-5 flex flex-col gap-1.5 text-neutral-400">
              {PLATFORM_CONFIG.safetyRules.map((rule, idx) => (
                <li key={idx}>{rule}</li>
              ))}
            </ul>
          </div>

          <label className="flex items-start gap-2.5 text-xs text-neutral-200 cursor-pointer select-none p-3 rounded-xl bg-neutral-900 border border-neutral-800">
            <input
              type="checkbox"
              checked={termsAgreed}
              onChange={(e) => setTermsAgreed(e.target.checked)}
              className="w-4 h-4 rounded text-amber-500 bg-neutral-800 border-neutral-700 focus:ring-amber-500 mt-0.5"
            />
            <span>
              I accept the{' '}
              <Link to="/terms" target="_blank" className="text-amber-400 underline">
                Riders Path Campus Rental Terms
              </Link>{' '}
              and agree to follow all traffic and university conduct regulations.
            </span>
          </label>

          {submitError && (
            <p role="alert" className="text-xs font-medium text-rose-400 bg-rose-950/30 p-3 rounded-xl border border-rose-900/50">
              {submitError}
            </p>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setCurrentStep(2)} className="w-1/3">
              Back
            </Button>
            <Button
              variant="primary"
              onClick={handleFinalBookingSubmit}
              isLoading={isSubmitting}
              disabled={isSubmitting}
              className="w-2/3 text-sm font-bold"
              rightIcon={<CheckCircle2 className="w-4 h-4" />}
            >
              Generate Digital Booking Pass
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 5: Confirmed Booking Pass */}
      {currentStep === 4 && confirmedBooking && (
        <Card className="flex flex-col items-center text-center p-6 sm:p-8 border-amber-500/40 bg-gradient-to-b from-neutral-900 to-neutral-950">
          <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4">
            <QrCode className="w-8 h-8" />
          </div>

          <Badge variant="success" size="md" className="mb-2">
            BOOKING CONFIRMED & CLEARANCE READY
          </Badge>

          <h2 className="text-2xl font-bold font-heading text-neutral-100 mb-1">
            Handover Gate Pass
          </h2>
          <p className="text-xs text-neutral-400 mb-6">
            Present this code to your campus hub coordinator to receive vehicle keys.
          </p>

          {/* Pass Card Details */}
          <div className="w-full max-w-md p-5 rounded-2xl bg-neutral-950 border border-neutral-800 text-left flex flex-col gap-3.5 mb-6">
            <div className="flex justify-between items-center pb-3 border-b border-neutral-800">
              <div>
                <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">
                  Handover Code
                </span>
                <span className="text-2xl font-black font-mono text-amber-400">
                  {confirmedBooking.handoverCode}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">
                  Pass Reference
                </span>
                <span className="text-xs font-mono text-neutral-300">
                  {confirmedBooking.id}
                </span>
              </div>
            </div>

            <div className="text-xs flex flex-col gap-1.5">
              <div className="flex justify-between text-neutral-300">
                <span className="text-neutral-500">Vehicle:</span>
                <span className="font-semibold text-neutral-100">
                  {confirmedBooking.bike.brand} {confirmedBooking.bike.model}
                </span>
              </div>
              <div className="flex justify-between text-neutral-300">
                <span className="text-neutral-500">Pickup Hub:</span>
                <span className="font-semibold text-neutral-100">
                  {confirmedBooking.pickupHubName}
                </span>
              </div>
              <div className="flex justify-between text-neutral-300">
                <span className="text-neutral-500">Payable at Handover:</span>
                <span className="font-mono font-bold text-amber-400">
                  ₹{confirmedBooking.pricing.totalPayableAtHandoverInr}
                </span>
              </div>
              <div className="flex justify-between text-neutral-300">
                <span className="text-neutral-500">Deposit Requirement:</span>
                <span className="font-semibold text-neutral-200">
                  {confirmedBooking.depositType === 'laptop' ? 'Working Laptop' : '₹1,500 Cash'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
            <Link to="/my-bookings" className="flex-1">
              <Button variant="primary" className="w-full">
                View My Bookings
              </Button>
            </Link>
            <Link to="/browse" className="flex-1">
              <Button variant="outline" className="w-full">
                Explore More Fleet
              </Button>
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
};
