import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, FileText, Lock, AlertTriangle, ArrowLeft, HelpCircle } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PLATFORM_CONFIG } from '../config/platform.config';

export const TermsPage: React.FC = () => (
  <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
    <div className="flex items-center gap-2 text-xs font-mono text-amber-400 mb-2">
      <FileText className="w-4 h-4" />
      <span>LEGAL & CAMPUS COMPLIANCE</span>
    </div>
    <h1 className="text-3xl font-bold font-heading text-neutral-100 mb-2">
      Campus Rental Terms & Conditions
    </h1>
    <p className="text-xs text-neutral-400 mb-8">
      Version: {PLATFORM_CONFIG.termsVersion} • Effective: Academic Year 2026-2027
    </p>

    <div className="flex flex-col gap-6 text-xs text-neutral-300 leading-relaxed">
      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-neutral-100">1. Eligibility & Driver Qualification</h2>
        <p>
          Renters must be currently enrolled students at {PLATFORM_CONFIG.campusName}. A valid Indian Driving Licence (Two-Wheeler with Gear or Without Gear) is compulsory. Driving under any third party’s identity is strictly prohibited.
        </p>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-neutral-100">2. Security Deposit Terms</h2>
        <p>
          Renters agree to deposit either their active personal laptop or a refundable security deposit of ₹1,500 with the student coordinator at the designated pickup hub. The deposit is returned immediately upon completion of the physical return inspection.
        </p>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-neutral-100">3. Speed Limits & Mandatory Helmet Policy</h2>
        <p>
          Students must wear an ISI-marked helmet at all times. A strict campus speed limit of 25 km/h is enforced across all university roadways. Violations will result in suspension from the Riders Path platform.
        </p>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-neutral-100">4. Fuel & Vehicle Custody</h2>
        <p>
          Vehicles must be returned with the same fuel or battery level recorded during pickup inspection. Renters are responsible for basic care during the booking window.
        </p>
      </Card>
    </div>
  </div>
);

export const PrivacyPage: React.FC = () => (
  <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
    <div className="flex items-center gap-2 text-xs font-mono text-amber-400 mb-2">
      <Lock className="w-4 h-4" />
      <span>STUDENT PRIVACY POLICY</span>
    </div>
    <h1 className="text-3xl font-bold font-heading text-neutral-100 mb-2">
      Student Privacy & Data Protection Notice
    </h1>
    <p className="text-xs text-neutral-400 mb-8">
      Version: {PLATFORM_CONFIG.privacyVersion}
    </p>

    <div className="flex flex-col gap-6 text-xs text-neutral-300 leading-relaxed">
      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-neutral-100">1. Strict No-Aadhaar Policy</h2>
        <p>
          In full accordance with Indian regulatory directives and Supreme Court privacy guidelines, Riders Path does NOT collect, solicit, or store Aadhaar card numbers, scans, or biometric data. Identity verification is conducted strictly through institutional ICFAI Student ID cards and State Two-Wheeler Driving Licences.
        </p>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-neutral-100">2. Data Retention & Purpose Limitation</h2>
        <p>
          Student contact numbers and driving licence scans are retained only for vehicle custody audit purposes during the active rental cycle and are automatically expunged after return verification. Data is never monetized or provided to commercial advertising networks.
        </p>
      </Card>
    </div>
  </div>
);

export const RefundPolicyPage: React.FC = () => (
  <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
    <div className="flex items-center gap-2 text-xs font-mono text-amber-400 mb-2">
      <Shield className="w-4 h-4" />
      <span>FINANCIAL DISCLOSURE</span>
    </div>
    <h1 className="text-3xl font-bold font-heading text-neutral-100 mb-2">
      Security Deposit & Refund Policy
    </h1>
    <p className="text-xs text-neutral-400 mb-8">
      All transactions are settled offline at the campus pickup hub (&quot;Pay at Handover&quot;).
    </p>

    <div className="flex flex-col gap-6 text-xs text-neutral-300 leading-relaxed">
      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-neutral-100">1. Instant Deposit Return</h2>
        <p>
          Security deposits (laptop or ₹1,500 cash) are returned to the student immediately at the pickup hub upon satisfactory vehicle return inspection.
        </p>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-bold text-neutral-100">2. Cancellation Policy</h2>
        <p>
          Students may cancel any uncollected reservation through the &quot;My Bookings&quot; portal without incurring cancellation fees.
        </p>
      </Card>
    </div>
  </div>
);

export const SafetyPage: React.FC = () => (
  <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
    <div className="flex items-center gap-2 text-xs font-mono text-amber-400 mb-2">
      <AlertTriangle className="w-4 h-4" />
      <span>CAMPUS GUIDELINES</span>
    </div>
    <h1 className="text-3xl font-bold font-heading text-neutral-100 mb-8">
      Safety & Compliance Rules
    </h1>

    <div className="flex flex-col gap-4">
      {PLATFORM_CONFIG.safetyRules.map((rule, idx) => (
        <Card key={idx} className="p-4 flex items-start gap-3">
          <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold shrink-0">
            {idx + 1}
          </span>
          <p className="text-xs text-neutral-200 mt-1">{rule}</p>
        </Card>
      ))}
    </div>
  </div>
);

export const NotFoundPage: React.FC = () => (
  <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
    <span className="text-6xl font-extrabold font-mono text-neutral-800 mb-2">404</span>
    <h1 className="text-2xl font-bold font-heading text-neutral-100 mb-2">
      Campus Route Not Found
    </h1>
    <p className="text-xs text-neutral-400 max-w-sm mb-6">
      The requested page or vehicle listing does not exist in the Riders Path network.
    </p>
    <Link to="/">
      <Button variant="primary" leftIcon={<ArrowLeft className="w-4 h-4" />}>
        Return to Campus Home
      </Button>
    </Link>
  </div>
);
