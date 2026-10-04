/**
 * Platform Configuration & Business Rules for Riders Path
 * Centralizes all university constants, policies, and format assumptions.
 */

export interface PlatformConfig {
  appName: string;
  campusName: string;
  allowedEmailDomain: string;
  enrollmentRegex: RegExp;
  phoneRegex: RegExp;
  termsVersion: string;
  privacyVersion: string;
  depositPolicy: {
    modes: Array<{ id: string; label: string; description: string }>;
    standardAmountInr: number;
    platformFeePercent: number;
  };
  hubs: Array<{
    id: string;
    name: string;
    code: string;
    landmark: string;
    operatingHours: string;
  }>;
  safetyRules: string[];
}

export const PLATFORM_CONFIG: PlatformConfig = {
  appName: 'Riders Path',
  campusName: 'ICFAI Foundation for Higher Education, Hyderabad',
  allowedEmailDomain: 'icfaiuniversity.in',
  // Format: 2-digit year + 2-4 letter faculty/program + 3-5 digits (e.g. 21BSPH0102)
  enrollmentRegex: /^[0-9]{2}[A-Za-z]{2,4}[0-9]{3,6}$/,
  // Standard Indian 10-digit mobile number format
  phoneRegex: /^[6-9][0-9]{9}$/,
  termsVersion: 'v2.1-campus-2026',
  privacyVersion: 'v1.4-privacy-2026',
  depositPolicy: {
    modes: [
      {
        id: 'laptop',
        label: 'Working Laptop Deposit',
        description: 'Physical laptop in working order deposited with the campus hub coordinator upon key handover.',
      },
      {
        id: 'cash_hub',
        label: 'Campus Hub Security Deposit (₹1,500)',
        description: 'Refundable security deposit deposited with the ICFAI student coordinator at key collection.',
      },
    ],
    standardAmountInr: 1500,
    platformFeePercent: 8, // Owner retains 92%
  },
  hubs: [
    {
      id: 'hub_main_gate',
      name: 'Main Campus Gate (Gate 1)',
      code: 'GATE-01',
      landmark: 'Next to Security Booth & Visitor Center',
      operatingHours: '07:30 AM – 10:00 PM',
    },
    {
      id: 'hub_block_c',
      name: 'Academic Block C Hub',
      code: 'BLK-C',
      landmark: 'North Parking Bay opposite Student Cafeteria',
      operatingHours: '08:00 AM – 09:30 PM',
    },
    {
      id: 'hub_boys_hostel',
      name: 'Boys Hostel Cluster (Hostel 3)',
      code: 'HSTL-B3',
      landmark: 'Ground floor bike shelter near Warden Office',
      operatingHours: '07:00 AM – 10:30 PM',
    },
    {
      id: 'hub_girls_hostel',
      name: 'Girls Hostel Cluster (Hostel 1)',
      code: 'HSTL-G1',
      landmark: 'East Bay Hub & Inspection Point',
      operatingHours: '07:00 AM – 09:30 PM',
    },
  ],
  safetyRules: [
    'Mandatory ISI-certified full-face or open-face helmet for rider and pillion.',
    'Strict campus speed limit of 25 km/h within university premises.',
    'No overnight off-campus parking without prior coordinator permission.',
    'Physical ICFAI student ID card must be presented at key handover.',
  ],
};
