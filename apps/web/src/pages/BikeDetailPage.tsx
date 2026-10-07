import React, { useState, useEffect, useMemo } from 'react';
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
  ChevronLeft,
  ChevronRight,
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
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [blockedRanges, setBlockedRanges] = useState<NonNullable<AvailabilityResponse['blockedRanges']>>([]);
  const [calendarUnavailable, setCalendarUnavailable] = useState(false);
  const [isLoadingCalendar, setIsLoadingCalendar] = useState(true);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [calendarRetry, setCalendarRetry] = useState(0);

  const calendarDays = useMemo(() => {
    const daysInMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0).getDate();
    return Array.from({ length: daysInMonth }, (_, index) => new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), index + 1));
  }, [calendarMonth]);

  const calendarWeeks = useMemo(() => {
    const leadingDays = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1).getDay();
    const cells: (Date | null)[] = [
      ...Array.from({ length: leadingDays }, () => null),
      ...calendarDays,
    ];
    while (cells.length % 7 !== 0) cells.push(null);
    return Array.from({ length: cells.length / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
  }, [calendarDays, calendarMonth]);

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

  useEffect(() => {
    if (!id) return;
    let active = true;
    const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const nextMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    setIsLoadingCalendar(true);
    setCalendarError(null);
    apiClient.checkAvailability(id, monthStart.toISOString(), nextMonth.toISOString())
      .then((result) => {
        if (!active) return;
        const ranges = result.blockedRanges || [];
        setBlockedRanges(ranges);
        setCalendarUnavailable(!result.available && ranges.length === 0);
      })
      .catch((err: any) => {
        if (active) setCalendarError(err.message || 'Unable to load blocked dates.');
      })
      .finally(() => { if (active) setIsLoadingCalendar(false); });
    return () => { active = false; };
  }, [id, calendarMonth, calendarRetry]);

  const handleCheckAvailability = async () => {
    if (!id || !checkStart || !checkEnd) return;
    if (new Date(checkEnd) <= new Date(checkStart)) {
      setAvailabilityError('Return time must be later than pickup time.');
      setAvailabilityResult(null);
      return;
    }
    setAvailabilityError(null);
    setIsCheckingAvailability(true);
    try {
      const res = await apiClient.checkAvailability(id, checkStart, checkEnd);
      setAvailabilityResult(res);
    } catch (err: any) {
      setAvailabilityResult(null);
      setAvailabilityError(err.message || 'Unable to check availability. Try again.');
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
  const monthLabel = calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const blockedDate = (date: Date) => calendarUnavailable || blockedRanges.some((range) => {
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
    return new Date(range.start).getTime() < dayEnd && new Date(range.end).getTime() > dayStart;
  });

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
                width={1000}
                height={750}
                fetchPriority="high"
                decoding="async"
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
                    className={`min-w-[88px] min-h-[72px] rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${
                      activeImageIndex === idx
                        ? 'border-amber-500 scale-105'
                        : 'border-neutral-800 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img src={img} alt="" width={176} height={144} loading="lazy" decoding="async" className="w-full h-full object-cover" />
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
              <span className="font-semibold text-neutral-300">Owner-provided notes: </span>
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
                  PICKUP HUB
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

            <section aria-label="Blocked dates calendar" className="mb-6 border-b border-neutral-800 pb-5">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="text-sm font-bold text-neutral-100">Blocked Dates</h2>
                <div className="flex items-center gap-1">
                  <button type="button" aria-label="Previous month" onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="min-w-[44px] min-h-[44px] rounded-lg text-neutral-300 hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-amber-500">
                    <ChevronLeft className="w-4 h-4 mx-auto" aria-hidden="true" />
                  </button>
                  <button type="button" aria-label="Next month" onClick={() => setCalendarMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="min-w-[44px] min-h-[44px] rounded-lg text-neutral-300 hover:bg-neutral-800 focus-visible:ring-2 focus-visible:ring-amber-500">
                    <ChevronRight className="w-4 h-4 mx-auto" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <p className="text-xs font-medium text-neutral-300 mb-3" aria-live="polite">{monthLabel}</p>
              {isLoadingCalendar ? (
                <p role="status" className="text-xs text-neutral-400">Loading calendar…</p>
              ) : calendarError ? (
                <div className="flex flex-col items-start gap-2">
                  <p role="alert" aria-live="polite" className="text-xs text-rose-300">{calendarError}</p>
                  <button type="button" onClick={() => setCalendarRetry((attempt) => attempt + 1)} className="min-h-[44px] px-2 text-xs font-semibold text-amber-400 underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-amber-500 rounded-lg">Retry calendar</button>
                </div>
              ) : (
                <>
                  <table className="w-full table-fixed text-center text-xs" aria-label={`${monthLabel} availability`}>
                    <caption className="sr-only">Blocked dates for {monthLabel}</caption>
                    <thead>
                      <tr>{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <th key={day} scope="col" className="py-1 font-medium text-neutral-400">{day}</th>)}</tr>
                    </thead>
                    <tbody>
                      {calendarWeeks.map((week, weekIndex) => (
                        <tr key={`week-${weekIndex}`}>
                          {week.map((date, dayIndex) => {
                            if (!date) return <td key={`empty-${weekIndex}-${dayIndex}`} aria-hidden="true" />;
                            const isBlocked = blockedDate(date);
                            return (
                              <td key={date.toISOString()} className="py-0.5">
                                <time dateTime={date.toISOString()} aria-label={`${date.toLocaleDateString()}: ${isBlocked ? 'unavailable' : 'no blocked reservation listed'}`} className={`min-h-9 w-full flex items-center justify-center rounded-lg ${isBlocked ? 'bg-rose-950/60 text-rose-200 line-through' : 'text-neutral-200'}`}>
                                  {date.getDate()}
                                </time>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-3 flex items-center gap-2 text-[11px] text-neutral-400"><span className="w-3 h-3 rounded bg-rose-950/60 border border-rose-800" aria-hidden="true" /> Unavailable</div>
                  {calendarUnavailable && <p className="mt-2 text-xs text-neutral-300">This vehicle is currently marked unavailable.</p>}
                </>
              )}
            </section>

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
                          This slot was available when checked. Continue to booking to submit a request.
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
              {availabilityError && <p role="alert" aria-live="polite" className="text-xs text-rose-300">{availabilityError}</p>}
            </div>

            {/* Direct Booking CTA */}
            <Link to={`/book/${bike.id}`} className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-3.5 text-base font-bold text-slate-950 shadow-lg shadow-amber-500/10 hover:bg-amber-400 focus-visible:ring-2 focus-visible:ring-amber-500">
              Proceed to Book <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>

            <div className="mt-4 pt-4 border-t border-neutral-800 text-[11px] text-neutral-400 flex flex-col gap-1.5">
              <span className="flex items-center gap-1.5 text-neutral-300">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
              <span>Pay at Handover</span>
              </span>
              <span>• Deposit options and amount appear in the booking flow</span>
              <span>• Mandatory ICFAI Student ID at pickup</span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
