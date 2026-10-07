import { describe, it, expect } from 'vitest';
import {
  OtpRequestSchema,
  PublicBikeDtoSchema,
  PricingBreakdownSchema,
} from '../shared/contract';
import { mockApi } from '../api/mock';

describe('Shared Contract & Validation', () => {
  it('validates OTP email syntax without embedding an institution allowlist', () => {
    expect(() =>
      OtpRequestSchema.parse({ email: 'student@student.example.edu' })
    ).not.toThrow();

    expect(() =>
      OtpRequestSchema.parse({ email: 'not-an-email' })
    ).toThrow();
  });

  it('validates PublicBikeDto and prevents leaking unmasked PII', () => {
    const validDto = {
      id: 'bike-1',
      brand: 'Ather',
      model: '450X',
      year: 2023,
      bikeType: 'electric',
      fuelType: 'electric',
      transmission: 'automatic',
      hourlyRateInr: 65,
      dailyRateInr: 450,
      hubId: 'hub_block_c',
      hubName: 'Academic Block C Hub',
      images: ['https://images.unsplash.com/test.jpg'],
      features: ['ISI Helmet Included'],
      isInstantBooking: true,
      rating: 4.9,
      totalTrips: 10,
      conditionNotes: 'Good',
      registrationMasked: 'TS08-****',
    };

    const parsed = PublicBikeDtoSchema.parse(validDto);
    expect(parsed.registrationMasked).toBe('TS08-****');
    // Ensure PII fields are not in schema
    expect('ownerPhone' in parsed).toBe(false);
    expect('ownerEnrollment' in parsed).toBe(false);
  });
});

describe('Mock API Pricing & Availability', () => {
  it('calculates server-side pricing with deposit and platform fee', async () => {
    const start = new Date(Date.now() + 3600 * 1000).toISOString();
    const end = new Date(Date.now() + 5 * 3600 * 1000).toISOString(); // 4 hours

    const pricing = await mockApi.computePricing('bike-ather-450x', start, end, 'laptop');
    expect(pricing.isServerCalculated).toBe(true);
    expect(pricing.durationHours).toBe(4);
    expect(pricing.depositType).toBe('laptop');
    expect(pricing.depositInr).toBe(0);
    expect(pricing.totalPayableAtHandoverInr).toBe(pricing.rentalChargeInr + pricing.platformFeeInr);

    // Verify against Zod schema
    expect(() => PricingBreakdownSchema.parse(pricing)).not.toThrow();
  });

  it('detects conflicting bookings in live availability', async () => {
    const bikeId = 'bike-ather-450x';
    // Use an existing booking time range from INITIAL_MOCK_BOOKINGS
    const bookings = await mockApi.getUserBookings();
    const activeBooking = bookings.find((b) => b.bikeId === bikeId && b.status === 'CONFIRMED');

    if (activeBooking) {
      const check = await mockApi.checkAvailability(
        bikeId,
        activeBooking.startTime,
        activeBooking.endTime
      );
      expect(check.available).toBe(false);
      expect(check.reason).toBeDefined();
    }
  });
});
