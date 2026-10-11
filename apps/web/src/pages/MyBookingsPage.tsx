import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarCheck,
  Clock,
  MapPin,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ArrowRight,
  QrCode,
  AlertTriangle,
} from 'lucide-react';
import { BookingResponse, BookingStatus } from '@riders-path/shared';
import { apiClient } from '../api/client';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { Input } from '../components/ui/Input';

const BOOKING_STAGES: Array<{ status: BookingStatus; label: string }> = [
  { status: 'PENDING_VERIFICATION', label: 'Team review' },
  { status: 'CONFIRMED', label: 'Confirmed' },
  { status: 'ACTIVE', label: 'In progress' },
  { status: 'COMPLETED', label: 'Completed' },
];

const BookingTimeline: React.FC<{ status: BookingStatus }> = ({ status }) => {
  const currentIndex = BOOKING_STAGES.findIndex((stage) => stage.status === status);
  const isClosed = status === 'CANCELLED' || status === 'REJECTED';
  return (
    <section aria-label="Booking status timeline">
      <ol className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {BOOKING_STAGES.map((stage, index) => {
          const complete = !isClosed && currentIndex > index;
          const current = !isClosed && currentIndex === index;
          return (
            <li key={stage.status} aria-current={current ? 'step' : undefined} className={`min-h-[44px] rounded-xl border px-3 py-2 text-xs flex items-center gap-2 ${complete ? 'border-emerald-800 bg-emerald-950/30 text-emerald-200' : current ? 'border-amber-600 bg-amber-500/10 text-amber-200' : 'border-neutral-800 bg-neutral-950/50 text-neutral-400'}`}>
              <span aria-hidden="true" className="w-2 h-2 rounded-full bg-current shrink-0" />
              <span>{stage.label}</span>
            </li>
          );
        })}
      </ol>
      {isClosed && <p role="status" className="mt-2 text-xs text-neutral-300">Booking closed: {status === 'REJECTED' ? 'not approved' : 'cancelled'}.</p>}
    </section>
  );
};

export const MyBookingsPage: React.FC = () => {
  const { user, openAuthModal } = useAuth();
  const toast = useToast();

  const [bookings, setBookings] = useState<BookingResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cancellation modal state
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [bookingToCancel, setBookingToCancel] = useState<BookingResponse | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  const fetchBookings = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const list = await apiClient.getUserBookings();
      setBookings(list);
    } catch (err: any) {
      setError(err.message || 'Unable to retrieve your bookings');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const handleOpenCancel = (b: BookingResponse) => {
    setBookingToCancel(b);
    setCancelReason('');
    setCancelModalOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!bookingToCancel) return;
    setIsCancelling(true);
    try {
      await apiClient.cancelBooking(bookingToCancel.id, cancelReason || 'Cancelled by student');
      toast.info('Booking Cancelled', 'Your reservation was cancelled successfully.');
      setCancelModalOpen(false);
      await fetchBookings();
    } catch (err: any) {
      toast.error('Cancellation Failed', err.message || 'Could not cancel booking.');
    } finally {
      setIsCancelling(false);
    }
  };

  // Helper for status badge
  const getStatusBadge = (status: BookingStatus) => {
    switch (status) {
      case 'CONFIRMED':
        return <Badge variant="success">CONFIRMED</Badge>;
      case 'ACTIVE':
        return <Badge variant="accent">RIDE IN PROGRESS</Badge>;
      case 'PENDING_VERIFICATION':
        return <Badge variant="warning">PENDING REVIEW</Badge>;
      case 'COMPLETED':
        return <Badge variant="default">COMPLETED</Badge>;
      case 'CANCELLED':
      case 'REJECTED':
        return <Badge variant="danger">{status}</Badge>;
    }
  };

  // Helper for status next steps
  const getNextStepGuidance = (status: BookingStatus, hub: string) => {
    switch (status) {
      case 'CONFIRMED':
        return {
          title: 'Next step: attend the handover',
          desc: `Meet at ${hub} at the booked time. Bring the selected deposit option and check the vehicle condition with the owner before handover.`,
          type: 'info',
        };
      case 'ACTIVE':
        return {
          title: 'Active Ride in Progress',
          desc: 'Your rental is in progress. Follow applicable road and campus safety rules, and return the vehicle to the selected hub by the booked end time.',
          type: 'accent',
        };
      case 'PENDING_VERIFICATION':
        return {
          title: 'Waiting for team review',
          desc: 'Your request is awaiting document review. Check this page for status changes; wait for confirmation before pickup.',
          type: 'warning',
        };
      case 'COMPLETED':
        return {
          title: 'Rental marked complete',
          desc: 'This booking is marked complete. For a deposit update, follow the agreed handover terms or contact the owner or campus team.',
          type: 'default',
        };
      case 'CANCELLED':
      case 'REJECTED':
        return {
          title: 'Booking closed',
          desc: 'This booking will not proceed. Review any cancellation or review note attached to the booking.',
          type: 'danger',
        };
    }
  };

  if (!user) {
    return (
      <div className="max-w-xl mx-auto px-4 py-16">
        <EmptyState
          title="Sign In to View Your Bookings"
          description="Access your active campus gate passes, rental history, and vehicle pickup details."
          actionLabel="Sign In with Email"
          onAction={openAuthModal}
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 w-full">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-amber-400 mb-1.5">
            <CalendarCheck className="w-3.5 h-3.5" />
            <span>MY CAMPUS RENTALS</span>
          </div>
          <h1 className="text-3xl font-bold font-heading text-neutral-100">
            Student Booking Desk
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Active gate passes, hub instructions, and rental timelines.
          </p>
        </div>

        <Link to="/browse" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-neutral-700 px-3.5 py-2 text-xs font-medium text-neutral-200 hover:bg-neutral-900 focus-visible:ring-2 focus-visible:ring-amber-500">
          Book Another Ride <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
        </Link>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-4">
          {[1, 2].map((i) => (
            <Card key={i} className="p-6">
              <Skeleton width="40%" height={24} className="mb-4" />
              <Skeleton width="100%" height={80} rounded="xl" />
            </Card>
          ))}
        </div>
      )}

      {!isLoading && error && (
        <ErrorState message={error} onRetry={fetchBookings} />
      )}

      {!isLoading && !error && bookings.length === 0 && (
        <EmptyState
          title="No reservations found"
          description="You don't have any past or upcoming rentals on Riders Path."
          actionLabel="Browse Available Fleet"
          onAction={() => (window.location.href = '/browse')}
        />
      )}

      {!isLoading && !error && bookings.length > 0 && (
        <div className="flex flex-col gap-6">
          {bookings.map((b) => {
            const nextStep = getNextStepGuidance(b.status, b.pickupHubName);
            const canCancel = ['CONFIRMED', 'PENDING_VERIFICATION', 'ACTIVE'].includes(b.status);

            return (
              <Card key={b.id} className="p-6 border-neutral-800 flex flex-col gap-5">
                {/* Header */}
                <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-neutral-800">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs text-neutral-400 font-bold">{b.id}</span>
                      {getStatusBadge(b.status)}
                    </div>
                    <h2 className="text-lg font-bold font-heading text-neutral-100">
                      {b.bike.brand} {b.bike.model}
                    </h2>
                  </div>

                  {/* Gate Pass / Handover Code Box */}
                  <div className="flex items-center gap-3 bg-neutral-950 p-2.5 px-3.5 rounded-xl border border-neutral-800">
                    <QrCode className="w-5 h-5 text-amber-400 shrink-0" />
                    <div>
                      <span className="text-[10px] text-neutral-500 uppercase tracking-wider block">
                        {b.status === 'CONFIRMED' || b.status === 'ACTIVE' ? 'Handover Code' : 'Booking Reference'}
                      </span>
                      <span className="text-base font-black font-mono text-amber-400">
                        {b.handoverCode}
                      </span>
                    </div>
                  </div>
                </div>

                <BookingTimeline status={b.status} />
                {b.cancellationReason && <p className="text-xs text-neutral-400">Booking note: {b.cancellationReason}</p>}

                {/* Details grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div className="p-3 rounded-xl bg-neutral-950/60 border border-neutral-800/80">
                    <span className="text-neutral-500 block mb-1">Pickup Hub</span>
                    <span className="font-semibold text-neutral-200 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-amber-400" />
                      {b.pickupHubName}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-neutral-950/60 border border-neutral-800/80">
                    <span className="text-neutral-500 block mb-1">Duration & Schedule</span>
                    <span className="font-semibold text-neutral-200 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-neutral-400" />
                      {new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
                      {new Date(b.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({b.pricing.durationHours} hrs)
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-neutral-950/60 border border-neutral-800/80">
                    <span className="text-neutral-500 block mb-1">Payable at Handover</span>
                    <span className="font-mono font-bold text-amber-400">
                      ₹{b.pricing.totalPayableAtHandoverInr} ({b.depositType === 'laptop' ? 'Laptop Deposit' : '₹1,500 Cash'})
                    </span>
                  </div>
                </div>

                {/* Status Next-Step Guidance Banner */}
                <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800/80 flex items-start gap-3">
                  <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-neutral-200">{nextStep.title}</p>
                    <p className="text-xs text-neutral-400 mt-0.5 leading-relaxed">{nextStep.desc}</p>
                  </div>
                </div>

                {/* Footer Action */}
                {canCancel && (
                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => handleOpenCancel(b)}
                      className="text-xs text-neutral-400 hover:text-rose-400 cursor-pointer min-h-[44px] flex items-center px-2"
                    >
                      Cancel Reservation
                    </button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Cancellation Confirmation Modal */}
      <Modal
        isOpen={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="Cancel Campus Reservation"
        description="Are you sure you want to cancel this booking?"
      >
        <div className="flex flex-col gap-4">
          <p className="text-xs text-neutral-300">
            Cancel this booking at {bookingToCancel?.pickupHubName}? This action cannot be undone. Check the current refund and deposit terms before proceeding.
          </p>
          <Input
            label="Reason (optional)"
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            maxLength={300}
          />

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" size="sm" onClick={() => setCancelModalOpen(false)}>
              Keep Booking
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleConfirmCancel}
              isLoading={isCancelling}
              disabled={isCancelling}
            >
              Confirm Cancellation
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
