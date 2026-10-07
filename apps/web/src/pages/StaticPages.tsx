import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, FileText, Lock, AlertTriangle, ArrowLeft, HelpCircle } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PLATFORM_CONFIG } from '@riders-path/shared';

export const TermsPage: React.FC = () => (
  <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12">
    <div className="flex items-center gap-2 text-xs font-mono text-amber-400 mb-2">
      <FileText className="w-4 h-4" />
      <span>LEGAL & CAMPUS COMPLIANCE</span>
    </div>
    <h1 className="text-3xl font-bold font-heading text-neutral-100 mb-2">
      Campus Rental Terms & Conditions
    </h1>
    <p className="text-xs text-neutral-400 mb-8">Version: {PLATFORM_CONFIG.termsVersion}</p>
    <Card className="flex flex-col gap-3 text-sm text-neutral-300 leading-relaxed">
      <strong className="text-amber-400">[LEGAL TEXT TO BE REVIEWED]</strong>
      <p>Terms and conditions have not yet been approved for publication.</p>
    </Card>
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
    <p className="text-xs text-neutral-400 mb-8">Version: {PLATFORM_CONFIG.privacyVersion}</p>
    <Card className="flex flex-col gap-3 text-sm text-neutral-300 leading-relaxed">
      <strong className="text-amber-400">[LEGAL TEXT TO BE REVIEWED]</strong>
      <p>The privacy notice has not yet been approved for publication.</p>
    </Card>
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
    <p className="text-xs text-neutral-400 mb-8">Payment is due at handover. Full refund and deposit terms are pending review.</p>
    <Card className="flex flex-col gap-3 text-sm text-neutral-300 leading-relaxed">
      <strong className="text-amber-400">[LEGAL TEXT TO BE REVIEWED]</strong>
      <p>Refund and deposit terms have not yet been approved for publication.</p>
    </Card>
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
    <Link to="/" className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 focus-visible:ring-2 focus-visible:ring-amber-500">
      <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Return to Campus Home
    </Link>
  </div>
);
