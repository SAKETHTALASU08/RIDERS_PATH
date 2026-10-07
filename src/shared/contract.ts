import { z } from 'zod';
import {
  createEnrollmentZodSchema,
  DEFAULT_ENROLLMENT_EXAMPLE,
  IndianPhoneSchema,
} from './validators';

// ----------------------------------------------------
// ENUMS & PRIMITIVES
// ----------------------------------------------------

export const BookingStatusSchema = z.enum([
  'PENDING_VERIFICATION',
  'CONFIRMED',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
]);
export type BookingStatus = z.infer<typeof BookingStatusSchema>;

export const BikeTypeSchema = z.enum([
  'scooter',
  'commuter',
  'sports',
  'cruiser',
  'electric',
]);
export type BikeType = z.infer<typeof BikeTypeSchema>;

export const FuelTypeSchema = z.enum(['petrol', 'electric']);
export type FuelType = z.infer<typeof FuelTypeSchema>;

export const TransmissionSchema = z.enum(['manual', 'automatic']);
export type Transmission = z.infer<typeof TransmissionSchema>;

// ----------------------------------------------------
// PUBLIC BIKE DTO (PII-Safe)
// ----------------------------------------------------

export const PublicBikeDtoSchema = z.object({
  id: z.string(),
  brand: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(2012).max(2027),
  bikeType: BikeTypeSchema,
  fuelType: FuelTypeSchema,
  transmission: TransmissionSchema,
  hourlyRateInr: z.number().positive(),
  dailyRateInr: z.number().positive(),
  hubId: z.string(),
  hubName: z.string(),
  images: z.array(z.string().url().or(z.string().startsWith('/assets/'))),
  features: z.array(z.string()),
  isInstantBooking: z.boolean(),
  rating: z.number().min(1).max(5),
  totalTrips: z.number().int().nonnegative(),
  conditionNotes: z.string().default('Inspected by Campus Coordinator'),
  // Masked plate for privacy, full plate only visible after booking confirmation
  registrationMasked: z.string(),
  // Explicitly NO owner phone, owner enrollment, or raw PII
});
export type PublicBikeDto = z.infer<typeof PublicBikeDtoSchema>;

// ----------------------------------------------------
// AVAILABILITY SCHEMA
// ----------------------------------------------------

export const BlockedRangeSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  reason: z.string().optional(),
});
export type BlockedRange = z.infer<typeof BlockedRangeSchema>;

export const AvailabilityResponseSchema = z.object({
  available: z.boolean(),
  reason: z.string().optional(),
  blockedRanges: z.array(BlockedRangeSchema).optional(),
});
export type AvailabilityResponse = z.infer<typeof AvailabilityResponseSchema>;

// ----------------------------------------------------
// ----------------------------------------------------
// AUTH & OTP SCHEMAS
// ----------------------------------------------------

export const OtpRequestSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
});
export type OtpRequest = z.infer<typeof OtpRequestSchema>;

export const OtpVerifySchema = z.object({
  email: z.string().trim().email(),
  code: z.string().trim().regex(/^[0-9]{6}$/, 'OTP must be exactly 6 numeric digits'),
});
export type OtpVerify = z.infer<typeof OtpVerifySchema>;

export const UserProfileSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().default(''),
  enrollmentNumber: z.string().default(''),
  phone: z.string().default(''),
  course: z.string().default(''),
  year: z.string().default('1st Year'),
  isVerified: z.boolean().default(false),
  emailVerified: z.boolean().default(false),
  profileComplete: z.boolean().default(false),
  drivingLicenceVerified: z.boolean().default(false),
  studentIdVerified: z.boolean().default(false),
  createdAt: z.string().datetime(),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

export const OtpRequestResponseSchema = z.object({
  success: z.literal(true),
  message: z.string(),
  cooldownSeconds: z.number().int().nonnegative(),
});
export type OtpRequestResponse = z.infer<typeof OtpRequestResponseSchema>;

export const OtpVerifyResponseSchema = z.object({
  requiresProfileCompletion: z.boolean(),
  user: UserProfileSchema,
});
export type OtpVerifyResponse = z.infer<typeof OtpVerifyResponseSchema>;

export function createProfileCompletionSchema(
  enrollmentRegex?: string,
  enrollmentExample = DEFAULT_ENROLLMENT_EXAMPLE
) {
  return z.object({
    name: z.string().trim().min(2, 'Full Name must be at least 2 characters').max(120),
    enrollmentNumber: createEnrollmentZodSchema(enrollmentRegex, enrollmentExample),
    phone: IndianPhoneSchema,
    course: z.string().trim().min(2, 'Program/Department is required').max(120),
    year: z.enum(['1st Year', '2nd Year', '3rd Year', '4th Year', 'Postgraduate']),
  });
}

export const ProfileCompletionSchema = createProfileCompletionSchema();
export type ProfileCompletion = z.infer<typeof ProfileCompletionSchema>;

export function createManualVerificationRequestSchema(
  enrollmentRegex?: string,
  enrollmentExample = DEFAULT_ENROLLMENT_EXAMPLE
) {
  return z.object({
    name: z.string().trim().min(2, 'Full Name is required').max(120),
    enrollmentNumber: createEnrollmentZodSchema(enrollmentRegex, enrollmentExample),
    alternateEmail: z.string().trim().email('Valid alternate email address required').max(254),
    note: z.string().trim().max(500, 'Note cannot exceed 500 characters').optional(),
  });
}

export const ManualVerificationRequestSchema = createManualVerificationRequestSchema();
export type ManualVerificationRequest = z.infer<typeof ManualVerificationRequestSchema>;

// ----------------------------------------------------
// PRICING & BOOKING SCHEMAS
// ----------------------------------------------------

export const PricingBreakdownSchema = z.object({
  durationHours: z.number().positive(),
  rentalChargeInr: z.number().nonnegative(),
  platformFeeInr: z.number().nonnegative(),
  depositInr: z.number().nonnegative(),
  depositType: z.enum(['laptop', 'cash_hub']),
  totalPayableAtHandoverInr: z.number().nonnegative(),
  isServerCalculated: z.literal(true),
});
export type PricingBreakdown = z.infer<typeof PricingBreakdownSchema>;

export const BookingCreateSchema = z.object({
  bikeId: z.string(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  pickupHubId: z.string(),
  depositType: z.enum(['laptop', 'cash_hub']),
  drivingLicenceImage: z.string().min(10, 'Driving Licence scan is required'),
  studentIdCardImage: z.string().min(10, 'ICFAI Student ID card photo is required'),
  agreedToTermsVersion: z.string(),
  idempotencyKey: z.string().min(8),
});
export type BookingCreate = z.infer<typeof BookingCreateSchema>;

export const BookingResponseSchema = z.object({
  id: z.string(),
  bikeId: z.string(),
  bike: PublicBikeDtoSchema,
  userId: z.string(),
  renterName: z.string(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  pickupHubId: z.string(),
  pickupHubName: z.string(),
  status: BookingStatusSchema,
  pricing: PricingBreakdownSchema,
  handoverCode: z.string(),
  qrPassCode: z.string(),
  depositType: z.enum(['laptop', 'cash_hub']),
  createdAt: z.string().datetime(),
  cancellationReason: z.string().optional(),
});
export type BookingResponse = z.infer<typeof BookingResponseSchema>;

// ----------------------------------------------------
// OWNER ONBOARDING SCHEMAS
// ----------------------------------------------------

export const OwnerOnboardingSchema = z.object({
  brand: z.string().min(1, 'Brand is required'),
  model: z.string().min(1, 'Model name is required'),
  year: z.number().int().min(2014).max(2027),
  bikeType: BikeTypeSchema,
  fuelType: FuelTypeSchema,
  transmission: TransmissionSchema,
  registrationNumber: z
    .string()
    .min(6, 'Valid registration plate number required')
    .transform((val) => val.toUpperCase().replace(/\s+/g, '')),
  hourlyRateInr: z.number().min(20).max(250),
  dailyRateInr: z.number().min(200).max(2000),
  preferredHubId: z.string(),
  images: z.array(z.string()).min(1, 'At least 1 vehicle photo is required'),
  rcDocumentImage: z.string().min(10, 'RC document image is required'),
  insuranceDocumentImage: z.string().min(10, 'Insurance policy image is required'),
  payoutUpiId: z
    .string()
    .regex(/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/, 'Valid UPI ID required (e.g. student@okhdfcbank)'),
  ownerResponsibilityAgreed: z.boolean().refine((val) => val === true, {
    message: 'You must confirm vehicle ownership, active insurance, and university compliance',
  }),
  termsVersionAgreed: z.string(),
  idempotencyKey: z.string().min(8),
});
export type OwnerOnboarding = z.infer<typeof OwnerOnboardingSchema>;

export const OwnerListingStatusSchema = z.enum([
  'PENDING_APPROVAL',
  'APPROVED',
  'CHANGES_REQUESTED',
  'REJECTED',
]);
export type OwnerListingStatus = z.infer<typeof OwnerListingStatusSchema>;

export const OwnerListingSchema = z.object({
  id: z.string(),
  bike: PublicBikeDtoSchema,
  status: OwnerListingStatusSchema,
  adminNotes: z.string().optional(),
  submittedAt: z.string().datetime(),
  earnings: z.object({
    totalRentedHours: z.number().nonnegative(),
    totalGrossInr: z.number().nonnegative(),
    netEarningsInr: z.number().nonnegative(),
    payoutsPendingInr: z.number().nonnegative(),
  }),
});
export type OwnerListing = z.infer<typeof OwnerListingSchema>;

// ----------------------------------------------------
// API ERROR SHAPE
// ----------------------------------------------------

export const ApiErrorShapeSchema = z.object({
  message: z.string().optional(),
  error: z.string().optional(),
  code: z.string(),
  fieldErrors: z.record(z.string(), z.string()).optional(),
  status: z.number().optional(),
  cooldownSeconds: z.number().optional(),
  retryAfterSeconds: z.number().optional(),
  attemptsRemaining: z.number().optional(),
});
export type ApiErrorShape = z.infer<typeof ApiErrorShapeSchema>;
