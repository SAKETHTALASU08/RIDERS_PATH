import React, { useState, useEffect } from 'react';
import {
  Bike,
  ShieldCheck,
  Upload,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  TrendingUp,
  DollarSign,
  Clock,
  Check,
} from 'lucide-react';
import { OwnerOnboarding, OwnerListing, BikeType, FuelType, Transmission } from '@riders-path/shared';
import { apiClient } from '../api/client';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import { PLATFORM_CONFIG } from '@riders-path/shared';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { ErrorState } from '../components/ui/ErrorState';

export const OwnerOnboardPage: React.FC = () => {
  const { user, openAuthModal } = useAuth();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'onboard' | 'listings' | 'earnings'>('onboard');
  const [listings, setListings] = useState<OwnerListing[]>([]);
  const [isLoadingListings, setIsLoadingListings] = useState(false);
  const [listingsError, setListingsError] = useState<string | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});

  // Form fields
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState(2023);
  const [bikeType, setBikeType] = useState<BikeType>('scooter');
  const [fuelType, setFuelType] = useState<FuelType>('petrol');
  const [transmission, setTransmission] = useState<Transmission>('automatic');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [hourlyRateInr, setHourlyRateInr] = useState(50);
  const [dailyRateInr, setDailyRateInr] = useState(350);
  const [preferredHubId, setPreferredHubId] = useState(PLATFORM_CONFIG.hubs[0]?.id || '');
  const [payoutUpiId, setPayoutUpiId] = useState('');
  const [bikePhotoPreview, setBikePhotoPreview] = useState('');
  const [rcPreview, setRcPreview] = useState('');
  const [insurancePreview, setInsurancePreview] = useState('');
  const [responsibilityAgreed, setResponsibilityAgreed] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formFieldErrors, setFormFieldErrors] = useState<Record<string, string>>({});
  const [submissionSuccess, setSubmissionSuccess] = useState(false);

  const [idempotencyKey] = useState(() => 'idemp_own_' + Math.random().toString(36).substring(2, 10));

  const fetchListings = async () => {
    setIsLoadingListings(true);
    setListingsError(null);
    try {
      const data = await apiClient.getOwnerListings();
      setListings(data);
    } catch (err: any) {
      setListingsError(err.message || 'Unable to load your listings. Please try again.');
    } finally {
      setIsLoadingListings(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'listings' || activeTab === 'earnings') {
      fetchListings();
    }
  }, [activeTab]);

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (preview: string) => void,
    fieldName: string,
    errorKey: string
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadErrors((current) => ({ ...current, [errorKey]: '' }));
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setUploadErrors((current) => ({ ...current, [errorKey]: `${fieldName} must be a JPEG, PNG, or WebP image.` }));
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadErrors((current) => ({ ...current, [errorKey]: `${fieldName} must be 5 MB or smaller.` }));
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => setter(reader.result as string);
    reader.onerror = () => setUploadErrors((current) => ({ ...current, [errorKey]: `Could not read ${fieldName}. Choose another file.` }));
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setFormFieldErrors({});

    if (!user || !user.emailVerified || !user.profileComplete) {
      openAuthModal();
      return;
    }

    if (!bikePhotoPreview) {
      setFormError('Please upload at least one vehicle photo');
      return;
    }
    if (!rcPreview) {
      setFormError('Please upload a photo of your vehicle RC (Registration Certificate)');
      return;
    }
    if (!insurancePreview) {
      setFormError('Please upload your active vehicle insurance policy document');
      return;
    }
    if (!responsibilityAgreed) {
      setFormError('You must accept the owner legal responsibility agreement');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: OwnerOnboarding = {
        brand,
        model,
        year: Number(year),
        bikeType,
        fuelType,
        transmission,
        registrationNumber,
        hourlyRateInr: Number(hourlyRateInr),
        dailyRateInr: Number(dailyRateInr),
        preferredHubId,
        images: [bikePhotoPreview],
        rcDocumentImage: rcPreview,
        insuranceDocumentImage: insurancePreview,
        payoutUpiId,
        ownerResponsibilityAgreed: true,
        termsVersionAgreed: PLATFORM_CONFIG.termsVersion,
        idempotencyKey,
      };

      await apiClient.submitOwnerOnboarding(payload);
      toast.success('Listing request received', 'You can follow its review status in My Listings.');
      setSubmissionSuccess(true);
      fetchListings();
    } catch (err: any) {
      setFormFieldErrors(err.fieldErrors || {});
      setFormError(err.message || 'Failed to submit bike for onboarding');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 w-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-amber-400 mb-1.5">
            <Bike className="w-3.5 h-3.5" />
            <span>CAMPUS OWNER PROGRAM</span>
          </div>
          <h1 className="text-3xl font-bold font-heading text-neutral-100">
            List Your Two-Wheeler
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Submit your bike for review, then track its status and reported earnings here.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex flex-wrap bg-neutral-900 border border-neutral-800 p-1 rounded-xl text-xs font-semibold" role="group" aria-label="Owner dashboard sections">
          <button
            type="button"
            aria-pressed={activeTab === 'onboard'}
            onClick={() => setActiveTab('onboard')}
          className={`min-h-[44px] px-3.5 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'onboard'
                ? 'bg-neutral-800 text-amber-400'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Add Bike
          </button>
          <button
            type="button"
            aria-pressed={activeTab === 'listings'}
            onClick={() => setActiveTab('listings')}
          className={`min-h-[44px] px-3.5 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'listings'
                ? 'bg-neutral-800 text-amber-400'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            My Listings ({listings.length})
          </button>
          <button
            type="button"
            aria-pressed={activeTab === 'earnings'}
            onClick={() => setActiveTab('earnings')}
          className={`min-h-[44px] px-3.5 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'earnings'
                ? 'bg-neutral-800 text-amber-400'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Earnings Desk
          </button>
        </div>
      </div>

      {/* TAB 1: Onboarding Form */}
      {activeTab === 'onboard' && (
        <>
          {submissionSuccess ? (
            <Card className="text-center p-8 border-emerald-800/80 bg-emerald-950/20">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <h2 className="text-xl font-bold text-neutral-100 mb-1">
                Vehicle Listing Submitted Successfully!
              </h2>
              <p className="text-xs text-neutral-300 max-w-md mx-auto mb-6">
                Your listing request is awaiting review. Its current status and any requested changes will appear under My Listings.
              </p>
              <Button onClick={() => setActiveTab('listings')} variant="primary">
                View Listing Status
              </Button>
            </Card>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-6">
              {/* Vehicle Info Card */}
              <Card className="flex flex-col gap-4">
                <h2 className="text-base font-bold text-neutral-100 border-b border-neutral-800 pb-2">
                  1. Vehicle Details
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Vehicle Brand"
                    required
                    placeholder="e.g. Honda, Ather, Yamaha"
                    value={brand}
                    onChange={(e) => { setBrand(e.target.value); setFormFieldErrors((prev) => ({ ...prev, brand: '' })); }}
                    error={formFieldErrors.brand}
                  />
                  <Input
                    label="Model Name"
                    required
                    placeholder="e.g. Activa 6G, 450X, MT-15"
                    value={model}
                    onChange={(e) => { setModel(e.target.value); setFormFieldErrors((prev) => ({ ...prev, model: '' })); }}
                    error={formFieldErrors.model}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Input
                    label="Model Year"
                    type="number"
                    min={2014}
                    max={2027}
                    required
                    value={year}
                    onChange={(e) => { setYear(Number(e.target.value)); setFormFieldErrors((prev) => ({ ...prev, year: '' })); }}
                    error={formFieldErrors.year}
                  />

                  <Select
                    label="Category"
                    value={bikeType}
                    onChange={(e) => { setBikeType(e.target.value as BikeType); setFormFieldErrors((prev) => ({ ...prev, bikeType: '' })); }}
                    error={formFieldErrors.bikeType}
                    options={[
                      { value: 'scooter', label: 'Scooter' },
                      { value: 'commuter', label: 'Commuter' },
                      { value: 'sports', label: 'Sports' },
                      { value: 'cruiser', label: 'Cruiser' },
                      { value: 'electric', label: 'Electric' },
                    ]}
                  />

                  <Select
                    label="Fuel Type"
                    value={fuelType}
                    onChange={(e) => { setFuelType(e.target.value as FuelType); setFormFieldErrors((prev) => ({ ...prev, fuelType: '' })); }}
                    error={formFieldErrors.fuelType}
                    options={[
                      { value: 'petrol', label: 'Petrol' },
                      { value: 'electric', label: 'Electric (EV)' },
                    ]}
                  />

                  <Select
                    label="Transmission"
                    value={transmission}
                    onChange={(e) => { setTransmission(e.target.value as Transmission); setFormFieldErrors((prev) => ({ ...prev, transmission: '' })); }}
                    error={formFieldErrors.transmission}
                    options={[
                      { value: 'automatic', label: 'Automatic' },
                      { value: 'manual', label: 'Manual' },
                    ]}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Official Registration Plate Number"
                    required
                    placeholder="e.g. TS08EP4921"
                    value={registrationNumber}
                    onChange={(e) => { setRegistrationNumber(e.target.value.toUpperCase()); setFormFieldErrors((prev) => ({ ...prev, registrationNumber: '' })); }}
                    error={formFieldErrors.registrationNumber}
                    helperText="Masked on public cards (e.g. TS08-****) for privacy"
                  />

                  <Select
                    label="Preferred Campus Hub"
                    value={preferredHubId}
                    onChange={(e) => { setPreferredHubId(e.target.value); setFormFieldErrors((prev) => ({ ...prev, preferredHubId: '' })); }}
                    error={formFieldErrors.preferredHubId}
                    options={PLATFORM_CONFIG.hubs.map((h) => ({
                      value: h.id,
                      label: `${h.name} (${h.code})`,
                    }))}
                  />
                </div>
              </Card>

              {/* Pricing & Payout Card */}
              <Card className="flex flex-col gap-4">
                <h2 className="text-base font-bold text-neutral-100 border-b border-neutral-800 pb-2">
                  2. Pricing & Payout UPI
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Hourly Rate (₹)"
                    type="number"
                    min={20}
                    max={250}
                    required
                    value={hourlyRateInr}
                    onChange={(e) => { setHourlyRateInr(Number(e.target.value)); setFormFieldErrors((prev) => ({ ...prev, hourlyRateInr: '' })); }}
                    error={formFieldErrors.hourlyRateInr}
                    helperText="Recommended: ₹40 - ₹80/hr"
                  />

                  <Input
                    label="24-Hour Max Cap Rate (₹)"
                    type="number"
                    min={200}
                    max={2000}
                    required
                    value={dailyRateInr}
                    onChange={(e) => { setDailyRateInr(Number(e.target.value)); setFormFieldErrors((prev) => ({ ...prev, dailyRateInr: '' })); }}
                    error={formFieldErrors.dailyRateInr}
                    helperText="Max daily rate cap for full-day rentals"
                  />
                </div>

                  <Input
                    label="Payout UPI ID"
                  required
                  placeholder="student@okhdfcbank"
                  value={payoutUpiId}
                  onChange={(e) => { setPayoutUpiId(e.target.value); setFormFieldErrors((prev) => ({ ...prev, payoutUpiId: '' })); }}
                  error={formFieldErrors.payoutUpiId}
                    helperText="Payout timing and terms are pending legal review."
                />
              </Card>

              {/* Photos & Document Uploads */}
              <Card className="flex flex-col gap-4">
                <h2 className="text-base font-bold text-neutral-100 border-b border-neutral-800 pb-2">
                  3. Photos & Ownership Documentation
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Bike Photo */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-neutral-300">
                      Vehicle Photo *
                    </label>
                    <div className="h-32 border-2 border-dashed border-neutral-700 rounded-xl flex items-center justify-center relative bg-neutral-950 p-2 overflow-hidden">
                      {bikePhotoPreview ? (
                        <img src={bikePhotoPreview} alt="Vehicle photo preview" width={320} height={180} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[11px] text-neutral-500 text-center">Click to upload photo</span>
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => handleFileUpload(e, setBikePhotoPreview, 'Vehicle photo', 'bikePhoto')}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        aria-label="Upload vehicle photo"
                      />
                    </div>
                    {uploadErrors.bikePhoto && <p role="alert" aria-live="polite" className="text-xs text-rose-400">{uploadErrors.bikePhoto}</p>}
                  </div>

                  {/* RC Photo */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-neutral-300">
                      RC Document Scan *
                    </label>
                    <div className="h-32 border-2 border-dashed border-neutral-700 rounded-xl flex items-center justify-center relative bg-neutral-950 p-2 overflow-hidden">
                      {rcPreview ? (
                        <img src={rcPreview} alt="Registration document preview" width={320} height={180} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[11px] text-neutral-500 text-center">Upload RC image</span>
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => handleFileUpload(e, setRcPreview, 'Registration document', 'rc')}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        aria-label="Upload RC photo"
                      />
                    </div>
                    {uploadErrors.rc && <p role="alert" aria-live="polite" className="text-xs text-rose-400">{uploadErrors.rc}</p>}
                  </div>

                  {/* Insurance Photo */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-neutral-300">
                      Insurance Policy *
                    </label>
                    <div className="h-32 border-2 border-dashed border-neutral-700 rounded-xl flex items-center justify-center relative bg-neutral-950 p-2 overflow-hidden">
                      {insurancePreview ? (
                        <img src={insurancePreview} alt="Insurance document preview" width={320} height={180} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-[11px] text-neutral-500 text-center">Upload Insurance</span>
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => handleFileUpload(e, setInsurancePreview, 'Insurance document', 'insurance')}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        aria-label="Upload Insurance document"
                      />
                    </div>
                    {uploadErrors.insurance && <p role="alert" aria-live="polite" className="text-xs text-rose-400">{uploadErrors.insurance}</p>}
                  </div>
                </div>
              </Card>

              {/* Owner Legal Responsibility Notice */}
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 flex flex-col gap-2.5">
                <div className="flex items-center gap-2 font-bold text-amber-300">
                  <ShieldCheck className="w-4 h-4 text-amber-400" />
                  <span>Mandatory Owner Compliance Notice</span>
                </div>
                <p className="leading-relaxed text-neutral-300">
                  Before submitting, confirm the vehicle has valid registration, current insurance, required permits, and that you are authorized to offer it for rent.
                </p>

                <label className="flex items-start gap-2.5 pt-2 text-neutral-100 font-semibold cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={responsibilityAgreed}
                    onChange={(e) => setResponsibilityAgreed(e.target.checked)}
                    className="w-4 h-4 rounded text-amber-500 bg-neutral-800 border-neutral-700 focus:ring-amber-500 mt-0.5"
                  />
                  <span>
                    I confirm the vehicle has valid registration and insurance, required permits are in place, and I am authorized to offer it for rent.
                  </span>
                </label>
                {formFieldErrors.ownerResponsibilityAgreed && <p role="alert" aria-live="polite" className="text-xs text-rose-300">{formFieldErrors.ownerResponsibilityAgreed}</p>}
              </div>

              {formError && (
                <p role="alert" aria-live="polite" className="text-xs font-medium text-rose-400 bg-rose-950/30 p-3 rounded-xl border border-rose-900/50">
                  {formError}
                </p>
              )}

              <Button
                type="submit"
                isLoading={isSubmitting}
                disabled={isSubmitting}
                size="lg"
                variant="primary"
                className="w-full font-bold"
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                Submit Vehicle for Team Review
              </Button>
            </form>
          )}
        </>
      )}

      {/* TAB 2: My Listings */}
      {activeTab === 'listings' && (
        <div className="flex flex-col gap-4">
          {isLoadingListings ? (
            <div className="flex flex-col gap-3" role="status" aria-label="Loading listings">
              <Skeleton height={112} rounded="xl" />
              <Skeleton height={112} rounded="xl" />
            </div>
          ) : listingsError ? (
            <ErrorState message={listingsError} onRetry={fetchListings} />
          ) : listings.length === 0 ? (
            <Card className="text-center p-8">
              <p className="text-xs text-neutral-400 mb-4">You have not submitted any vehicles yet.</p>
              <Button size="sm" onClick={() => setActiveTab('onboard')}>
                List Your First Two-Wheeler
              </Button>
            </Card>
          ) : (
            listings.map((item) => (
              <Card key={item.id} className="p-5 flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-bold text-neutral-100">
                      {item.bike.brand} {item.bike.model} ({item.bike.year})
                    </h3>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      Plate: {item.bike.registrationMasked} • Hub: {item.bike.hubName}
                    </p>
                  </div>

                  <Badge variant={item.status === 'APPROVED' ? 'success' : item.status === 'PENDING_APPROVAL' ? 'warning' : 'danger'}>
                    {item.status === 'PENDING_APPROVAL' ? 'Pending review' : item.status === 'CHANGES_REQUESTED' ? 'Changes requested' : item.status === 'APPROVED' ? 'Approved' : 'Not approved'}
                  </Badge>
                </div>

                {item.adminNotes && (
                  <div className="p-3 rounded-xl bg-neutral-950 border border-neutral-800 text-xs text-neutral-300">
                    <span className="font-semibold text-neutral-200">Review team notes: </span>
                    {item.adminNotes}
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      )}

      {/* TAB 3: Earnings Desk */}
      {activeTab === 'earnings' && (
        <div className="flex flex-col gap-6">
          {isLoadingListings ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" role="status" aria-label="Loading earnings">
              <Skeleton height={108} rounded="xl" /><Skeleton height={108} rounded="xl" /><Skeleton height={108} rounded="xl" />
            </div>
          ) : listingsError ? (
            <ErrorState message={listingsError} onRetry={fetchListings} />
          ) : listings.length === 0 ? (
            <Card className="text-center p-8"><p className="text-sm text-neutral-300">Earnings will appear after your listing has bookings.</p></Card>
          ) : <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="p-5">
              <span className="text-xs text-neutral-400 block mb-1">Total Net Earnings</span>
              <span className="text-2xl font-bold font-mono text-emerald-400">
                ₹{listings.reduce((acc, l) => acc + l.earnings.netEarningsInr, 0)}
              </span>
            </Card>
            <Card className="p-5">
              <span className="text-xs text-neutral-400 block mb-1">Rented Hours</span>
              <span className="text-2xl font-bold font-mono text-amber-400">
                {listings.reduce((acc, l) => acc + l.earnings.totalRentedHours, 0)} hrs
              </span>
            </Card>
            <Card className="p-5">
              <span className="text-xs text-neutral-400 block mb-1">Pending Payouts</span>
              <span className="text-2xl font-bold font-mono text-neutral-100">
                ₹{listings.reduce((acc, l) => acc + l.earnings.payoutsPendingInr, 0)}
              </span>
            </Card>
          </div>}
        </div>
      )}
    </div>
  );
};
