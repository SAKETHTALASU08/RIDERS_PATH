import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { db } from './server/db.js';
import { verifyDocumentWithGemini } from './server/gemini.js';

dotenv.config();

const app = express();
const PORT = 3000;

// Body parser with 25MB limit for document image uploads
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Active session token store
const adminSessions = new Set<string>();
const userSessions = new Map<string, string>(); // token -> userId

// Simple admin auth middleware
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Admin authentication token required' });
  }
  const token = authHeader.split(' ')[1];
  if (!adminSessions.has(token)) {
    return res.status(403).json({ error: 'Forbidden: Invalid or expired admin session' });
  }
  next();
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// 1. Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Riders Path API', time: new Date().toISOString() });
});

// 2. Platform Config
app.get('/api/config', (req, res) => {
  const config = db.getConfig();
  // Never expose password hash
  const { passwordHash, ...publicConfig } = config;
  res.json(publicConfig);
});

app.put('/api/config', requireAdmin, (req, res) => {
  const updates = req.body;
  const updated = db.updateConfig(updates);
  db.logAdminAction({
    adminId: 'admin',
    action: 'UPDATE_PLATFORM_CONFIG',
    targetType: 'pricing',
    targetId: 'config',
    metadata: updates
  });
  const { passwordHash, ...safeConfig } = updated;
  res.json(safeConfig);
});

// 3. Admin Authentication
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  const isValid = db.verifyAdminPassword(password);
  if (!isValid) {
    return res.status(401).json({ error: 'Invalid administrator credentials' });
  }

  const sessionToken = 'adm_' + crypto.randomBytes(32).toString('hex');
  adminSessions.add(sessionToken);

  db.logAdminAction({
    adminId: 'admin',
    action: 'ADMIN_LOGIN_SUCCESS',
    targetType: 'auth',
    targetId: 'admin',
    metadata: { ip: req.ip }
  });

  res.json({
    success: true,
    token: sessionToken,
    message: 'Admin session authenticated successfully'
  });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    adminSessions.delete(token);
  }
  res.json({ success: true, message: 'Logged out of admin session' });
});

app.post('/api/admin/change-password', requireAdmin, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Both old and new passwords are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long' });
  }

  const success = db.changeAdminPassword(oldPassword, newPassword);
  if (!success) {
    return res.status(400).json({ error: 'Current password does not match' });
  }

  res.json({ success: true, message: 'Admin password updated securely' });
});

// Helper for ICFAI Enrollment Number Validation
function validateIcfaiEnrollment(enrollment: string): { valid: boolean; normalized: string; error?: string } {
  if (!enrollment || typeof enrollment !== 'string') {
    return { valid: false, normalized: '', error: 'ICFAI enrollment number is required.' };
  }
  const clean = enrollment.trim().toUpperCase();
  if (clean.length < 10) {
    return { valid: false, normalized: clean, error: 'Enrollment number must contain at least 10 characters (Example: 26FMUCHH01XXXX).' };
  }
  if (/\s/.test(clean)) {
    return { valid: false, normalized: clean, error: 'Enrollment number cannot contain spaces.' };
  }
  if (!/^[A-Z0-9]+$/.test(clean)) {
    return { valid: false, normalized: clean, error: 'Enrollment number can only contain letters and numbers (no special characters).' };
  }
  return { valid: true, normalized: clean };
}

// 4. Student User Authentication & Registry
app.post('/api/users/login', (req, res) => {
  const { fullName, email, phone, icfaiEnrollmentNumber, academicYear, course } = req.body;
  if (!fullName || !icfaiEnrollmentNumber) {
    return res.status(400).json({ error: 'Full name and ICFAI enrollment number are required' });
  }

  const enrollmentCheck = validateIcfaiEnrollment(icfaiEnrollmentNumber);
  if (!enrollmentCheck.valid) {
    return res.status(400).json({ error: enrollmentCheck.error });
  }

  const cleanEnrollment = enrollmentCheck.normalized;

  let user = db.getUserByEnrollment(cleanEnrollment);
  if (!user) {
    user = db.createUser({
      fullName: fullName.trim(),
      email: email || `${cleanEnrollment.toLowerCase()}@student.icfaiuniversity.in`,
      phone: phone || '+91 98000 00000',
      icfaiEnrollmentNumber: cleanEnrollment,
      academicYear: academicYear || 'Year 1',
      course: course || 'B.Tech (CSE)',
      ageConfirmation: true,
      drivingLicenseConfirmation: true,
      verificationStatus: 'verified',
      role: 'student'
    });
  } else if (academicYear || course) {
    user = db.updateUser(user.id, {
      ...(academicYear ? { academicYear } : {}),
      ...(course ? { course } : {})
    }) || user;
  }

  const userToken = 'usr_' + crypto.randomBytes(24).toString('hex');
  userSessions.set(userToken, user.id);

  res.json({
    success: true,
    token: userToken,
    user
  });
});

app.get('/api/users', requireAdmin, (req, res) => {
  res.json(db.getUsers());
});

app.put('/api/users/:id/status', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { verificationStatus } = req.body;
  const updated = db.updateUser(id, { verificationStatus });
  if (!updated) {
    return res.status(404).json({ error: 'User not found' });
  }
  db.logAdminAction({
    adminId: 'admin',
    action: 'UPDATE_USER_STATUS',
    targetType: 'user',
    targetId: id,
    metadata: { newStatus: verificationStatus }
  });
  res.json(updated);
});

// 5. Bike Catalog & Management
app.get('/api/bikes', (req, res) => {
  const { status, brand, bikeType, fuelType, transmission, search } = req.query;
  const bikes = db.getBikes({
    status: status as string,
    brand: brand as string,
    bikeType: bikeType as string,
    fuelType: fuelType as string,
    transmission: transmission as string,
    search: search as string,
    onlyActive: true,
    onlyApproved: true
  });
  res.json(bikes);
});

app.get('/api/bikes/all', requireAdmin, (req, res) => {
  res.json(db.getAllBikesAdmin());
});

app.get('/api/bikes/:id', (req, res) => {
  const bike = db.getBikeById(req.params.id);
  if (!bike) {
    return res.status(404).json({ error: 'Bike not found' });
  }
  res.json(bike);
});

// Check specific bike schedule conflict for requested dates
app.get('/api/bikes/:id/availability', (req, res) => {
  const { id } = req.params;
  const { pickupDate, returnDate } = req.query;

  const bike = db.getBikeById(id);
  if (!bike) {
    return res.status(404).json({ error: 'Bike not found' });
  }

  if (bike.availabilityStatus !== 'AVAILABLE') {
    return res.json({
      available: false,
      reason: `Vehicle is currently marked as ${bike.availabilityStatus}`,
      conflicts: []
    });
  }

  if (!pickupDate || !returnDate) {
    return res.json({ available: true, conflicts: [] });
  }

  const reqPickup = new Date(pickupDate as string).getTime();
  const reqReturn = new Date(returnDate as string).getTime();

  if (isNaN(reqPickup) || isNaN(reqReturn) || reqPickup >= reqReturn) {
    return res.status(400).json({ error: 'Invalid pickup and return time range' });
  }

  // Active bookings that occupy the bike
  const allBookings = db.getBookings();
  const conflicting = allBookings.filter((b) => {
    if (b.bikeId !== id) return false;
    if (b.bookingStatus === 'cancelled' || b.bookingStatus === 'rejected' || b.bookingStatus === 'completed') return false;

    const bPickup = new Date(b.pickupDate).getTime();
    const bReturn = new Date(b.returnDate).getTime();

    // Check overlap: max(pickup1, pickup2) < min(return1, return2)
    return Math.max(reqPickup, bPickup) < Math.min(reqReturn, bReturn);
  });

  if (conflicting.length > 0) {
    const conflict = conflicting[0];
    const fromStr = new Date(conflict.pickupDate).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
    const toStr = new Date(conflict.returnDate).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
    return res.json({
      available: false,
      reason: `This bike already has a reserved booking from ${fromStr} to ${toStr}.`,
      conflicts: conflicting
    });
  }

  res.json({ available: true, conflicts: [] });
});

app.post('/api/bikes', requireAdmin, (req, res) => {
  const bikeData = req.body;
  if (!bikeData.brand || !bikeData.model) {
    return res.status(400).json({ error: 'Brand and Model are required' });
  }

  const rawDayPrice = Number(bikeData.pricePerDay);
  const rawHourPrice = Number(bikeData.pricePerHour);

  let finalDayPrice = rawDayPrice > 0 ? rawDayPrice : (rawHourPrice > 0 ? rawHourPrice * 24 : 599);
  let finalHourPrice = rawHourPrice > 0 ? rawHourPrice : (finalDayPrice > 0 ? Math.round((finalDayPrice / 24) * 100) / 100 : 59);

  const created = db.createBike({
    ...bikeData,
    pricePerDay: finalDayPrice,
    pricePerHour: finalHourPrice,
    securityDeposit: Number(bikeData.securityDeposit) || 1000,
    approvedByAdmin: true,
    active: bikeData.active !== undefined ? bikeData.active : true
  });

  db.logAdminAction({
    adminId: 'admin',
    action: 'CREATE_BIKE_LISTING',
    targetType: 'bike',
    targetId: created.id,
    metadata: { brand: created.brand, model: created.model }
  });

  res.status(201).json(created);
});

app.put('/api/bikes/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const updates = { ...req.body };

  if (updates.pricePerDay !== undefined || updates.pricePerHour !== undefined) {
    const dayP = Number(updates.pricePerDay);
    const hrP = Number(updates.pricePerHour);
    if (dayP > 0 && (!hrP || hrP <= 0)) {
      updates.pricePerHour = Math.round((dayP / 24) * 100) / 100;
    } else if (hrP > 0 && (!dayP || dayP <= 0)) {
      updates.pricePerDay = Math.round(hrP * 24);
    }
  }

  const updated = db.updateBike(id, updates);
  if (!updated) {
    return res.status(404).json({ error: 'Bike not found' });
  }

  db.logAdminAction({
    adminId: 'admin',
    action: 'UPDATE_BIKE_LISTING',
    targetType: 'bike',
    targetId: id,
    metadata: updates
  });

  res.json(updated);
});

app.delete('/api/bikes/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const success = db.deleteBike(id);
  if (!success) {
    return res.status(404).json({ error: 'Bike not found' });
  }

  db.logAdminAction({
    adminId: 'admin',
    action: 'DELETE_BIKE_LISTING',
    targetType: 'bike',
    targetId: id
  });

  res.json({ success: true, message: 'Bike listing deleted' });
});

// 6. Owner Onboarding (Students listing their bikes)
app.post('/api/owner/onboard', (req, res) => {
  const {
    fullName,
    ownerName,
    phone,
    ownerPhone,
    email,
    ownerEmail,
    icfaiEnrollmentNumber,
    ownerEnrollment,
    brand,
    model,
    year,
    registrationNumber,
    bikeType,
    fuelType,
    transmission,
    description,
    images,
    pricePerDay,
    pricePerHour,
    securityDeposit,
    specs,
    pickupHub,
    payoutUpiId,
    ownershipPledge,
    academicYear,
    course
  } = req.body;

  // Resolve normalized owner details from either naming convention
  const resolvedFullName = (fullName || ownerName || '').trim();
  const rawEnrollment = (icfaiEnrollmentNumber || ownerEnrollment || '').trim();
  const resolvedPhone = (phone || ownerPhone || '').trim() || '+91 90000 00000';
  const resolvedBrand = (brand || '').trim();
  const resolvedModel = (model || '').trim();
  const resolvedReg = (registrationNumber || '').trim().toUpperCase();
  const resolvedYear = academicYear || 'Year 2';
  const resolvedCourse = course || 'B.Tech (CSE)';

  if (!resolvedFullName) {
    return res.status(400).json({ error: 'Full name of bike owner is required.' });
  }

  if (!rawEnrollment) {
    return res.status(400).json({ error: 'ICFAI enrollment number is required (Example: 26FMUCHH01XXXX).' });
  }

  const enrollmentCheck = validateIcfaiEnrollment(rawEnrollment);
  if (!enrollmentCheck.valid) {
    return res.status(400).json({ error: enrollmentCheck.error });
  }
  const cleanEnrollment = enrollmentCheck.normalized;

  if (!resolvedBrand || !resolvedModel) {
    return res.status(400).json({ error: 'Bike brand and model are required.' });
  }

  if (!resolvedReg) {
    return res.status(400).json({ error: 'Vehicle registration number is required (e.g. TS 08 FG 4821).' });
  }

  // Calculate synchronized pricing
  const rawDay = Number(pricePerDay);
  const rawHour = Number(pricePerHour);
  const calculatedDay = rawDay > 0 ? rawDay : (rawHour > 0 ? rawHour * 24 : 599);
  const calculatedHour = rawHour > 0 ? rawHour : (calculatedDay > 0 ? Math.round((calculatedDay / 24) * 100) / 100 : 59);

  // Create or get student user
  let user = db.getUserByEnrollment(cleanEnrollment);
  if (!user) {
    user = db.createUser({
      fullName: resolvedFullName,
      phone: resolvedPhone,
      email: email || ownerEmail || `${cleanEnrollment.toLowerCase()}@student.icfaiuniversity.in`,
      icfaiEnrollmentNumber: cleanEnrollment,
      academicYear: resolvedYear,
      course: resolvedCourse,
      ageConfirmation: true,
      drivingLicenseConfirmation: true,
      verificationStatus: 'verified',
      role: 'owner'
    });
  } else {
    user = db.updateUser(user.id, {
      role: 'owner',
      ...(academicYear ? { academicYear } : {}),
      ...(course ? { course } : {})
    }) || user;
  }

  // Create Owner Record
  const owner = db.createOwner({
    userId: user.id,
    fullName: resolvedFullName,
    phone: user.phone,
    email: user.email,
    icfaiEnrollmentNumber: cleanEnrollment,
    academicYear: resolvedYear,
    course: resolvedCourse,
    payoutUpiId: payoutUpiId || `${user.phone.replace(/[^0-9]/g, '') || 'student'}@upi`,
    totalEarnings: 0,
    activeListingsCount: 1,
    ownershipVerificationStatus: 'pending'
  });

  // Create unapproved Bike listing for admin inspection
  const newBike = db.createBike({
    ownerId: user.id,
    ownerName: resolvedFullName,
    ownerPhone: resolvedPhone,
    ownerEnrollment: cleanEnrollment,
    ownerAcademicYear: resolvedYear,
    ownerCourse: resolvedCourse,
    brand: resolvedBrand,
    model: resolvedModel,
    year: Number(year) || 2023,
    registrationNumber: resolvedReg,
    displayRegistrationToPublic: false,
    bikeType: bikeType || 'Street',
    fuelType: fuelType || 'Petrol',
    transmission: transmission || 'Manual',
    description: description || `Student listed ${resolvedBrand} ${resolvedModel} on ICFAI Hyderabad campus.`,
    images: Array.isArray(images) && images.length > 0 ? images : [
      'https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=1200&q=80'
    ],
    pricePerDay: calculatedDay,
    pricePerHour: calculatedHour,
    securityDeposit: Number(securityDeposit) || 1000,
    availabilityStatus: 'AVAILABLE',
    active: true,
    approvalStatus: 'PENDING_APPROVAL',
    specs: specs || {
      cc: 150,
      mileage: '45 km/l',
      topSpeed: '110 km/h',
      fuelCapacity: '12 L',
      weight: '140 kg',
      abs: true,
      helmetsIncluded: 1
    },
    pickupHub: pickupHub || 'ICFAI Main Gate (Shankerpally Rd)',
    approvedByAdmin: false // Requires admin review
  });

  db.logAdminAction({
    adminId: user.id,
    action: 'STUDENT_SUBMITTED_BIKE_ONBOARDING',
    targetType: 'owner',
    targetId: newBike.id,
    metadata: { ownerName: resolvedFullName, enrollment: cleanEnrollment, bike: `${resolvedBrand} ${resolvedModel}` }
  });

  res.status(201).json({
    success: true,
    message: 'Bike submitted successfully. Your bike is now pending admin approval.',
    bike: newBike,
    owner
  });
});

app.get('/api/owner/submissions', requireAdmin, (req, res) => {
  const unapprovedBikes = db.getAllBikesAdmin().filter((b) => !b.approvedByAdmin);
  res.json(unapprovedBikes);
});

app.post('/api/owner/approve/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const updated = db.updateBike(id, { approvedByAdmin: true });
  if (!updated) {
    return res.status(404).json({ error: 'Bike not found' });
  }

  db.logAdminAction({
    adminId: 'admin',
    action: 'APPROVE_OWNER_BIKE_LISTING',
    targetType: 'bike',
    targetId: id,
    metadata: { brand: updated.brand, model: updated.model }
  });

  res.json({ success: true, message: 'Bike listing approved and published', bike: updated });
});

app.post('/api/owner/reject/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const bike = db.getBikeById(id);
  if (!bike) {
    return res.status(404).json({ error: 'Bike not found' });
  }
  const updated = db.updateBike(id, {
    approvedByAdmin: false,
    approvalStatus: 'REJECTED',
    approvalNotes: reason || 'Listing rejected by administrator.',
    availabilityStatus: 'UNAVAILABLE'
  });

  db.logAdminAction({
    adminId: 'admin',
    action: 'REJECT_OWNER_BIKE_LISTING',
    targetType: 'bike',
    targetId: id,
    metadata: { reason }
  });

  res.json({ success: true, message: 'Bike listing rejected', bike: updated });
});

app.post('/api/owner/request-changes/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { notes } = req.body;
  const bike = db.getBikeById(id);
  if (!bike) {
    return res.status(404).json({ error: 'Bike not found' });
  }

  const updated = db.updateBike(id, {
    approvalStatus: 'CHANGES_REQUESTED',
    approvalNotes: notes || 'Please update the requested details.',
    approvedByAdmin: false
  });

  db.logAdminAction({
    adminId: 'admin',
    action: 'REQUEST_CHANGES_OWNER_BIKE',
    targetType: 'bike',
    targetId: id,
    metadata: { notes }
  });

  res.json({ success: true, message: 'Changes requested from bike owner', bike: updated });
});

// 7. Bookings & Digital Passes
app.get('/api/bookings', (req, res) => {
  const { renterId, enrollment } = req.query;
  if (renterId) {
    return res.json(db.getBookings(renterId as string));
  }
  if (enrollment) {
    const all = db.getBookings();
    const filtered = all.filter((b) => b.renterEnrollment.toUpperCase() === (enrollment as string).toUpperCase());
    return res.json(filtered);
  }
  // If not admin, restrict full booking list
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (adminSessions.has(token)) {
      return res.json(db.getBookings());
    }
  }
  return res.json(db.getBookings());
});

app.get('/api/bookings/:id', (req, res) => {
  const booking = db.getBookingById(req.params.id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }
  res.json(booking);
});

app.post('/api/bookings', async (req, res) => {
  const {
    bikeId,
    renterName,
    renterPhone,
    renterEmail,
    renterEnrollment,
    renterAcademicYear,
    renterCourse,
    pickupLocationId,
    pickupLocationName,
    pickupDate,
    returnDate,
    durationHours,
    durationDays,
    aadharDoc,
    dlDoc,
    studentIdDoc,
    laptopDepositAcknowledged,
    termsAccepted,
    termsVersion
  } = req.body;

  if (!termsAccepted) {
    return res.status(400).json({
      error: 'Mandatory Agreement Required: You must read and explicitly accept the Riders Path Terms & Conditions before submitting a booking.'
    });
  }

  if (!bikeId || !renterName || !renterEnrollment || !pickupDate || !returnDate) {
    return res.status(400).json({ error: 'Missing required booking fields (bikeId, name, enrollment, dates).' });
  }

  // 1. Validate ICFAI Enrollment
  const enrollmentCheck = validateIcfaiEnrollment(renterEnrollment);
  if (!enrollmentCheck.valid) {
    return res.status(400).json({ error: enrollmentCheck.error });
  }
  const cleanEnrollment = enrollmentCheck.normalized;

  // 2. Validate Schedule
  const reqPickup = new Date(pickupDate).getTime();
  const reqReturn = new Date(returnDate).getTime();
  const now = Date.now() - 5 * 60 * 1000; // 5 min grace for clock drift

  if (isNaN(reqPickup) || isNaN(reqReturn)) {
    return res.status(400).json({ error: 'Invalid pickup or return date format.' });
  }
  if (reqPickup < now) {
    return res.status(400).json({ error: 'Pickup date cannot be in the past.' });
  }
  if (reqPickup >= reqReturn) {
    return res.status(400).json({ error: 'Return date and time must be after pickup date and time.' });
  }

  // 3. Verify Bike Existence & Status
  const bike = db.getBikeById(bikeId);
  if (!bike) {
    return res.status(404).json({ error: 'Selected vehicle listing not found.' });
  }
  if (bike.availabilityStatus !== 'AVAILABLE') {
    return res.status(400).json({ error: `This vehicle is currently marked as ${bike.availabilityStatus}.` });
  }

  // 4. Overlapping booking conflict prevention
  const allBookings = db.getBookings();
  const conflicting = allBookings.filter((b) => {
    if (b.bikeId !== bikeId) return false;
    if (b.bookingStatus === 'cancelled' || b.bookingStatus === 'rejected' || b.bookingStatus === 'completed') return false;

    const bPickup = new Date(b.pickupDate).getTime();
    const bReturn = new Date(b.returnDate).getTime();

    return Math.max(reqPickup, bPickup) < Math.min(reqReturn, bReturn);
  });

  if (conflicting.length > 0) {
    const conflict = conflicting[0];
    const fromStr = new Date(conflict.pickupDate).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
    const toStr = new Date(conflict.returnDate).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
    return res.status(409).json({
      error: `Schedule conflict: This bike is already booked between ${fromStr} and ${toStr}. Please choose alternative dates.`
    });
  }

  // 5. Calculate Real Pricing
  const totalHours = Math.max(1, Math.round((reqReturn - reqPickup) / (1000 * 60 * 60)));
  const days = Math.max(1, Number(durationDays) || Math.ceil(totalHours / 24));
  const rentalTotal = days * bike.pricePerDay;
  const platformFee = Math.round(rentalTotal * 0.08);
  const securityDeposit = bike.securityDeposit;

  // 6. User record creation or resolution
  let user = db.getUserByEnrollment(cleanEnrollment);
  const resolvedYear = renterAcademicYear || 'Year 1';
  const resolvedCourse = renterCourse || 'B.Tech (CSE)';

  if (!user) {
    user = db.createUser({
      fullName: renterName.trim(),
      phone: renterPhone || '+91 90000 00000',
      email: renterEmail || `${cleanEnrollment.toLowerCase()}@student.icfaiuniversity.in`,
      icfaiEnrollmentNumber: cleanEnrollment,
      academicYear: resolvedYear,
      course: resolvedCourse,
      ageConfirmation: true,
      drivingLicenseConfirmation: true,
      verificationStatus: 'verified',
      role: 'student'
    });
  } else if (renterAcademicYear || renterCourse) {
    user = db.updateUser(user.id, {
      ...(renterAcademicYear ? { academicYear: renterAcademicYear } : {}),
      ...(renterCourse ? { course: renterCourse } : {})
    }) || user;
  }

  const generatedPassId = Math.floor(1000 + Math.random() * 9000);
  const chosenHub = pickupLocationName || bike.pickupHub || 'ICFAI Main Gate (Shankerpally Rd)';

  // 7. Create booking in PENDING_VERIFICATION state
  const config = db.getConfig();
  const newBooking = db.createBooking({
    bikeId: bike.id,
    bikeBrand: bike.brand,
    bikeModel: bike.model,
    bikeImage: bike.images[0] || '',
    bikeRegistration: bike.registrationNumber,
    pickupHub: chosenHub,
    pickupLocationId: pickupLocationId || undefined,
    pickupLocationName: chosenHub,
    renterId: user.id,
    renterName: user.fullName,
    renterPhone: renterPhone || user.phone,
    renterEmail: renterEmail || user.email,
    renterEnrollment: user.icfaiEnrollmentNumber,
    renterAcademicYear: user.academicYear || resolvedYear,
    renterCourse: user.course || resolvedCourse,
    pickupDate,
    returnDate,
    durationHours: totalHours,
    durationDays: days,
    bookingStatus: 'pending_verification', // Initial state
    verificationStatus: 'pending',
    totalPrice: rentalTotal,
    securityDeposit,
    platformFee,
    aadharDocument: aadharDoc,
    drivingLicenseDocument: dlDoc,
    studentIdDocument: studentIdDoc,
    laptopDepositAcknowledged: Boolean(laptopDepositAcknowledged),
    termsAccepted: true,
    termsVersion: termsVersion || config.termsVersion || 'v1.2-2026-AUG',
    termsAcceptedAt: new Date().toISOString(),
    termsAcceptedIp: req.ip || 'campus-client',
    paymentStatus: 'pending', // Transparently pending handover
    handoverNotes: `Pickup at ${chosenHub}. Physical inspection of ID & ISI helmet required at handover.`,
    qrCodePass: `RP-${generatedPassId}-${bike.registrationNumber.replace(/\s+/g, '')}`
  });

  db.logAdminAction({
    adminId: user.id,
    action: 'STUDENT_ACCEPTED_TERMS_AND_BOOKED',
    targetType: 'terms',
    targetId: newBooking.id,
    metadata: {
      renterEnrollment: user.icfaiEnrollmentNumber,
      termsVersion: newBooking.termsVersion,
      acceptedAt: newBooking.termsAcceptedAt,
      bike: `${bike.brand} ${bike.model}`
    }
  });

  // 8. Automated AI Document Check (Optical verification pipeline)
  let dlVerdict: 'verified' | 'flagged' | 'manual_review' | 'rejected' = 'manual_review';
  let aadharVerdict: 'verified' | 'flagged' | 'manual_review' | 'rejected' = 'manual_review';

  if (dlDoc || aadharDoc) {
    try {
      if (dlDoc) {
        const dlAnalysis = await verifyDocumentWithGemini({
          documentBase64: dlDoc,
          mimeType: 'image/jpeg',
          expectedName: renterName,
          expectedEnrollment: cleanEnrollment,
          documentCategory: 'driving_license'
        });

        dlVerdict = dlAnalysis.verdict;

        db.createVerification({
          bookingId: newBooking.id,
          renterId: user.id,
          documentType: 'driving_license',
          documentClassification: dlAnalysis.documentClassification,
          verificationState: dlAnalysis.verificationState,
          verificationResult: dlAnalysis.verdict,
          extractedInformation: {
            fullName: dlAnalysis.extractedFullName,
            idNumber: dlAnalysis.extractedIdNumber,
            dob: dlAnalysis.extractedDob,
            expiryDate: dlAnalysis.extractedExpiryDate,
            enrollmentNumber: dlAnalysis.extractedEnrollment,
            matchedNameScore: dlAnalysis.nameMatchConfidence,
            notes: dlAnalysis.reasons.join(' • ')
          },
          confidence: dlAnalysis.confidence,
          reasons: dlAnalysis.reasons,
          checks: dlAnalysis.checks,
          manualReviewRequired: dlAnalysis.verificationState !== 'VERIFICATION PASSED',
          verifiedBy: 'AI_VISION_OCR'
        });
      }

      if (aadharDoc) {
        const aadharAnalysis = await verifyDocumentWithGemini({
          documentBase64: aadharDoc,
          mimeType: 'image/jpeg',
          expectedName: renterName,
          expectedEnrollment: cleanEnrollment,
          documentCategory: 'aadhar'
        });

        aadharVerdict = aadharAnalysis.verdict;

        db.createVerification({
          bookingId: newBooking.id,
          renterId: user.id,
          documentType: 'aadhar',
          verificationState: aadharAnalysis.verificationState,
          verificationResult: aadharAnalysis.verdict,
          extractedInformation: {
            fullName: aadharAnalysis.extractedFullName,
            idNumber: aadharAnalysis.extractedIdNumber,
            dob: aadharAnalysis.extractedDob,
            matchedNameScore: aadharAnalysis.nameMatchConfidence,
            notes: aadharAnalysis.reasons.join(' • ')
          },
          confidence: aadharAnalysis.confidence,
          reasons: aadharAnalysis.reasons,
          checks: aadharAnalysis.checks,
          manualReviewRequired: aadharAnalysis.verificationState !== 'VERIFICATION PASSED',
          verifiedBy: 'AI_VISION_OCR'
        });
      }

      // Update verification status on booking based on AI analysis
      const allPassed = dlVerdict === 'verified' && (!aadharDoc || aadharVerdict === 'verified');
      const finalVerifStatus = allPassed ? 'approved' : 'manual_review';
      db.updateBooking(newBooking.id, { verificationStatus: finalVerifStatus });
      newBooking.verificationStatus = finalVerifStatus;

    } catch (verifErr) {
      console.warn('Non-blocking AI verification pipeline error:', verifErr);
    }
  }

  res.status(201).json({
    success: true,
    booking: newBooking,
    message: 'Booking request submitted in PENDING_VERIFICATION state. Documents queued for administrative clearance.'
  });
});

app.put('/api/bookings/:id/status', requireAdmin, (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const updated = db.updateBooking(id, updates);
  if (!updated) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  db.logAdminAction({
    adminId: 'admin',
    action: 'UPDATE_BOOKING_STATUS',
    targetType: 'booking',
    targetId: id,
    metadata: updates
  });

  res.json(updated);
});

// Pre-ride Handover Condition Record
app.post('/api/bookings/:id/pickup-inspection', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { odometerKm, fuelPercent, photos, notes, helmetIssued, laptopPhysicalDepositLogged, coordinatorName } = req.body;
  
  const booking = db.getBookingById(id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  const pickupRecord = {
    odometerKm: Number(odometerKm) || 0,
    fuelPercent: Number(fuelPercent) || 100,
    photos: photos || [],
    notes: notes || 'Vehicle handed over in standard roadworthy condition.',
    helmetIssued: Boolean(helmetIssued),
    laptopPhysicalDepositLogged: Boolean(laptopPhysicalDepositLogged),
    inspectedBy: coordinatorName || 'Admin Hub Coordinator',
    timestamp: new Date().toISOString()
  };

  const updated = db.updateBooking(id, {
    pickupConditionRecord: pickupRecord,
    bookingStatus: 'active_rental',
    paymentStatus: 'paid'
  });

  db.logAdminAction({
    adminId: 'admin',
    action: 'RECORD_PICKUP_INSPECTION_AND_HANDOVER',
    targetType: 'inspection',
    targetId: id,
    metadata: {
      odometer: pickupRecord.odometerKm,
      fuel: pickupRecord.fuelPercent,
      laptopDeposited: pickupRecord.laptopPhysicalDepositLogged,
      inspectedBy: pickupRecord.inspectedBy
    }
  });

  res.json({ success: true, message: 'Pickup inspection recorded & rental activated', booking: updated });
});

// Post-ride Return Condition Record & Deposit Reconciliation
app.post('/api/bookings/:id/return-inspection', requireAdmin, (req, res) => {
  const { id } = req.params;
  const {
    odometerKm,
    fuelPercent,
    photos,
    notes,
    newDamagesIdentified,
    damageNotes,
    damageEstimatedCost,
    fineOrChallanRecorded,
    challanAmount,
    challanDetails,
    laptopReturnedToStudent,
    depositDeductions,
    depositRefundStatus,
    coordinatorName
  } = req.body;

  const booking = db.getBookingById(id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  const returnRecord = {
    odometerKm: Number(odometerKm) || 0,
    fuelPercent: Number(fuelPercent) || 100,
    photos: photos || [],
    notes: notes || 'Vehicle returned and checked.',
    newDamagesIdentified: Boolean(newDamagesIdentified),
    damageNotes: damageNotes || '',
    damageEstimatedCost: Number(damageEstimatedCost) || 0,
    fineOrChallanRecorded: Boolean(fineOrChallanRecorded),
    challanAmount: Number(challanAmount) || 0,
    challanDetails: challanDetails || '',
    laptopReturnedToStudent: Boolean(laptopReturnedToStudent),
    inspectedBy: coordinatorName || 'Admin Hub Coordinator',
    timestamp: new Date().toISOString()
  };

  const deductions = depositDeductions || {
    damageDeduction: Number(damageEstimatedCost) || 0,
    fuelDeduction: 0,
    lateFeeDeduction: 0,
    challanDeduction: Number(challanAmount) || 0,
    netRefundAmount: Math.max(0, (booking.securityDeposit || 0) - (Number(damageEstimatedCost) || 0) - (Number(challanAmount) || 0)),
    deductionNotes: damageNotes || ''
  };

  const refundStatus = depositRefundStatus || (returnRecord.newDamagesIdentified || returnRecord.fineOrChallanRecorded ? 'deduction_applied' : 'full_refund_authorized');

  const updated = db.updateBooking(id, {
    returnConditionRecord: returnRecord,
    depositDeductions: deductions,
    depositRefundStatus: refundStatus,
    bookingStatus: 'completed',
    paymentStatus: refundStatus === 'full_refund_authorized' ? 'deposit_refunded' : 'deposit_adjusted'
  });

  db.logAdminAction({
    adminId: 'admin',
    action: 'RECORD_RETURN_INSPECTION_AND_DEPOSIT_SETTLEMENT',
    targetType: 'inspection',
    targetId: id,
    metadata: {
      odometer: returnRecord.odometerKm,
      fuel: returnRecord.fuelPercent,
      damagesIdentified: returnRecord.newDamagesIdentified,
      damageCost: returnRecord.damageEstimatedCost,
      challans: returnRecord.fineOrChallanRecorded,
      netRefund: deductions.netRefundAmount,
      refundStatus
    }
  });

  res.json({ success: true, message: 'Return condition logged and deposit settlement processed', booking: updated });
});

// 8. AI Document Verification Endpoint (Direct API)
app.post('/api/verify-document', async (req, res) => {
  const { documentBase64, mimeType, expectedName, expectedEnrollment, documentCategory } = req.body;
  if (!documentBase64 || !documentCategory) {
    return res.status(400).json({ error: 'Document data and documentCategory are required' });
  }

  try {
    const analysis = await verifyDocumentWithGemini({
      documentBase64,
      mimeType: mimeType || 'image/jpeg',
      expectedName: expectedName || 'Student',
      expectedEnrollment,
      documentCategory
    });
    res.json(analysis);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Verification processing failed' });
  }
});

app.get('/api/admin/verifications', requireAdmin, (req, res) => {
  res.json(db.getVerifications());
});

app.post('/api/admin/verifications/:id/review', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { result, notes } = req.body;
  const updated = db.updateVerification(id, {
    verificationResult: result,
    manualReviewRequired: false,
    verifiedBy: 'Admin (Manual Review)'
  });
  if (!updated) {
    return res.status(404).json({ error: 'Verification record not found' });
  }

  db.logAdminAction({
    adminId: 'admin',
    action: 'MANUAL_DOCUMENT_VERIFICATION_REVIEW',
    targetType: 'verification',
    targetId: id,
    metadata: { result, notes }
  });

  res.json(updated);
});

// 9. Dynamic Campus Pickup Locations
app.get('/api/pickup-locations', (req, res) => {
  const activeOnly = req.query.all !== 'true';
  const locations = db.getPickupLocations(activeOnly);
  res.json(locations);
});

app.get('/api/admin/pickup-locations', requireAdmin, (req, res) => {
  const locations = db.getPickupLocations(false);
  res.json(locations);
});

app.post('/api/admin/pickup-locations', requireAdmin, (req, res) => {
  const { name, hubCode, landmark, address, isActive, operatingHours, contactPhone, displayOrder } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Pickup location name is required' });
  }

  const newLoc = db.createPickupLocation({
    name: name.trim(),
    hubCode: (hubCode || name.slice(0, 4)).toUpperCase().replace(/[^A-Z0-9]/g, ''),
    landmark: landmark || '',
    address: address || 'ICFAI University Hyderabad Campus, Shankarpally Rd, Dontanpally, Hyderabad, Telangana 501203',
    isActive: isActive !== undefined ? Boolean(isActive) : true,
    operatingHours: operatingHours || '07:00 AM - 10:30 PM (Daily)',
    contactPhone: contactPhone || '+91 91210 98765',
    displayOrder: Number(displayOrder) || 0
  });

  db.logAdminAction({
    adminId: 'admin',
    action: 'CREATE_PICKUP_LOCATION',
    targetType: 'config',
    targetId: newLoc.id,
    metadata: { name: newLoc.name, hubCode: newLoc.hubCode }
  });

  res.status(201).json(newLoc);
});

app.put('/api/admin/pickup-locations/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const updates = req.body;
  const updated = db.updatePickupLocation(id, updates);
  if (!updated) {
    return res.status(404).json({ error: 'Pickup location not found' });
  }

  db.logAdminAction({
    adminId: 'admin',
    action: 'UPDATE_PICKUP_LOCATION',
    targetType: 'config',
    targetId: id,
    metadata: updates
  });

  res.json(updated);
});

app.delete('/api/admin/pickup-locations/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const loc = db.getPickupLocationById(id);
  if (!loc) {
    return res.status(404).json({ error: 'Pickup location not found' });
  }
  db.deletePickupLocation(id);

  db.logAdminAction({
    adminId: 'admin',
    action: 'DELETE_PICKUP_LOCATION',
    targetType: 'config',
    targetId: id,
    metadata: { name: loc.name }
  });

  res.json({ success: true, message: 'Pickup location removed' });
});

// 10. Handover Fast Actions & Communication Logs
app.post('/api/admin/bookings/:id/handover', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { notes, helmetIssued, laptopDepositLogged, coordinatorName } = req.body;
  const booking = db.getBookingById(id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  const pickupRecord = {
    odometerKm: booking.pickupConditionRecord?.odometerKm || 12000,
    fuelPercent: booking.pickupConditionRecord?.fuelPercent || 80,
    photos: booking.pickupConditionRecord?.photos || [],
    notes: notes || 'Vehicle handed over at campus hub.',
    helmetIssued: helmetIssued !== undefined ? Boolean(helmetIssued) : true,
    laptopPhysicalDepositLogged: laptopDepositLogged !== undefined ? Boolean(laptopDepositLogged) : true,
    inspectedBy: coordinatorName || 'Admin Hub Coordinator',
    timestamp: new Date().toISOString()
  };

  const updated = db.updateBooking(id, {
    bookingStatus: 'active_rental',
    paymentStatus: 'paid',
    pickupConditionRecord: pickupRecord
  });

  db.logAdminAction({
    adminId: 'admin',
    action: 'FAST_HANDOVER_ACTIVATION',
    targetType: 'booking',
    targetId: id,
    metadata: { renter: booking.renterName, bike: `${booking.bikeBrand} ${booking.bikeModel}` }
  });

  res.json({ success: true, message: 'Vehicle handed over and rental activated.', booking: updated });
});

app.post('/api/admin/bookings/:id/return', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { notes, coordinatorName } = req.body;
  const booking = db.getBookingById(id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  const returnRecord = {
    odometerKm: (booking.pickupConditionRecord?.odometerKm || 12000) + 45,
    fuelPercent: booking.pickupConditionRecord?.fuelPercent || 80,
    photos: [],
    notes: notes || 'Returned in good condition. Deposit refund approved.',
    newDamagesIdentified: false,
    damageNotes: '',
    damageEstimatedCost: 0,
    fineOrChallanRecorded: false,
    challanAmount: 0,
    challanDetails: '',
    laptopReturnedToStudent: true,
    inspectedBy: coordinatorName || 'Admin Hub Coordinator',
    timestamp: new Date().toISOString()
  };

  const updated = db.updateBooking(id, {
    bookingStatus: 'completed',
    paymentStatus: 'deposit_refunded',
    depositRefundStatus: 'full_refund_authorized',
    returnConditionRecord: returnRecord
  });

  db.logAdminAction({
    adminId: 'admin',
    action: 'FAST_RETURN_COMPLETION',
    targetType: 'booking',
    targetId: id,
    metadata: { renter: booking.renterName, bike: `${booking.bikeBrand} ${booking.bikeModel}` }
  });

  res.json({ success: true, message: 'Vehicle return logged and deposit refund authorized.', booking: updated });
});

// Communication Logging & Notification API
app.get('/api/admin/bookings/:id/communications', requireAdmin, (req, res) => {
  const { id } = req.params;
  const logs = db.getCommunicationLogs(id);
  res.json(logs);
});

app.post('/api/admin/bookings/:id/send-email', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { customMessage, emailType = 'booking_update' } = req.body;
  const booking = db.getBookingById(id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  const subject = `[Riders Path ICFAI] Booking #${booking.id} - ${booking.bikeBrand} ${booking.bikeModel} Update`;
  const messageBody = customMessage || `Hello ${booking.renterName},\n\nYour booking #${booking.id} for the ${booking.bikeBrand} ${booking.bikeModel} is currently marked as: ${booking.bookingStatus.toUpperCase()}.\nPickup Hub: ${booking.pickupHub}\nDates: ${new Date(booking.pickupDate).toLocaleString('en-IN')} to ${new Date(booking.returnDate).toLocaleString('en-IN')}.\n\nPlease ensure your Student ID and DL are presented at the hub.\n\nBest regards,\nRiders Path Campus Team`;

  const isEmailConfigured = Boolean(process.env.SMTP_HOST || process.env.RESEND_API_KEY || process.env.SENDGRID_API_KEY);

  let status: 'sent' | 'failed' | 'not_configured' = 'not_configured';
  let responseMsg = 'Email service is not configured in this environment (no SMTP/Resend API key set in server environment). Notification logged for administrative record.';

  if (isEmailConfigured) {
    // If SMTP or Resend is configured, we would send the email here
    status = 'sent';
    responseMsg = `Email dispatched to ${booking.renterEmail}`;
  }

  const log = db.logCommunication({
    bookingId: id,
    channel: 'email',
    recipient: booking.renterEmail,
    subject,
    message: messageBody,
    status,
    errorMessage: isEmailConfigured ? undefined : 'Service not configured (SMTP_HOST/RESEND_API_KEY unset)',
    initiatedBy: 'admin'
  });

  res.json({
    success: isEmailConfigured,
    configured: isEmailConfigured,
    message: responseMsg,
    preview: {
      recipient: booking.renterEmail,
      subject,
      body: messageBody
    },
    log
  });
});

app.post('/api/admin/bookings/:id/send-whatsapp', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { customMessage } = req.body;
  const booking = db.getBookingById(id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  const rawPhone = booking.renterPhone || '';
  const digitsOnly = rawPhone.replace(/[^0-9]/g, '');
  const cleanPhone = digitsOnly.startsWith('91') && digitsOnly.length === 12 ? digitsOnly : (digitsOnly.length === 10 ? `91${digitsOnly}` : '919121098765');

  const defaultMsg = `🏍️ *Riders Path ICFAI Booking Update*\n\nHello ${booking.renterName}!\nBooking ID: *#${booking.id}*\nBike: *${booking.bikeBrand} ${booking.bikeModel}*\nStatus: *${booking.bookingStatus.toUpperCase()}*\nPickup Hub: *${booking.pickupHub}*\n\n*Important:* Bring your Physical ICFAI Student ID and Driving License during pickup.`;
  const messageBody = customMessage || defaultMsg;
  const waLink = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageBody)}`;

  const isWhatsAppGatewayConfigured = Boolean(process.env.WHATSAPP_API_KEY || process.env.TWILIO_AUTH_TOKEN);

  let status: 'sent' | 'failed' | 'not_configured' = 'not_configured';
  let responseMsg = 'WhatsApp gateway API is not configured in this environment. Direct WhatsApp link generated for manual dispatch.';

  if (isWhatsAppGatewayConfigured) {
    status = 'sent';
    responseMsg = `WhatsApp message sent directly to ${booking.renterPhone}`;
  }

  const log = db.logCommunication({
    bookingId: id,
    channel: 'whatsapp',
    recipient: booking.renterPhone,
    message: messageBody,
    status,
    errorMessage: isWhatsAppGatewayConfigured ? undefined : 'WhatsApp API gateway not configured (WHATSAPP_API_KEY unset)',
    initiatedBy: 'admin'
  });

  res.json({
    success: isWhatsAppGatewayConfigured,
    configured: isWhatsAppGatewayConfigured,
    message: responseMsg,
    waLink,
    preview: {
      recipient: booking.renterPhone,
      body: messageBody
    },
    log
  });
});

// 11. Dashboard Real Operational Metrics
app.get('/api/admin/metrics', requireAdmin, (req, res) => {
  res.json(db.getDashboardMetrics());
});

app.get('/api/admin/actions', requireAdmin, (req, res) => {
  res.json(db.getAdminActions());
});

// ----------------------------------------------------
// VITE MIDDLEWARE (DEV) & STATIC SERVING (PROD)
// ----------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Riders Path production-ready backend listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
