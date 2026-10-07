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
import { PLATFORM_CONFIG } from '../config/platform.config';
import { useAuth } from '../context/AuthContext';

export const LandingPage: React.FC = () => {
  const { user, openAuthModal } = useAuth();

  const steps = [
    {
      step: '01',
      title: 'Browse & Reserve',
      desc: 'Pick a bike or scooter from verified campus hubs. Check real-time availability and select your rental window.',
      icon: <Search className="w-5 h-5 text-amber-400" />,
    },
    {
      step: '02',
      title: 'Digital Clearance',
      desc: 'Sign in with your campus email and upload your Driving Licence & Student ID. Transparent server-computed pricing.',
      icon: <ShieldCheck className="w-5 h-5 text-amber-400" />,
    },
    {
      step: '03',
      title: 'Campus Hub Handover',
      desc: 'Meet the coordinator at your campus hub, complete the physical inspection, present deposit, and ride safely.',
      icon: <Key className="w-5 h-5 text-amber-400" />,
    },
  ];

  const safetyHighlights = [
    {
      title: 'Mandatory ISI Helmets',
      desc: 'Every booking includes an inspected ISI-certified helmet. Riding without one is strictly forbidden on campus.',
    },
    {
      title: 'Campus Speed Cap (25 km/h)',
      desc: 'Vehicles must strictly adhere to campus speed limits to ensure pedestrian safety across university walkways.',
    },
    {
      title: 'Physical Handover Inspection',
      desc: 'Tire condition, brakes, fuel level, and odometer are recorded together by the student coordinator at pickup and return.',
    },
    {
      title: 'Pay at Handover',
      desc: 'No hidden gateway fees or card holds. Pay the exact server-calculated rental and deposit directly at key handover.',
    },
  ];

  const faqs = [
    {
      q: 'Who can rent bikes on Riders Path?',
      a: `Any active student of ${PLATFORM_CONFIG.campusName} with an approved campus email and a valid Indian Driving Licence (Two-Wheeler).`,
    },
    {
      q: 'What are the security deposit options?',
      a: 'Students can either deposit their working laptop with the campus hub coordinator or provide a refundable security deposit of ₹1,500 during the rental period. Both are returned immediately upon vehicle return inspection.',
    },
    {
      q: 'Why is Aadhaar NOT collected?',
      a: 'To safeguard student data privacy and comply with Indian regulatory guidelines, Riders Path never collects, stores, or processes Aadhaar documents. Verification relies solely on your physical university student ID card and official Driving Licence.',
    },
    {
      q: 'Can I list my own two-wheeler to earn?',
      a: 'Yes! Students with personal two-wheelers can list them. You retain 92% of your rental earnings while vehicles undergo coordinator inspection before going live.',
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
              Reliable, student-to-student two-wheeler sharing with transparent pricing, campus coordinator check-ins, and zero middlemen.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-3.5 w-full sm:w-auto">
              <Link to="/browse" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="primary"
                  className="w-full sm:w-auto text-base"
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                >
                  Browse Campus Fleet
                </Button>
              </Link>

              <Link to="/owner" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full sm:w-auto text-base"
                >
                  List Your Bike (Earn 92%)
                </Button>
              </Link>
            </div>

            {/* Quick Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 sm:gap-12 mt-14 pt-8 border-t border-neutral-900 w-full max-w-xl text-center">
              <div>
                <p className="text-2xl sm:text-3xl font-bold font-mono text-amber-400">4</p>
                <p className="text-xs text-neutral-400 mt-1">Campus Hubs</p>
              </div>
              <div>
                <p className="text-2xl sm:text-3xl font-bold font-mono text-amber-400">₹40/hr</p>
                <p className="text-xs text-neutral-400 mt-1">Starting Rate</p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <p className="text-2xl sm:text-3xl font-bold font-mono text-emerald-400">100%</p>
                <p className="text-xs text-neutral-400 mt-1">Campus Coordinators</p>
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
            Built strictly around campus student routines and physical coordinator handovers.
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
