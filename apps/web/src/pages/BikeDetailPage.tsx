import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  Star,
  Fuel,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Clock,
  Zap,
  Info,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { PublicBikeDto, AvailabilityResponse } from '@riders-path/shared';
import { apiClient } from '../api/client';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/ErrorState';
import { DateTimePicker } from '../components/ui/DateTimePicker';
import { PLATFORM_CONFIG } from '@riders-path/shared';

export const BikeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [bike, setBike] = useState<PublicBikeDto | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Live availability test widget inside detail page
  const defaultStart = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
  const defaultEnd = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
  const [checkStart, setCheckStart] = useState(defaultStart);
  const [checkEnd, setCheckEnd] = useState(defaultEnd);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [availabilityResult, setAvailabilityResult] = useState<AvailabilityResponse | null>(null);

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    apiClient
      .getBikeById(id)
      .then((data) => setBike(data))
      .catch((err) => setError(err.message || 'Bike not found in campus catalog'))
      .finally(() => setIsLoading(false));
  }, [id]);

  const handleCheckAvailability = async () => {
    if (!id || !checkStart || !checkEnd) return;
    setIsCheckingAvailability(true);
    try {
      const res = await apiClient.checkAvailability(id, checkStart, checkEnd);
      setAvailabilityResult(res);
    } catch (err: any) {
      setAvailabilityResult({ available: false, reason: err.message || 'Failed to check' });
    } finally {
      setIsCheckingAvailability(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 w-full">
        <Skeleton width={120} height={36} className="mb-6" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <Skeleton height={380} rounded="2xl" />
          </div>
          <div>
            <Skeleton height={380} rounded="2xl" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !bike) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16">
        <ErrorState
          title="Vehicle Not Found"
          message={error || 'This two-wheeler is no longer active in the fleet.'}
          onRetry={() => navigate('/browse')}
        />
      </div>
    );
  }

  const hubDetails = PLATFORM_CONFIG.hubs.find((h) => h.id === bike.hubId);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 w-full">
      {/* Back button */}
      <Link
        to="/browse"
        className="inline-flex items-center gap-2 text-xs font-semibold text-neutral-400 hover:text-neutral-100 transition-colors mb-6 min-h-[44px] focus-visible:ring-2 focus-visible:ring-amber-500 rounded-lg p-1"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Campus Fleet</span>
      </Link>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Gallery, Specs, Hub details */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {/* Main Gallery */}
          <div className="flex flex-col gap-3">
            <div className="relative h-72 sm:h-96 w-full rounded-3xl overflow-hidden bg-neutral-900 border border-neutral-800">
              <img
                src={bike.images[activeImageIndex] || bike.images[0]}
                alt={`${bike.brand} ${bike.model}`}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-4 left-4 flex gap-2">
                <Badge variant="accent" size="md">
                  {bike.bikeType.toUpperCase()}
                </Badge>
                {bike.fuelType === 'electric' && (
                  <Badge variant="info" size="md">
                    ELECTRIC
                  </Badge>
                )}
              </div>
            </div>

            {/* Thumbnail selector */}
            {bike.images.length > 1 && (
              <div className="flex gap-2">
                {bike.images.map((img, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveImageIndex(idx)}
                    aria-label={`View photo ${idx + 1}`}
                    className={`w-20 h-16 rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${
                      activeImageIndex === idx
                        ? 'border-amber-500 scale-105'
                        : 'border-neutral-800 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={img} alt="Thumbnail" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Title & Description */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-neutral-100">
                {bike.brand} {bike.model}
              </h1>
              <div className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-800 px-3 py-1 rounded-xl text-xs font-mono font-bold text-amber-400">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span>{bike.rating.toFixed(2)} rating</span>
                <span className="text-neutral-500">•</span>
                <span className="text-neutral-400">{bike.totalTrips} campus trips</span>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-neutral-400">
              {bike.conditionNotes}
            </p>
          </div>

          {/* Vehicle Specifications */}
          <Card>
            <h2 className="text-sm font-bold font-heading text-neutral-200 uppercase tracking-wider mb-4">
              Vehicle Specifications
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div className="p-3 rounded-xl bg-neutral-950/60 border border-neutral-800/80">
                <span className="text-neutral-500 block mb-1">Make / Year</span>
                <span className="font-semibold text-neutral-200">{bike.year}</span>
              </div>
              <div className="p-3 rounded-xl bg-neutral-950/60 border border-neutral-800/80">
                <span className="text-neutral-500 block mb-1">Fuel Type</span>
                <span className="font-semibold text-neutral-200 uppercase">{bike.fuelType}</span>
              </div>
              <div className="p-3 rounded-xl bg-neutral-950/60 border border-neutral-800/80">
                <span className="text-neutral-500 block mb-1">Transmission</span>
                <span className="font-semibold text-neutral-200 uppercase">{bike.transmission}</span>
              </div>
              <div className="p-3 rounded-xl bg-neutral-950/60 border border-neutral-800/80">
                <span className="text-neutral-500 block mb-1">Handover Plate</span>
                <span className="font-mono font-bold text-amber-400">{bike.registrationMasked}</span>
              </div>
            </div>

            {/* Included amenities */}
            <div className="mt-5 pt-4 border-t border-neutral-800/80">
              <span className="text-xs font-semibold text-neutral-300 block mb-2.5">
                Included with this rental:
              </span>
              <div className="flex flex-wrap gap-2">
                {bike.features.map((feat, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 text-xs font-mono text-neutral-200 bg-neutral-800/80 border border-neutral-700/60 px-3 py-1 rounded-lg"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{feat}</span>
                  </span>
                ))}
              </div>
            </div>
          </Card>

          {/* Pickup Hub Details */}
          <Card>
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-xs font-mono text-amber-400 block mb-1">
                  OFFICIAL CAMPUS PICKUP HUB
                </span>
                <h3 className="text-base font-bold text-neutral-100 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-amber-400" />
                  <span>{bike.hubName}</span>
                </h3>
                {hubDetails && (
                  <div className="mt-2 text-xs text-neutral-400 flex flex-col gap-1">
                    <p>Landmark: {hubDetails.landmark}</p>
                    <p className="flex items-center gap-1.5 text-neutral-300">
                      <Clock className="w-3.5 h-3.5 text-neutral-500" />
                      <span>Operating Hours: {hubDetails.operatingHours}</span>
                    </p>
                  </div>
                )}
              </div>
              {hubDetails && (
                <Badge variant="default" size="md">
                  {hubDetails.code}
                </Badge>
              )}
            </div>
          </Card>
        </div>

        {/* Right Column: Pricing & Live Availability Card */}
        <div className="flex flex-col gap-6">
          <Card className="p-6 sticky top-24 border-neutral-700/80">
            {/* Rate Header */}
            <div className="mb-6 pb-5 border-b border-neutral-800">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-extrabold font-mono text-amber-400">
                  ₹{bike.hourlyRateInr}
                </span>
                <span className="text-xs text-neutral-400">/ hour</span>
              </div>
              <p className="text-xs font-mono text-neutral-400 mt-1">
                Max ₹{bike.dailyRateInr} per 24 hours
              </p>
            </div>

            {/* Live Availability Checker */}
            <div className="flex flex-col gap-3.5 mb-6">
              <span className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                Check Real-Time Availability
              </span>

              <DateTimePicker
                id="check-start"
                label="Pickup Time"
                value={checkStart}
                onChange={setCheckStart}
                min={new Date().toISOString()}
              />

              <DateTimePicker
                id="check-end"
                label="Return Time"
                value={checkEnd}
                onChange={setCheckEnd}
                min={checkStart}
              />

              <Button
                variant="secondary"
                size="sm"
                onClick={handleCheckAvailability}
                isLoading={isCheckingAvailability}
                className="w-full mt-1"
              >
                Check Slot Availability
              </Button>

              {/* Result banner */}
              {availabilityResult && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-start gap-2 animate-in fade-in ${
                    availabilityResult.available
                      ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
                      : 'bg-rose-950/40 border-rose-800/80 text-rose-200'
                  }`}
                >
                  {availabilityResult.available ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Available for booking!</p>
                        <p className="text-[11px] text-emerald-300/80 mt-0.5">
                          Coordinator ready at {bike.hubName}.
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold">Unavailable for slot</p>
                        <p className="text-[11px] text-rose-300/80 mt-0.5">
                          {availabilityResult.reason}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Direct Booking CTA */}
            <Link to={`/book/${bike.id}`}>
              <Button
                variant="primary"
                size="lg"
                className="w-full text-base font-bold shadow-lg shadow-amber-500/10"
                rightIcon={<ArrowRight className="w-4 h-4" />}
              >
                Proceed to Book
              </Button>
            </Link>

            <div className="mt-4 pt-4 border-t border-neutral-800 text-[11px] text-neutral-400 flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-neutral-300">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                <span>Zero online prepayment — Pay at Handover</span>
              </span>
              <span>• Refundable deposit: Laptop or ₹1,500</span>
              <span>• Mandatory ICFAI Student ID at pickup</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
