/** Public SEO configuration. Override the canonical base with VITE_SITE_URL at deploy time. */
export const SITE_URL = (import.meta.env?.VITE_SITE_URL || 'https://riderspath.netlify.app').replace(/\/$/, '');
export const SITE_NAME = 'Riders Path';

export const ROUTE_METADATA: Record<string, { title: string; description: string }> = {
  '/': {
    title: 'Riders Path | Student Bike Sharing at ICFAI Hyderabad',
    description: 'Browse student-listed two-wheelers, check availability, and arrange pickup at a campus hub. College email is confirmed; licence documents are reviewed by the team.',
  },
  '/browse': {
    title: 'Browse Bikes | Riders Path',
    description: 'Search student-listed bikes and scooters by category, fuel, transmission, price, hub, and rental dates.',
  },
  '/bikes': {
    title: 'Bike Details | Riders Path',
    description: 'View vehicle specifications, pickup details, hourly and daily rates, and date availability.',
  },
  '/book': {
    title: 'Book a Bike | Riders Path',
    description: 'Choose a rental window, review the server-calculated price, and submit documents for team review.',
  },
  '/my-bookings': {
    title: 'My Bookings | Riders Path',
    description: 'Review your booking status, next steps, pickup details, and booking pass.',
  },
  '/signin': {
    title: 'Student Sign In | Riders Path',
    description: 'Sign in with your campus email using a one-time verification code.',
  },
  '/how-it-works': {
    title: 'How It Works | Riders Path',
    description: 'See how students browse, request a two-wheeler, and arrange a campus hub handover.',
  },
  '/faq': {
    title: 'Student Bike Rental FAQ | Riders Path',
    description: 'Answers about student eligibility, documents, deposits, and campus-hub handovers.',
  },
  '/terms': {
    title: 'Terms | Riders Path',
    description: 'Terms placeholder for Riders Path, pending legal review.',
  },
  '/privacy': {
    title: 'Privacy | Riders Path',
    description: 'Privacy notice placeholder for Riders Path, pending legal review.',
  },
  '/refund-policy': {
    title: 'Refunds and Deposit | Riders Path',
    description: 'Refund and deposit policy placeholder for Riders Path, pending legal review.',
  },
  '/safety': {
    title: 'Safety | Riders Path',
    description: 'Review campus riding and handover safety guidance for Riders Path.',
  },
  '/404': {
    title: 'Page Not Found | Riders Path',
    description: 'The requested Riders Path page could not be found.',
  },
};
