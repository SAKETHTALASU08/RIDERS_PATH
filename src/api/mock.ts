import {
  PublicBikeDto,
  AvailabilityResponse,
  UserProfile,
  ProfileCompletion,
  PricingBreakdown,
  BookingCreate,
  BookingResponse,
  OwnerOnboarding,
  OwnerListing,
  ApiErrorShape,
} from '../shared/contract';
import { PLATFORM_CONFIG } from '../config/platform.config';
import {
  INITIAL_MOCK_BIKES,
  INITIAL_MOCK_BOOKINGS,
  INITIAL_MOCK_OWNER_LISTINGS,
  MOCK_USER,
} from './mockData';

export interface BikeFilterParams {
  query?: string;
  bikeType?: string;
  fuelType?: string;
  transmission?: string;
  hubId?: string;
  maxHourlyRate?: number;
  instantOnly?: boolean;
  sortBy?: 'price_asc' | 'price_desc' | 'rating' | 'popular';
}

class MockApiService {
  private bikes: PublicBikeDto[] = [...INITIAL_MOCK_BIKES];
  private bookings: BookingResponse[] = [...INITIAL_MOCK_BOOKINGS];
  private ownerListings: OwnerListing[] = [...INITIAL_MOCK_OWNER_LISTINGS];
  private currentUser: UserProfile | null = { ...MOCK_USER };
  private pendingOtps: Map<string, { code: string; expiresAt: number }> = new Map();
  private processedIdempotencyKeys: Set<string> = new Set();

  private delay(ms = 180): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // 1. Get Platform Config
  async getConfig() {
    await this.delay(50);
    return PLATFORM_CONFIG;
  }

  // 2. Bikes Catalog
  async getBikes(params: BikeFilterParams = {}): Promise<PublicBikeDto[]> {
    await this.delay(150);
    let list = [...this.bikes];

    if (params.query?.trim()) {
      const q = params.query.toLowerCase().trim();
      list = list.filter(
        (b) =>
          b.brand.toLowerCase().includes(q) ||
          b.model.toLowerCase().includes(q) ||
          b.hubName.toLowerCase().includes(q)
      );
    }

    if (params.bikeType && params.bikeType !== 'all') {
      list = list.filter((b) => b.bikeType === params.bikeType);
    }

    if (params.fuelType && params.fuelType !== 'all') {
      list = list.filter((b) => b.fuelType === params.fuelType);
    }

    if (params.transmission && params.transmission !== 'all') {
      list = list.filter((b) => b.transmission === params.transmission);
    }

    if (params.hubId && params.hubId !== 'all') {
      list = list.filter((b) => b.hubId === params.hubId);
    }

    if (params.maxHourlyRate && params.maxHourlyRate > 0) {
      list = list.filter((b) => b.hourlyRateInr <= params.maxHourlyRate!);
    }

    if (params.instantOnly) {
      list = list.filter((b) => b.isInstantBooking);
    }

    if (params.sortBy) {
      switch (params.sortBy) {
        case 'price_asc':
          list.sort((a, b) => a.hourlyRateInr - b.hourlyRateInr);
          break;
        case 'price_desc':
          list.sort((a, b) => b.hourlyRateInr - a.hourlyRateInr);
          break;
        case 'rating':
          list.sort((a, b) => b.rating - a.rating);
          break;
        case 'popular':
        default:
          list.sort((a, b) => b.totalTrips - a.totalTrips);
          break;
      }
    }

    return list;
  }

  // 3. Get Bike Details
  async getBikeById(id: string): Promise<PublicBikeDto> {
    await this.delay(120);
    const bike = this.bikes.find((b) => b.id === id);
    if (!bike) {
      throw {
        message: 'Bike not found in ICFAI campus catalog',
        code: 'NOT_FOUND',
        status: 404,
      } as ApiErrorShape;
    }
    return bike;
  }

  // 4. Live Availability Check
  async checkAvailability(
    bikeId: string,
    startTimeIso: string,
    endTimeIso: string
  ): Promise<AvailabilityResponse> {
    await this.delay(150);
    const start = new Date(startTimeIso).getTime();
    const end = new Date(endTimeIso).getTime();

    if (isNaN(start) || isNaN(end) || end <= start) {
      return { available: false, reason: 'Invalid rental date or time duration' };
    }

    // Check conflicting bookings
    const conflicts = this.bookings.filter(
      (b) =>
        b.bikeId === bikeId &&
        b.status !== 'CANCELLED' &&
        b.status !== 'REJECTED' &&
        !(
          end <= new Date(b.startTime).getTime() ||
          start >= new Date(b.endTime).getTime()
        )
    );

    if (conflicts.length > 0) {
      return {
        available: false,
        reason: 'Selected bike is already reserved for this duration at campus hub',
        blockedRanges: conflicts.map((c) => ({
          start: c.startTime,
          end: c.endTime,
          reason: 'Reserved by another student',
        })),
      };
    }

    return { available: true };
  }

  // 5. Server-Computed Pricing Breakdown
  async computePricing(
    bikeId: string,
    startTimeIso: string,
    endTimeIso: string,
    depositType: 'laptop' | 'cash_hub'
  ): Promise<PricingBreakdown> {
    await this.delay(120);
    const bike = await this.getBikeById(bikeId);

    const start = new Date(startTimeIso).getTime();
    const end = new Date(endTimeIso).getTime();
    if (isNaN(start) || isNaN(end) || end <= start) {
      throw {
        message: 'Invalid duration for price calculation',
        code: 'INVALID_DURATION',
        status: 400,
      } as ApiErrorShape;
    }

    const durationHours = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60)));

    // Calculation: if duration >= 24h, compute days + remaining hours
    let rentalChargeInr = 0;
    if (durationHours >= 24) {
      const fullDays = Math.floor(durationHours / 24);
      const remainingHours = durationHours % 24;
      rentalChargeInr =
        fullDays * bike.dailyRateInr +
        Math.min(remainingHours * bike.hourlyRateInr, bike.dailyRateInr);
    } else {
      rentalChargeInr = Math.min(durationHours * bike.hourlyRateInr, bike.dailyRateInr);
    }

    const platformFeeInr = Math.round(
      (rentalChargeInr * PLATFORM_CONFIG.depositPolicy.platformFeePercent) / 100
    );

    const depositInr =
      depositType === 'cash_hub' ? PLATFORM_CONFIG.depositPolicy.standardAmountInr : 0;

    const totalPayableAtHandoverInr = rentalChargeInr + platformFeeInr + depositInr;

    return {
      durationHours,
      rentalChargeInr,
      platformFeeInr,
      depositInr,
      depositType,
      totalPayableAtHandoverInr,
      isServerCalculated: true,
    };
  }

  // 6. Request OTP
  async requestOtp(email: string): Promise<{ success: boolean; message: string }> {
    await this.delay(200);
    const trimmed = email.toLowerCase().trim();

    // Standardized message whether or not user already exists (prevents account enumeration)
    const code = '123456'; // Standard test OTP for mock environment
    this.pendingOtps.set(trimmed, {
      code,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    return {
      success: true,
      message: `A 6-digit verification code has been dispatched to ${trimmed}. For mock testing, use code: 123456`,
    };
  }

  // 7. Verify OTP
  async verifyOtp(
    email: string,
    code: string
  ): Promise<{ user: UserProfile | null; requiresProfileCompletion: boolean }> {
    await this.delay(250);
    const trimmed = email.toLowerCase().trim();
    const stored = this.pendingOtps.get(trimmed);

    // Accept 123456 or matching OTP
    if (!stored && code !== '123456') {
      throw {
        message: 'Invalid or expired verification code. Please request a new OTP.',
        code: 'INVALID_OTP',
        status: 400,
      } as ApiErrorShape;
    }

    if (code !== '123456' && stored && stored.code !== code) {
      throw {
        message: 'Incorrect 6-digit code. Please check your email.',
        code: 'INCORRECT_CODE',
        status: 400,
      } as ApiErrorShape;
    }

    this.pendingOtps.delete(trimmed);

    // Check if user has an existing profile
    if (this.currentUser && this.currentUser.email.toLowerCase() === trimmed) {
      return { user: this.currentUser, requiresProfileCompletion: false };
    }

    // New student profile required
    this.currentUser = {
      id: 'usr_' + Math.random().toString(36).substring(2, 9),
      email: trimmed,
      name: '',
      enrollmentNumber: '',
      phone: '',
      course: '',
      year: '1st Year',
      isVerified: false,
      drivingLicenceVerified: false,
      studentIdVerified: false,
      createdAt: new Date().toISOString(),
    };

    return { user: this.currentUser, requiresProfileCompletion: true };
  }

  // 8. Auth State & Profile
  async getCurrentUser(): Promise<UserProfile | null> {
    await this.delay(80);
    // Simulating session check via httpOnly cookie (client holds no token)
    return this.currentUser && this.currentUser.name ? this.currentUser : null;
  }

  async updateProfile(data: ProfileCompletion): Promise<UserProfile> {
    await this.delay(200);
    if (!this.currentUser) {
      throw {
        message: 'Session expired. Please log in again.',
        code: 'UNAUTHORIZED',
        status: 401,
      } as ApiErrorShape;
    }

    this.currentUser = {
      ...this.currentUser,
      name: data.name,
      enrollmentNumber: data.enrollmentNumber.toUpperCase(),
      phone: data.phone,
      course: data.course,
      year: data.year,
      isVerified: true,
      studentIdVerified: true,
    };

    return this.currentUser;
  }

  async logout(): Promise<{ success: boolean }> {
    await this.delay(100);
    this.currentUser = null;
    return { success: true };
  }

  // 9. Booking Creation
  async createBooking(data: BookingCreate): Promise<BookingResponse> {
    await this.delay(350);

    // Double-submit protection via idempotency key
    if (this.processedIdempotencyKeys.has(data.idempotencyKey)) {
      const existing = this.bookings.find(
        (b) => b.id.includes(data.idempotencyKey.slice(0, 6))
      );
      if (existing) return existing;
    }
    this.processedIdempotencyKeys.add(data.idempotencyKey);

    const bike = await this.getBikeById(data.bikeId);
    const availability = await this.checkAvailability(data.bikeId, data.startTime, data.endTime);
    if (!availability.available) {
      throw {
        message: availability.reason || 'Bike unavailable for selected duration',
        code: 'BIKE_UNAVAILABLE',
        status: 409,
      } as ApiErrorShape;
    }

    const pricing = await this.computePricing(
      data.bikeId,
      data.startTime,
      data.endTime,
      data.depositType
    );

    const hub = PLATFORM_CONFIG.hubs.find((h) => h.id === data.pickupHubId) || {
      id: data.pickupHubId,
      name: bike.hubName,
    };

    const newBooking: BookingResponse = {
      id: `BK-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      bikeId: bike.id,
      bike,
      userId: this.currentUser?.id || 'usr_guest',
      renterName: this.currentUser?.name || 'Verified ICFAI Student',
      startTime: data.startTime,
      endTime: data.endTime,
      pickupHubId: data.pickupHubId,
      pickupHubName: hub.name,
      status: 'CONFIRMED',
      pricing,
      handoverCode: `RP-${Math.floor(1000 + Math.random() * 9000)}`,
      qrPassCode: `PASS-RP-2026-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      depositType: data.depositType,
      createdAt: new Date().toISOString(),
    };

    this.bookings.unshift(newBooking);
    return newBooking;
  }

  // 10. Bookings Query
  async getUserBookings(): Promise<BookingResponse[]> {
    await this.delay(150);
    return [...this.bookings];
  }

  async getBookingById(id: string): Promise<BookingResponse> {
    await this.delay(100);
    const found = this.bookings.find((b) => b.id === id);
    if (!found) {
      throw {
        message: 'Booking record not found',
        code: 'NOT_FOUND',
        status: 404,
      } as ApiErrorShape;
    }
    return found;
  }

  async cancelBooking(bookingId: string, reason: string): Promise<BookingResponse> {
    await this.delay(200);
    const booking = await this.getBookingById(bookingId);
    if (booking.status === 'COMPLETED' || booking.status === 'CANCELLED') {
      throw {
        message: 'This booking cannot be cancelled in its current state',
        code: 'CANNOT_CANCEL',
        status: 400,
      } as ApiErrorShape;
    }

    booking.status = 'CANCELLED';
    booking.cancellationReason = reason;
    return booking;
  }

  // 11. Owner Onboarding
  async submitOwnerOnboarding(data: OwnerOnboarding): Promise<OwnerListing> {
    await this.delay(350);

    if (this.processedIdempotencyKeys.has(data.idempotencyKey)) {
      const existing = this.ownerListings[0];
      if (existing) return existing;
    }
    this.processedIdempotencyKeys.add(data.idempotencyKey);

    const hub = PLATFORM_CONFIG.hubs.find((h) => h.id === data.preferredHubId);
    const newBike: PublicBikeDto = {
      id: `bike-${data.brand.toLowerCase()}-${Math.random().toString(36).substring(2, 6)}`,
      brand: data.brand,
      model: data.model,
      year: data.year,
      bikeType: data.bikeType,
      fuelType: data.fuelType,
      transmission: data.transmission,
      hourlyRateInr: data.hourlyRateInr,
      dailyRateInr: data.dailyRateInr,
      hubId: data.preferredHubId,
      hubName: hub ? hub.name : 'Main Campus Gate (Gate 1)',
      images: data.images.length > 0 ? data.images : [
        'https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=800&q=80',
      ],
      features: ['ISI Helmet Included', 'Student Owner Inspected'],
      isInstantBooking: false,
      rating: 5.0,
      totalTrips: 0,
      conditionNotes: 'Pending ICFAI student coordinator physical inspection',
      registrationMasked: `${data.registrationNumber.slice(0, 4)}-****`,
    };

    const newListing: OwnerListing = {
      id: `own-listing-${Math.random().toString(36).substring(2, 8)}`,
      bike: newBike,
      status: 'PENDING_APPROVAL',
      adminNotes: 'Coordinator will inspect physical documents and bike condition at the hub.',
      submittedAt: new Date().toISOString(),
      earnings: {
        totalRentedHours: 0,
        totalGrossInr: 0,
        netEarningsInr: 0,
        payoutsPendingInr: 0,
      },
    };

    this.ownerListings.unshift(newListing);
    return newListing;
  }

  async getOwnerListings(): Promise<OwnerListing[]> {
    await this.delay(120);
    return [...this.ownerListings];
  }
}

export const mockApi = new MockApiService();
