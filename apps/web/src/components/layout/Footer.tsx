import React from 'react';
import { Link } from 'react-router-dom';
import { Bike, Shield, FileText, Lock, HelpCircle, AlertCircle } from 'lucide-react';
import { PLATFORM_CONFIG } from '@riders-path/shared';

export const Footer: React.FC = () => {
  return (
    <footer className="w-full bg-neutral-950 border-t border-neutral-900 mt-20 text-neutral-400 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {/* Brand Col */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-neutral-100">
              <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 font-black">
                <Bike className="w-4 h-4 stroke-[2.5]" />
              </div>
              <span className="font-heading font-bold text-sm tracking-tight">
                RIDERS PATH
              </span>
            </div>
            <p className="text-neutral-400 leading-relaxed">
              Student peer-to-peer bike sharing facilitator for {PLATFORM_CONFIG.campusName}.
            </p>
            <div className="flex items-center gap-2 text-[11px] font-mono text-amber-400/90 bg-amber-500/10 px-3 py-1.5 rounded-lg border border-amber-500/20 w-fit">
              <span>Campus Community Portal</span>
            </div>
          </div>

          {/* Hubs */}
          <div className="flex flex-col gap-2.5">
            <span className="text-neutral-200 font-semibold uppercase tracking-wider text-[11px]">
              Campus Pickup Hubs
            </span>
            {PLATFORM_CONFIG.hubs.map((hub) => (
              <span key={hub.id} className="text-neutral-400 hover:text-neutral-200 transition-colors">
                {hub.name} · {hub.operatingHours}
              </span>
            ))}
          </div>

          {/* Trust & Policies */}
          <div className="flex flex-col gap-2.5">
            <span className="text-neutral-200 font-semibold uppercase tracking-wider text-[11px]">
              Compliance & Safety
            </span>
            <Link to="/terms" className="hover:text-amber-400 transition-colors flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              <span>Campus Rental Terms ({PLATFORM_CONFIG.termsVersion})</span>
            </Link>
            <Link to="/privacy" className="hover:text-amber-400 transition-colors flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" />
              <span>Student Privacy Notice</span>
            </Link>
            <Link to="/refund-policy" className="hover:text-amber-400 transition-colors flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              <span>Security Deposit & Refund Policy</span>
            </Link>
            <Link to="/safety" className="hover:text-amber-400 transition-colors flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Mandatory Safety Guidelines</span>
            </Link>
          </div>

          {/* Quick Links & FAQ */}
          <div className="flex flex-col gap-2.5">
            <span className="text-neutral-200 font-semibold uppercase tracking-wider text-[11px]">
              Support & Desk
            </span>
            <Link to="/how-it-works" className="hover:text-neutral-200 transition-colors">
              How It Works
            </Link>
            <Link to="/faq" className="hover:text-neutral-200 transition-colors flex items-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Frequently Asked Questions</span>
            </Link>
            <span className="text-[11px] text-neutral-400 mt-2">
              Hours vary by pickup hub; see the selected hub details.
            </span>
          </div>
        </div>

        {/* Regulatory disclaimer */}
        <div className="pt-8 border-t border-neutral-900/80 flex flex-col md:flex-row items-center justify-between gap-4 text-[11px] text-neutral-400">
          <p className="max-w-2xl leading-relaxed text-center md:text-left">
            <span className="font-semibold text-amber-400">[LEGAL TEXT TO BE REVIEWED]</span>
          </p>
          <p>© {new Date().getFullYear()} Riders Path ICFAI Hyderabad. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};
