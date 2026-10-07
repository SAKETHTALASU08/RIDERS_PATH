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
      fetchBookings();
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
        return <Badge variant="warning">PENDING CLEARANCE</Badge>;
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
          title: 'Next Step: Proceed to Pickup Hub',
          desc: `Head to ${hub} at your booked time. Bring your physical ICFAI student ID card and selected security deposit (laptop/cash). Coordinator will verify and hand over keys.`,
          type: 'info',
        };
      case 'ACTIVE':
        return {
          title: 'Active Ride in Progress',
          desc: 'Ride safely and obey campus speed limit (25 km/h). Mandatory ISI helmet at all times. Return to designated hub before slot end.',
          type: 'accent',
        };
      case 'PENDING_VERIFICATION':
        return {
          title: 'Coordinator Verification Underway',
          desc: 'Our student coordinator is reviewing your Driving Licence and student credentials. You will receive handover clearance shortly.',
          type: 'warning',
        };
      case 'COMPLETED':
        return {
          title: 'Rental Completed & Deposit Returned',
          desc: 'Handover inspection cleared. Deposit returned. Thank you for keeping the ICFAI campus community safe!',
          type: 'default',
        };
      case 'CANCELLED':
      case 'REJECTED':
        return {
          title: 'Reservation Closed',
          desc: 'This booking is cancelled. No charges or penalties incurred.',
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
          actionLabel="Sign In with Campus Email"
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

        <Link to="/browse">
          <Button size="sm" variant="outline" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
            Book Another Ride
          </Button>
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
            const canCancel = b.status === 'CONFIRMED' || b.status === 'PENDING_VERIFICATION';

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
                        Handover Code
                      </span>
                      <span className="text-base font-black font-mono text-amber-400">
                        {b.handoverCode}
                      </span>
                    </div>
                  </div>
                </div>

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
            Cancelling frees up the vehicle for other students at {bookingToCancel?.pickupHubName}. There are no cancellation penalties.
          </p>

          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" size="sm" onClick={() => setCancelModalOpen(false)}>
              Keep Booking
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleConfirmCancel}
              isLoading={isCancelling}
            >
              Confirm Cancellation
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
