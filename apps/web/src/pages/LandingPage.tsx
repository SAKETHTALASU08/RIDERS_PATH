import React from 'react';
import { Link } from 'react-router-dom';
import {
  Bike,
  ShieldCheck,
  Search,
  Key,
  Clock,
  MapPin,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  HelpCircle,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { PLATFORM_CONFIG } from '@riders-path/shared';
import { useAuth } from '../context/AuthContext';

export const LandingPage: React.FC = () => {
  const { user, openAuthModal } = useAuth();

  const steps = [
    {
      step: '01',
      title: 'Browse & Reserve',
      desc: 'Browse student-listed bikes and scooters at campus hubs, then check availability for your rental window.',
      icon: <Search className="w-5 h-5 text-amber-400" />,
    },
    {
      step: '02',
      title: 'Email and document review',
      desc: 'Confirm an allowed college email, complete your profile, and submit the requested documents for human review.',
      icon: <ShieldCheck className="w-5 h-5 text-amber-400" />,
    },
    {
      step: '03',
      title: 'Campus Hub Handover',
      desc: 'Meet at the selected campus hub, review handover details, pay at handover, and follow the safety rules.',
      icon: <Key className="w-5 h-5 text-amber-400" />,
    },
  ];

  const safetyHighlights = [
    {
      title: 'Helmet Requirement',
      desc: 'Wear an appropriate helmet while riding. Confirm helmet availability with the owner before pickup.',
    },
    {
      title: 'Campus Speed Guidance',
      desc: 'Follow posted campus speed limits and give pedestrians priority around walkways and crossings.',
    },
    {
      title: 'Handover Check',
      desc: 'Check vehicle condition, fuel level, and handover details with the owner at pickup and return.',
    },
    {
      title: 'Pay at Handover',
      desc: 'The booking flow shows the server-calculated rental, platform fee, and deposit before you submit a request.',
    },
  ];

  const faqs = [
    {
      q: 'Who can rent bikes on Riders Path?',
      a: `Any active student of ${PLATFORM_CONFIG.campusName} with an allowed college email, a complete profile, and a valid two-wheeler driving licence.`,
    },
    {
      q: 'What are the security deposit options?',
      a: 'Available deposit options and amounts are shown in the booking flow. Refund and return terms are pending legal review.',
    },
    {
      q: 'Which documents should I submit?',
      a: 'The booking flow lists the required documents and explains their purpose before upload. A campus team member reviews submitted documents.',
    },
    {
      q: 'Can I list my own two-wheeler to earn?',
      a: 'Yes. Submit vehicle, registration, insurance, and payout details for review. The owner page shows listing status and earnings information.',
    },
  ];

  return (
    <div className="flex flex-col w-full">
      {/* Hero Section */}
      <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28 border-b border-neutral-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 relative z-10">
          <div className="flex flex-col items-center text-center max-w-3xl mx-auto">
            {/* Campus Trust Pill */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-neutral-900 border border-neutral-800 text-xs font-mono text-neutral-300 mb-6 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
              <span>Exclusively for ICFAI Hyderabad Students</span>
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold font-heading text-neutral-100 tracking-tight leading-[1.1] mb-6">
              Peer-to-Peer Bike Rentals Across{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-amber-600">
                Campus Hubs
              </span>
            </h1>

            <p className="text-base sm:text-lg text-neutral-400 mb-8 leading-relaxed max-w-2xl">
              Student-to-student two-wheeler sharing with server-calculated pricing and pickup at a selected campus hub.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-3.5 w-full sm:w-auto">
              <Link to="/browse" className="inline-flex min-h-[52px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-3.5 text-base font-semibold text-slate-950 hover:bg-amber-400 focus-visible:ring-2 focus-visible:ring-amber-500">
                Browse Campus Fleet <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>

              <Link to="/owner" className="inline-flex min-h-[52px] w-full sm:w-auto items-center justify-center rounded-xl border border-neutral-700 bg-transparent px-6 py-3.5 text-base font-medium text-neutral-200 hover:border-neutral-500 hover:bg-neutral-900 focus-visible:ring-2 focus-visible:ring-amber-500">
                List Your Bike
              </Link>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 sm:gap-12 mt-14 pt-8 border-t border-neutral-900 w-full max-w-xl text-center">
              <div>
                <p className="text-2xl sm:text-3xl font-bold font-mono text-amber-400">{PLATFORM_CONFIG.hubs.length}</p>
                <p className="text-xs text-neutral-400 mt-1">Pickup Hubs</p>
              </div>
              <div>
                <p className="text-2xl sm:text-3xl font-bold font-mono text-amber-400">Hourly</p>
                <p className="text-xs text-neutral-400 mt-1">Rates Shown per Bike</p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <p className="text-2xl sm:text-3xl font-bold font-mono text-emerald-400">Pay</p>
                <p className="text-xs text-neutral-400 mt-1">At Handover</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it Works (3 Steps) */}
      <section className="py-20 max-w-7xl mx-auto px-4 sm:px-6 w-full">
        <div className="text-center max-w-xl mx-auto mb-14">
          <Badge variant="accent" size="md" className="mb-3">
            Simple 3-Step Process
          </Badge>
          <h2 className="text-2xl sm:text-3xl font-bold font-heading text-neutral-100">
            How Riders Path Works
          </h2>
          <p className="text-xs sm:text-sm text-neutral-400 mt-2">
            Designed around student routines and pickup at campus hubs.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {steps.map((s) => (
            <Card key={s.step} className="relative overflow-hidden flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div className="w-10 h-10 rounded-xl bg-neutral-800 flex items-center justify-center">
                    {s.icon}
                  </div>
                  <span className="text-3xl font-extrabold font-mono text-neutral-800">
                    {s.step}
                  </span>
                </div>
                <h3 className="text-lg font-bold font-heading text-neutral-100 mb-2">
                  {s.title}
                </h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  {s.desc}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Campus Safety Rules */}
      <section className="py-16 bg-neutral-900/40 border-y border-neutral-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-4">
            <div>
              <div className="flex items-center gap-2 text-amber-400 text-xs font-mono mb-2">
                <AlertTriangle className="w-4 h-4" />
                <span>SAFETY FIRST</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold font-heading text-neutral-100">
                Campus Rental Safety & Standards
              </h2>
            </div>
            <p className="text-xs text-neutral-400 max-w-md">
              Peer sharing relies on student trust, mutual accountability, and strict road safety compliance.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {safetyHighlights.map((rule, idx) => (
              <div
                key={idx}
                className="p-5 rounded-2xl bg-neutral-900/60 border border-neutral-800 flex flex-col justify-between"
              >
                <div>
                  <h4 className="text-sm font-bold text-neutral-200 mb-1.5 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{rule.title}</span>
                  </h4>
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    {rule.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQs */}
      <section className="py-20 max-w-4xl mx-auto px-4 sm:px-6 w-full">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold font-heading text-neutral-100">
            Frequently Asked Questions
          </h2>
          <p className="text-xs sm:text-sm text-neutral-400 mt-2">
            Everything you need to know about campus rentals and verifications.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {faqs.map((f, i) => (
            <Card key={i} className="p-5">
              <h3 className="text-sm font-bold text-neutral-100 mb-2 flex items-start gap-2.5">
                <HelpCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>{f.q}</span>
              </h3>
              <p className="text-xs text-neutral-400 pl-6 leading-relaxed">
                {f.a}
              </p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
};
