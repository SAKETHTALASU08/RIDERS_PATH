import {
  PublicBikeDto,
  PublicBikeDtoSchema,
  AvailabilityResponse,
  AvailabilityResponseSchema,
  UserProfile,
  UserProfileSchema,
  ProfileCompletion,
  PricingBreakdown,
  PricingBreakdownSchema,
  BookingCreate,
  BookingResponse,
  BookingResponseSchema,
  OwnerOnboarding,
  OwnerListing,
  OwnerListingSchema,
  ApiErrorShape,
} from '../shared/contract';
import { mockApi, BikeFilterParams } from './mock';

const USE_MOCK =
  import.meta.env.VITE_USE_MOCK_API !== 'false' ||
  !import.meta.env.VITE_API_URL;

const API_BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * Standard fetch wrapper for real backend:
 * - Sends credentials (httpOnly cookies)
 * - Sets content-type
 * - Formats standard error shapes
 */
async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include', // Auth cookies
  });

  if (!response.ok) {
    let errorData: ApiErrorShape;
    try {
      errorData = await response.json();
    } catch {
      errorData = {
        message: response.statusText || 'An unexpected server error occurred',
        code: `HTTP_${response.status}`,
        status: response.status,
      };
    }
    throw errorData;
  }

  return response.json();
}

/**
 * Typed API Client — Components call only these functions.
 */
export const apiClient = {
  // Config
  async getConfig() {
    if (USE_MOCK) return mockApi.getConfig();
    return request('/config');
  },

  // Bikes Catalog
  async getBikes(params: BikeFilterParams = {}): Promise<PublicBikeDto[]> {
    if (USE_MOCK) return mockApi.getBikes(params);
    const searchParams = new URLSearchParams();
    if (params.query) searchParams.set('q', params.query);
    if (params.bikeType) searchParams.set('bikeType', params.bikeType);
    if (params.fuelType) searchParams.set('fuelType', params.fuelType);
    if (params.hubId) searchParams.set('hubId', params.hubId);
    if (params.maxHourlyRate) searchParams.set('maxHourlyRate', String(params.maxHourlyRate));
    if (params.sortBy) searchParams.set('sortBy', params.sortBy);

    const data = await request<unknown[]>(`/bikes?${searchParams.toString()}`);
    return data.map((item) => PublicBikeDtoSchema.parse(item));
  },

  async getBikeById(id: string): Promise<PublicBikeDto> {
    if (USE_MOCK) return mockApi.getBikeById(id);
    const data = await request(`/bikes/${id}`);
    return PublicBikeDtoSchema.parse(data);
  },

  // Live Availability
  async checkAvailability(
    bikeId: string,
    startTime: string,
    endTime: string
  ): Promise<AvailabilityResponse> {
    if (USE_MOCK) return mockApi.checkAvailability(bikeId, startTime, endTime);
    const data = await request(
      `/bikes/${bikeId}/availability?startTime=${encodeURIComponent(
        startTime
      )}&endTime=${encodeURIComponent(endTime)}`
    );
    return AvailabilityResponseSchema.parse(data);
  },

  // Server-Side Pricing Breakdown
  async computePricing(
    bikeId: string,
    startTime: string,
    endTime: string,
    depositType: 'laptop' | 'cash_hub'
  ): Promise<PricingBreakdown> {
    if (USE_MOCK) return mockApi.computePricing(bikeId, startTime, endTime, depositType);
    const data = await request('/pricing/calculate', {
      method: 'POST',
      body: JSON.stringify({ bikeId, startTime, endTime, depositType }),
    });
    return PricingBreakdownSchema.parse(data);
  },

  // Authentication & OTP
  async requestOtp(email: string): Promise<{ success: boolean; message: string }> {
    if (USE_MOCK) return mockApi.requestOtp(email);
    return request('/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async verifyOtp(
    email: string,
    code: string
  ): Promise<{ user: UserProfile | null; requiresProfileCompletion: boolean }> {
    if (USE_MOCK) return mockApi.verifyOtp(email, code);
    return request('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    });
  },

  async getCurrentUser(): Promise<UserProfile | null> {
    if (USE_MOCK) return mockApi.getCurrentUser();
    try {
      const data = await request('/auth/me');
      return UserProfileSchema.parse(data);
    } catch {
      return null;
    }
  },

  async updateProfile(data: ProfileCompletion): Promise<UserProfile> {
    if (USE_MOCK) return mockApi.updateProfile(data);
    const updated = await request('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return UserProfileSchema.parse(updated);
  },

  async logout(): Promise<{ success: boolean }> {
    if (USE_MOCK) return mockApi.logout();
    return request('/auth/logout', { method: 'POST' });
  },

  // Bookings
  async createBooking(data: BookingCreate): Promise<BookingResponse> {
    if (USE_MOCK) return mockApi.createBooking(data);
    const response = await request('/bookings', {
      method: 'POST',
      headers: {
        'Idempotency-Key': data.idempotencyKey,
      },
      body: JSON.stringify(data),
    });
    return BookingResponseSchema.parse(response);
  },

  async getUserBookings(): Promise<BookingResponse[]> {
    if (USE_MOCK) return mockApi.getUserBookings();
    const list = await request<unknown[]>('/bookings/my');
    return list.map((item) => BookingResponseSchema.parse(item));
  },

  async getBookingById(id: string): Promise<BookingResponse> {
    if (USE_MOCK) return mockApi.getBookingById(id);
    const data = await request(`/bookings/${id}`);
    return BookingResponseSchema.parse(data);
  },

  async cancelBooking(bookingId: string, reason: string): Promise<BookingResponse> {
    if (USE_MOCK) return mockApi.cancelBooking(bookingId, reason);
    const data = await request(`/bookings/${bookingId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    return BookingResponseSchema.parse(data);
  },

  // Owner Flow
  async submitOwnerOnboarding(data: OwnerOnboarding): Promise<OwnerListing> {
    if (USE_MOCK) return mockApi.submitOwnerOnboarding(data);
    const response = await request('/owner/onboard', {
      method: 'POST',
      headers: {
        'Idempotency-Key': data.idempotencyKey,
      },
      body: JSON.stringify(data),
    });
    return OwnerListingSchema.parse(response);
  },

  async getOwnerListings(): Promise<OwnerListing[]> {
    if (USE_MOCK) return mockApi.getOwnerListings();
    const list = await request<unknown[]>('/owner/listings');
    return list.map((item) => OwnerListingSchema.parse(item));
  },
};
