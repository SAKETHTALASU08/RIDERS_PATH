import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, LockKeyhole, QrCode, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { BookingCreate, BookingResponse, PricingBreakdown, PublicBikeDto, PublicConfig } from '@riders-path/shared';
import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Stepper, StepItem } from '../components/ui/Stepper';
import { DateTimePicker } from '../components/ui/DateTimePicker';
import { Select } from '../components/ui/Select';
import { Skeleton } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/ErrorState';
import { validateDocumentFile, DocumentType } from '../features/documents/validateDocumentFile';

type UploadedDocument = { id: string; name: string; previewUrl: string; byteSize: number };
const BOOKING_DESK_WHATSAPP = '919573213150';
const documentLabels: Record<DocumentType, string> = {
  driving_license: 'Two-wheeler driving licence',
  student_id: 'College student ID',
  aadhaar: 'Aadhaar',
};

export const BookingFlowPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isLoading: isAuthLoading } = useAuth();
  const toast = useToast();
  const [bike, setBike] = useState<PublicBikeDto | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const startDefault = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const [startTime, setStartTime] = useState(startDefault);
  const [endTime, setEndTime] = useState(new Date(Date.now() + 28 * 60 * 60 * 1000).toISOString());
  const [hubId, setHubId] = useState('');
  const [depositType, setDepositType] = useState<'laptop' | 'cash_hub'>('laptop');
  const [pricing, setPricing] = useState<PricingBreakdown | null>(null);
  const [loadingAction, setLoadingAction] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [consentChecked, setConsentChecked] = useState(false);
  const [consentId, setConsentId] = useState('');
  const [documents, setDocuments] = useState<Partial<Record<DocumentType, UploadedDocument>>>({});
  const [files, setFiles] = useState<Partial<Record<DocumentType, File>>>({});
  const [fileErrors, setFileErrors] = useState<Partial<Record<DocumentType, string>>>({});
  const [uploadingType, setUploadingType] = useState<DocumentType | null>(null);
  const [termsChecked, setTermsChecked] = useState(false);
  const [booking, setBooking] = useState<BookingResponse | null>(null);
  const [idempotencyKey] = useState(() => `booking_${crypto.randomUUID()}`);
  const previewUrls = useRef<string[]>([]);

  // Rider details — pre-filled from logged-in user, editable for guests
  const [riderName, setRiderName] = useState(user?.name || '');
  const [riderEmail, setRiderEmail] = useState(user?.email || '');
  const [riderPhone, setRiderPhone] = useState(user?.phone || '');
  const [riderEnrollment, setRiderEnrollment] = useState(user?.enrollmentNumber || '');

  const bookingWhatsAppUrl = booking
    ? `https://wa.me/${BOOKING_DESK_WHATSAPP}?text=${encodeURIComponent([
        'New Riders Path bike request',
        `Student: ${riderName || user?.name || ''}`,
        `Phone: ${riderPhone || user?.phone || ''}`,
        `Bike: ${booking.bike.brand} ${booking.bike.model}`,
        `Pickup: ${booking.pickupHubName}`,
        `Reference: ${booking.id}`,
      ].join('\n'))}`
    : '';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      id ? apiClient.getBikeById(id) : Promise.reject(new Error('Bike not found')),
      apiClient.getConfig(),
    ])
      .then(([bikeData, configData]) => {
        if (cancelled) return;
        setBike(bikeData);
        setConfig(configData);
        setHubId(bikeData.hubId);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setLoadError(cause instanceof Error ? cause.message : 'Unable to load this booking.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => () => previewUrls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  // Pre-fill rider details when auth resolves (user might already be logged in)
  useEffect(() => {
    if (user) {
      if (!riderName) setRiderName(user.name || '');
      if (!riderEmail) setRiderEmail(user.email || '');
      if (!riderPhone) setRiderPhone(user.phone || '');
      if (!riderEnrollment) setRiderEnrollment(user.enrollmentNumber || '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const requiredTypes: DocumentType[] = config?.requireAadhaarUpload
    ? ['driving_license', 'student_id', 'aadhaar']
    : ['driving_license', 'student_id'];

  const steps: StepItem[] = [
    { id: 1, title: 'Dates & hub', description: 'Availability' },
    { id: 2, title: 'Price', description: 'Pay at handover' },
    { id: 3, title: 'Documents', description: 'Team review' },
    { id: 4, title: 'Terms', description: 'Confirm request' },
    { id: 5, title: 'Pass', description: 'Request reference' },
  ];

  const calculatePrice = async () => {
    setError('');
    const errors: Record<string, string> = {};
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    if (!Number.isFinite(start) || start < Date.now() + 30 * 60 * 1000)
      errors.startTime = 'Choose a pickup time at least 30 minutes from now.';
    if (!Number.isFinite(end) || end <= start) errors.endTime = 'Return must be later than pickup.';
    if (!hubId) errors.hub = 'Choose a pickup hub.';
    setFieldErrors(errors);
    if (Object.keys(errors).length || !bike) { setError('Review the highlighted booking details.'); return; }
    setLoadingAction(true);
    try {
      const availability = await apiClient.checkAvailability(bike.id, startTime, endTime);
      if (!availability.available) { setError(availability.reason || 'This bike is not available for those dates.'); return; }
      setPricing(await apiClient.computePricing(bike.id, startTime, endTime, depositType));
      setStep(1);
    } catch (cause: any) { setError(cause.message || 'Could not check availability. Please retry.'); }
    finally { setLoadingAction(false); }
  };

  const selectFile = (type: DocumentType, file?: File) => {
    if (!file) return;
    const validation = validateDocumentFile(file);
    if (validation) {
      setFileErrors((cur) => ({ ...cur, [type]: validation }));
      setFiles((cur) => ({ ...cur, [type]: undefined }));
      return;
    }
    setFileErrors((cur) => ({ ...cur, [type]: undefined }));
    setFiles((cur) => ({ ...cur, [type]: file }));
    const previewUrl = URL.createObjectURL(file);
    previewUrls.current.push(previewUrl);
    setDocuments((cur) => ({ ...cur, [type]: { id: '', name: file.name, previewUrl, byteSize: file.size } }));
  };

  const acceptConsent = async () => {
    setError('');
    if (!config) return;

    // Validate rider details before saving consent
    const errs: Record<string, string> = {};
    if (!riderName.trim()) errs.riderName = 'Full name is required.';
    if (!riderEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(riderEmail.trim()))
      errs.riderEmail = 'Valid email address is required.';
    if (!riderPhone.trim()) errs.riderPhone = 'Phone number is required.';
    setFieldErrors(errs);
    if (Object.keys(errs).length) { setError('Please fill in your contact details before continuing.'); return; }
    if (!consentChecked) { setError('Read the document notice and confirm before continuing.'); return; }

    setLoadingAction(true);
    try {
      const consent = await apiClient.createDocumentConsent(config.documentConsentVersion, {
        name: riderName.trim(),
        email: riderEmail.trim().toLowerCase(),
        phone: riderPhone.trim(),
        enrollment: riderEnrollment.trim(),
      });
      setConsentId(consent.id);
    } catch (cause: any) { setError(cause.message || 'Could not save document consent.'); }
    finally { setLoadingAction(false); }
  };

  const upload = async (type: DocumentType) => {
    const file = files[type];
    if (!file || !consentId) return;
    setUploadingType(type);
    setFileErrors((cur) => ({ ...cur, [type]: undefined }));
    try {
      const result = await apiClient.uploadDocument(file, type, consentId);
      setDocuments((cur) => ({ ...cur, [type]: { ...cur[type]!, id: result.id } }));
      setFiles((cur) => ({ ...cur, [type]: undefined }));
    } catch (cause: any) {
      setFileErrors((cur) => ({ ...cur, [type]: cause.message || 'Upload failed. Retry this file.' }));
    } finally { setUploadingType(null); }
  };

  const removeDocument = async (type: DocumentType) => {
    const doc = documents[type];
    if (doc?.id) {
      try { await apiClient.deleteDocument(doc.id); }
      catch (cause: any) {
        setFileErrors((cur) => ({ ...cur, [type]: cause.message || 'Could not remove this upload.' }));
        return;
      }
    }
    setDocuments((cur) => ({ ...cur, [type]: undefined }));
    setFiles((cur) => ({ ...cur, [type]: undefined }));
  };

  const submitBooking = async () => {
    if (!termsChecked || !pricing || !bike || !consentId || requiredTypes.some((t) => !documents[t]?.id)) {
      setError('Complete the required documents and confirmations before sending your request.');
      return;
    }
    setLoadingAction(true);
    setError('');
    try {
      const payload: BookingCreate = {
        bikeId: bike.id,
        startTime,
        endTime,
        pickupHubId: hubId,
        depositType,
        documentConsentId: consentId,
        documentIds: requiredTypes.map((t) => documents[t]!.id),
        agreedToTermsVersion: config?.termsVersion || 'terms-placeholder-v1',
        idempotencyKey,
        renterName: riderName.trim() || undefined,
        renterEmail: riderEmail.trim().toLowerCase() || undefined,
        renterPhone: riderPhone.trim() || undefined,
        renterEnrollment: riderEnrollment.trim() || undefined,
      };
      const result = await apiClient.createBooking(payload);
      setBooking(result);
      setStep(4);
      toast.success('Booking request received', 'Your documents are waiting for team review.');
    } catch (cause: any) {
      setError(cause.message || 'Unable to send the request. Your uploaded files remain available to retry.');
    } finally { setLoadingAction(false); }
  };

  if (loading) return (
    <div className="max-w-3xl mx-auto px-4 py-12 w-full">
      <Skeleton height={36} width="40%" className="mb-6"/>
      <Skeleton height={400} rounded="2xl"/>
    </div>
  );
  if (loadError || !bike || !config) return (
    <div className="max-w-xl mx-auto px-4 py-16">
      <ErrorState title="Booking unavailable" message={loadError || 'Bike details could not be loaded.'} onRetry={() => navigate('/browse')}/>
    </div>
  );
  if (isAuthLoading) return <p role="status" aria-live="polite" className="mx-auto p-12">Loading…</p>;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 w-full">
      <Link to={`/bikes/${bike.id}`} className="inline-flex items-center gap-2 min-h-11 text-sm text-neutral-300 mb-4">
        <ArrowLeft size={16}/>Back to bike
      </Link>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Book {bike.brand} {bike.model}</h1>
          <p className="text-sm text-neutral-400">Request a reservation; a team member reviews your documents.</p>
        </div>
        <Badge variant="accent">₹{bike.hourlyRateInr}/hr</Badge>
      </div>
      <div className="mb-6 p-4 rounded-2xl bg-neutral-900 border border-neutral-800">
        <Stepper steps={steps} currentStep={step}/>
      </div>

      {/* ── STEP 0: Dates & Hub ── */}
      {step === 0 && (
        <Card className="flex flex-col gap-5">
          <h2 className="text-lg font-bold">Choose dates and pickup hub</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <DateTimePicker id="pickup-date" label="Pickup date and time" value={startTime} onChange={setStartTime} min={new Date(Date.now() + 30 * 60_000).toISOString()} error={fieldErrors.startTime} required/>
            <DateTimePicker id="return-date" label="Return date and time" value={endTime} onChange={setEndTime} min={startTime} error={fieldErrors.endTime} required/>
          </div>
          <Select id="pickup-hub" label="Pickup and return hub" value={hubId} onChange={(e) => setHubId(e.target.value)} options={config.hubs.map((h) => ({ value: h.id, label: `${h.name} · ${h.operatingHours}` }))} error={fieldErrors.hub} required/>
          <fieldset>
            <legend className="text-sm font-semibold mb-2">Deposit option</legend>
            <div className="grid sm:grid-cols-2 gap-3">
              {config.depositPolicy.modes.map((mode) => (
                <label key={mode.id} className={`p-4 rounded-xl border cursor-pointer ${depositType === mode.id ? 'border-amber-400 bg-amber-500/10' : 'border-neutral-700'}`}>
                  <span className="flex gap-2 items-start">
                    <input type="radio" name="deposit-type" checked={depositType === mode.id} onChange={() => setDepositType(mode.id as 'laptop' | 'cash_hub')}/>
                    <span><strong>{mode.label}</strong><small className="block text-neutral-400">{mode.description}</small></span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {error && <p role="alert" aria-live="polite" className="p-3 rounded-xl bg-rose-950 text-rose-200">{error}</p>}
          <Button onClick={calculatePrice} isLoading={loadingAction} disabled={loadingAction} className="w-full">
            Check availability and price <ArrowRight size={16}/>
          </Button>
        </Card>
      )}

      {/* ── STEP 1: Price ── */}
      {step === 1 && pricing && (
        <Card className="flex flex-col gap-5">
          <h2 className="text-lg font-bold">Price calculated by the server</h2>
          <dl className="space-y-3 rounded-xl bg-neutral-950 p-4">
            <div className="flex justify-between"><dt>Rental ({pricing.durationHours} hours)</dt><dd>₹{pricing.rentalChargeInr}</dd></div>
            <div className="flex justify-between"><dt>Platform fee</dt><dd>₹{pricing.platformFeeInr}</dd></div>
            <div className="flex justify-between"><dt>Deposit</dt><dd>{pricing.depositInr ? `₹${pricing.depositInr}` : 'Physical laptop'}</dd></div>
            <div className="flex justify-between border-t border-neutral-700 pt-3 font-bold"><dt>Total payable at handover</dt><dd>₹{pricing.totalPayableAtHandoverInr}</dd></div>
          </dl>
          <p className="text-sm text-neutral-300"><ShieldCheck className="inline mr-2" size={16}/>Payment is collected at handover.</p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(0)}>Back</Button>
            <Button onClick={() => setStep(2)}>Continue to documents <ArrowRight size={16}/></Button>
          </div>
        </Card>
      )}

      {/* ── STEP 2: Documents ── */}
      {step === 2 && (
        <Card className="flex flex-col gap-5">
          <h2 className="text-lg font-bold">Documents for team review</h2>

          {/* Rider Details — always shown, pre-filled if logged in, locked after consent */}
          <section className="rounded-xl border border-neutral-700 bg-neutral-950 p-4 space-y-3">
            <h3 className="font-semibold">Your details</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="rider-name" className="block text-sm mb-1">Full name <span className="text-rose-300">*</span></label>
                <input
                  id="rider-name" type="text" value={riderName}
                  onChange={(e) => setRiderName(e.target.value)}
                  placeholder="e.g. Ravi Kumar" disabled={!!consentId}
                  className={`w-full rounded-lg border px-3 py-2 bg-neutral-900 text-sm ${fieldErrors.riderName ? 'border-rose-500' : 'border-neutral-600'} disabled:opacity-60`}
                />
                {fieldErrors.riderName && <p className="text-xs text-rose-300 mt-1">{fieldErrors.riderName}</p>}
              </div>
              <div>
                <label htmlFor="rider-email" className="block text-sm mb-1">Email address <span className="text-rose-300">*</span></label>
                <input
                  id="rider-email" type="email" value={riderEmail}
                  onChange={(e) => setRiderEmail(e.target.value)}
                  placeholder="you@example.com" disabled={!!consentId}
                  className={`w-full rounded-lg border px-3 py-2 bg-neutral-900 text-sm ${fieldErrors.riderEmail ? 'border-rose-500' : 'border-neutral-600'} disabled:opacity-60`}
                />
                {fieldErrors.riderEmail && <p className="text-xs text-rose-300 mt-1">{fieldErrors.riderEmail}</p>}
              </div>
              <div>
                <label htmlFor="rider-phone" className="block text-sm mb-1">Phone number <span className="text-rose-300">*</span></label>
                <input
                  id="rider-phone" type="tel" value={riderPhone}
                  onChange={(e) => setRiderPhone(e.target.value)}
                  placeholder="10-digit mobile" disabled={!!consentId}
                  className={`w-full rounded-lg border px-3 py-2 bg-neutral-900 text-sm ${fieldErrors.riderPhone ? 'border-rose-500' : 'border-neutral-600'} disabled:opacity-60`}
                />
                {fieldErrors.riderPhone && <p className="text-xs text-rose-300 mt-1">{fieldErrors.riderPhone}</p>}
              </div>
              <div>
                <label htmlFor="rider-enrollment" className="block text-sm mb-1">College ID / Enrollment <span className="text-neutral-500">(optional)</span></label>
                <input
                  id="rider-enrollment" type="text" value={riderEnrollment}
                  onChange={(e) => setRiderEnrollment(e.target.value)}
                  placeholder="e.g. IFH2021001" disabled={!!consentId}
                  className="w-full rounded-lg border border-neutral-600 px-3 py-2 bg-neutral-900 text-sm disabled:opacity-60"
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-neutral-700 bg-neutral-950 p-4 space-y-3">
            <h3 className="font-semibold flex items-center gap-2"><LockKeyhole size={16}/>Before you upload</h3>
            <p className="text-sm text-neutral-300">
              We collect your driving licence, college ID{config.requireAadhaarUpload ? ', and Aadhaar' : ''} to review this booking request.
              Authorized admin reviewers can view the files through a short-lived link. Unused uploads are deleted after 7 days;
              documents for completed, cancelled, or rejected bookings are retained for 30 days after the final status.
              To request deletion sooner, contact the campus desk.
            </p>
            {config.requireAadhaarUpload && (
              <div className="rounded-lg border border-amber-800 bg-amber-950/40 p-3 text-sm">
                <strong>Aadhaar upload reminder:</strong> We recommend uploading a masked copy showing only the last four digits (example: XXXX-XXXX-1234).
              </div>
            )}
            {!consentId ? (
              <>
                <label className="flex gap-3 items-start text-sm">
                  <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} className="mt-1"/>
                  <span>I have read this notice and consent to this document use for booking review.</span>
                </label>
                <Button onClick={acceptConsent} disabled={!consentChecked || loadingAction} isLoading={loadingAction}>
                  Agree and continue to upload
                </Button>
              </>
            ) : (
              <p role="status" className="text-sm text-emerald-300">Consent recorded for this upload session.</p>
            )}
          </section>

          {consentId && (
            <div className="grid gap-4">
              {requiredTypes.map((type) => {
                const doc = documents[type];
                const file = files[type];
                return (
                  <section key={type} className="rounded-xl border border-neutral-700 p-4 space-y-3" aria-labelledby={`label-${type}`}>
                    <div className="flex items-center justify-between gap-3">
                      <h3 id={`label-${type}`} className="font-semibold">{documentLabels[type]} <span className="text-rose-300">*</span></h3>
                      {doc?.id && <Badge variant="success">Uploaded · pending review</Badge>}
                    </div>
                    {doc && (
                      <div className="flex items-center gap-3">
                        <img src={doc.previewUrl} alt={`${documentLabels[type]} preview`} width="96" height="72" loading="lazy" className="h-18 w-24 rounded-md object-cover"/>
                        <span className="text-sm text-neutral-300 truncate">{doc.name}</span>
                        {doc.id && <Button variant="ghost" aria-label={`Remove ${documentLabels[type]}`} onClick={() => void removeDocument(type)}><Trash2 size={16}/></Button>}
                      </div>
                    )}
                    {!doc?.id && (
                      <>
                        <label className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-neutral-600 px-4 cursor-pointer">
                          <Upload size={16}/>{file ? 'Choose a different file' : `Choose ${documentLabels[type].toLowerCase()}`}
                          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.pdf" className="sr-only" onChange={(e) => selectFile(type, e.target.files?.[0])}/>
                        </label>
                        {file && <Button onClick={() => void upload(type)} disabled={uploadingType !== null} isLoading={uploadingType === type}>Upload file</Button>}
                      </>
                    )}
                    <p className="text-xs text-neutral-400">JPEG, PNG, WebP, or PDF · maximum 5 MB. Image metadata is removed during processing.</p>
                    {fileErrors[type] && <p role="alert" aria-live="polite" className="text-sm text-rose-300">{fileErrors[type]}</p>}
                  </section>
                );
              })}
            </div>
          )}

          {error && <p role="alert" aria-live="polite" className="p-3 rounded-xl bg-rose-950 text-rose-200">{error}</p>}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={() => {
              if (!consentId || requiredTypes.some((t) => !documents[t]?.id)) {
                setError('Upload every required document before continuing.');
                return;
              }
              setError('');
              setStep(3);
            }}>Continue to terms <ArrowRight size={16}/></Button>
          </div>
        </Card>
      )}

      {/* ── STEP 3: Terms ── */}
      {step === 3 && (
        <Card className="flex flex-col gap-5">
          <h2 className="text-lg font-bold">Review and send booking request</h2>
          <div className="rounded-xl bg-neutral-950 p-4">
            <h3 className="font-semibold mb-2">Safety guidance</h3>
            <ul className="list-disc pl-5 text-sm text-neutral-300 space-y-1">
              {config.safetyRules.map((rule, i) => <li key={i}>{rule}</li>)}
            </ul>
          </div>
          <label className="flex gap-3 items-start rounded-xl border border-neutral-700 p-4 text-sm">
            <input type="checkbox" checked={termsChecked} onChange={(e) => setTermsChecked(e.target.checked)} className="mt-1"/>
            <span>I agree to the <Link to="/terms" target="_blank" className="underline text-amber-300">Terms placeholder</Link> ({config.termsVersion}).</span>
          </label>
          {error && <p role="alert" aria-live="polite" className="p-3 rounded-xl bg-rose-950 text-rose-200">{error}</p>}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
            <Button onClick={() => void submitBooking()} disabled={!termsChecked || loadingAction} isLoading={loadingAction}>
              Send booking request <CheckCircle2 size={16}/>
            </Button>
          </div>
        </Card>
      )}

      {/* ── STEP 4: Confirmation ── */}
      {step === 4 && booking && (
        <Card className="flex flex-col items-center gap-4 text-center">
          <QrCode size={36} className="text-amber-300"/>
          <Badge variant={booking.status === 'CONFIRMED' ? 'success' : 'warning'}>
            {booking.status === 'CONFIRMED' ? 'CONFIRMED' : 'REQUEST RECEIVED · REVIEW PENDING'}
          </Badge>
          <h2 className="text-2xl font-bold">Booking reference</h2>
          <p className="text-neutral-300">Your documents are under team review. You will see the next step in My bookings. Payment is at handover.</p>
          <div className="w-full max-w-md rounded-xl bg-neutral-950 p-4 text-left space-y-2">
            <p><span className="text-neutral-400">Reference: </span><strong>{booking.id}</strong></p>
            <p><span className="text-neutral-400">Bike: </span>{booking.bike.brand} {booking.bike.model}</p>
            <p><span className="text-neutral-400">Pickup hub: </span>{booking.pickupHubName}</p>
            <p><span className="text-neutral-400">Pay at handover: </span>₹{booking.pricing.totalPayableAtHandoverInr}</p>
          </div>
          <a href={bookingWhatsAppUrl} target="_blank" rel="noreferrer" className="min-h-11 inline-flex items-center rounded-lg border border-emerald-500/60 bg-emerald-500/10 px-4 font-semibold text-emerald-200 hover:bg-emerald-500/20">
            Send request details to booking desk on WhatsApp
          </a>
          <p className="text-xs text-neutral-400">WhatsApp opens with your booking details ready to send to 9573213150.</p>
          <div className="flex gap-3">
            <Link to="/my-bookings" className="min-h-11 inline-flex items-center rounded-lg bg-amber-400 px-4 font-semibold text-black">My bookings</Link>
            <Link to="/browse" className="min-h-11 inline-flex items-center rounded-lg border border-neutral-600 px-4">Browse bikes</Link>
          </div>
        </Card>
      )}
    </div>
  );
};
