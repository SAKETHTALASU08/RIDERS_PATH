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
      desc: 'Confirm your email, complete your profile, and submit the requested documents for human review.',
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
      a: `Any active student of ${PLATFORM_CONFIG.campusName} with a verified email address, a complete profile, and a valid two-wheeler driving licence.`,
    },
    {
      q: 'What are the security deposit options?',
      a: 'Available deposit options and amounts are shown in the booking flow. Refund and return terms are pending legal review.',
    },
    {
      q: 'Which documents should I submit?',
      a: 'The booking flow lists the required documents and explains their purpose before upload. A campus team member reviews submitted documents.',
    },
  ];

  return (
    <div className="flex flex-col w-full">
      {/* Hero Section */}
      <section className="relative isolate overflow-hidden border-b border-neutral-900/80 bg-neutral-950 py-24 sm:py-32">
        {/* Deep black background with subtle orange neon accents */}
        <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
          <div className="absolute left-1/2 top-[-10rem] h-[34rem] w-[56rem] -translate-x-1/2 rounded-full bg-gradient-to-b from-orange-500/15 via-amber-500/10 to-transparent blur-[120px]" />
          <div className="absolute right-1/4 top-1/3 h-72 w-72 rounded-full bg-orange-600/10 blur-[100px]" />
          <div className="absolute left-1/4 bottom-10 h-64 w-64 rounded-full bg-amber-500/5 blur-[90px]" />
          {/* Subtle grid pattern overlay */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
        </div>

        <div className="max-w-7xl mx-auto px-5 sm:px-8 relative z-10">
          <div className="flex flex-col items-center justify-center text-center max-w-4xl mx-auto">
            {/* Campus Trust Pill with subtle orange glow */}
            <div className="inline-flex items-center gap-2.5 rounded-full border border-orange-500/30 bg-orange-500/[0.08] px-4 py-1.5 text-xs font-medium text-orange-200 shadow-[0_0_20px_rgba(249,115,22,0.15)] backdrop-blur-md mb-8">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500 shadow-[0_0_8px_#f97316]" />
              </span>
              <span className="tracking-wide">Exclusively for {PLATFORM_CONFIG.campusName} Students</span>
            </div>

            {/* Large Bold Headline */}
            <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white leading-[1.08] mb-6 font-sans">
              Peer-to-Peer Bike Rentals Across{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-amber-400 to-orange-500 drop-shadow-[0_0_35px_rgba(249,115,22,0.3)]">
                Campus Hubs
              </span>
            </h1>

            <p className="text-base sm:text-xl text-neutral-400 mb-10 leading-relaxed max-w-2xl font-normal">
              Student-to-student two-wheeler sharing with transparent server-calculated rates and instant pickup across verified campus stations.
            </p>

            {/* Vibrant Orange Primary CTA Button */}
            <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto justify-center mb-16">
              <Link
                to="/browse"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-neutral-950 font-bold px-8 py-4 text-base shadow-[0_0_30px_rgba(249,115,22,0.35)] hover:shadow-[0_0_40px_rgba(249,115,22,0.5)] transition-all duration-300 hover:-translate-y-0.5 active:translate-y-0"
              >
                <span>Browse Campus Fleet</span>
                <ArrowRight className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
              </Link>
              <Link
                to="/how-it-works"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-neutral-800 bg-neutral-900/60 hover:bg-neutral-800/80 text-neutral-300 hover:text-white font-medium px-7 py-4 text-base backdrop-blur-md transition-all duration-200"
              >
                How It Works
              </Link>
            </div>

            {/* Three Minimalist Feature Cards with Thin Borders */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full text-left mt-4">
              <div className="group relative rounded-2xl border border-neutral-800/90 bg-neutral-900/40 p-6 backdrop-blur-md hover:border-orange-500/40 transition-all duration-300 hover:bg-neutral-900/60 shadow-lg">
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 mb-4 group-hover:scale-105 transition-transform">
                  <MapPin className="w-5 h-5 stroke-[2]" />
                </div>
                <h3 className="text-base font-bold text-white mb-1.5 flex items-center justify-between">
                  <span>Designated Hubs</span>
                  <span className="text-xs font-mono font-semibold text-orange-400/80 bg-orange-500/10 px-2 py-0.5 rounded-full border border-orange-500/20">
                    {PLATFORM_CONFIG.hubs.length} Hubs
                  </span>
                </h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Convenient, pre-verified physical pickup and return points located right across campus hostels and gates.
                </p>
              </div>

              <div className="group relative rounded-2xl border border-neutral-800/90 bg-neutral-900/40 p-6 backdrop-blur-md hover:border-orange-500/40 transition-all duration-300 hover:bg-neutral-900/60 shadow-lg">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4 group-hover:scale-105 transition-transform">
                  <Clock className="w-5 h-5 stroke-[2]" />
                </div>
                <h3 className="text-base font-bold text-white mb-1.5 flex items-center justify-between">
                  <span>Transparent Pricing</span>
                  <span className="text-xs font-mono font-semibold text-amber-400/80 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                    Per Hour
                  </span>
                </h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Clear student pricing computed down to the minute. No surprise platform fees or hidden booking surcharges.
                </p>
              </div>

              <div className="group relative rounded-2xl border border-neutral-800/90 bg-neutral-900/40 p-6 backdrop-blur-md hover:border-orange-500/40 transition-all duration-300 hover:bg-neutral-900/60 shadow-lg">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 group-hover:scale-105 transition-transform">
                  <ShieldCheck className="w-5 h-5 stroke-[2]" />
                </div>
                <h3 className="text-base font-bold text-white mb-1.5 flex items-center justify-between">
                  <span>Verified Community</span>
                  <span className="text-xs font-mono font-semibold text-emerald-400/80 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    100% Student
                  </span>
                </h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  Only verified enrolled students with validated driving licenses can list, book, or hand over two-wheelers.
                </p>
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
