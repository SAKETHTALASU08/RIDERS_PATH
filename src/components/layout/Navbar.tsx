import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bike, User, LogOut, Menu, X, PlusCircle, CalendarCheck, Shield } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { useAuth } from '../../context/AuthContext';

export const Navbar: React.FC = () => {
  const { user, openAuthModal, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  const navLinks = [
    { label: 'Browse Fleet', path: '/browse' },
    { label: 'How It Works', path: '/how-it-works' },
    { label: 'List Your Bike', path: '/owner' },
    { label: 'Campus Safety', path: '/safety' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-neutral-950/85 backdrop-blur-md border-b border-neutral-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand Logo */}
        <Link
          to="/"
          className="flex items-center gap-2.5 text-neutral-100 hover:text-amber-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded-lg p-1"
        >
          <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center text-neutral-950 font-black shadow-md shadow-amber-500/20">
            <Bike className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
          </div>
          <div className="flex flex-col">
            <span className="font-heading font-extrabold text-base tracking-tight leading-none text-neutral-100">
              RIDERS PATH
            </span>
            <span className="text-[10px] font-mono text-neutral-400 tracking-wider">
              ICFAI HYDERABAD
            </span>
          </div>
        </Link>

        {/* Desktop Nav Links */}
        <nav aria-label="Main Navigation" className="hidden md:flex items-center gap-1.5">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                isActive(link.path)
                  ? 'bg-neutral-800 text-amber-400'
                  : 'text-neutral-300 hover:text-neutral-100 hover:bg-neutral-900'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop User Actions */}
        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2.5">
              <Link to="/my-bookings">
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<CalendarCheck className="w-3.5 h-3.5 text-amber-400" />}
                >
                  My Bookings
                </Button>
              </Link>

              <div className="flex items-center gap-2 pl-2 border-l border-neutral-800">
                <div className="w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center text-xs font-bold font-mono text-amber-400">
                  {user.name ? user.name.charAt(0) : 'S'}
                </div>
                <div className="flex flex-col text-left">
                  <span className="text-xs font-semibold text-neutral-200 max-w-[120px] truncate">
                    {user.name || 'Student'}
                  </span>
                  <span className="text-[10px] font-mono text-neutral-400">
                    {user.enrollmentNumber || 'Verified'}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={logout}
                  aria-label="Sign out of account"
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-neutral-400 hover:text-rose-400 hover:bg-neutral-900 rounded-xl cursor-pointer"
                >
                  <LogOut className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={openAuthModal}
              leftIcon={<User className="w-3.5 h-3.5" />}
            >
              Student Sign In
            </Button>
          )}
        </div>

        {/* Mobile menu toggle */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-expanded={mobileMenuOpen}
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          className="md:hidden min-w-[44px] min-h-[44px] flex items-center justify-center text-neutral-300 hover:text-neutral-100 hover:bg-neutral-900 rounded-xl cursor-pointer"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile dropdown drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden px-4 pt-2 pb-6 border-b border-neutral-800 bg-neutral-950 flex flex-col gap-2">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              onClick={() => setMobileMenuOpen(false)}
              className={`min-h-[44px] flex items-center px-4 rounded-xl text-sm font-semibold transition-colors ${
                isActive(link.path)
                  ? 'bg-neutral-800 text-amber-400'
                  : 'text-neutral-300 hover:text-neutral-100 hover:bg-neutral-900'
              }`}
            >
              {link.label}
            </Link>
          ))}

          <div className="pt-3 border-t border-neutral-800 flex flex-col gap-2">
            {user ? (
              <>
                <Link
                  to="/my-bookings"
                  onClick={() => setMobileMenuOpen(false)}
                  className="min-h-[44px] flex items-center justify-between px-4 rounded-xl bg-neutral-900 text-sm font-semibold text-neutral-200"
                >
                  <span className="flex items-center gap-2">
                    <CalendarCheck className="w-4 h-4 text-amber-400" />
                    My Bookings
                  </span>
                  <Badge variant="accent" size="sm">Active</Badge>
                </Link>

                <div className="flex items-center justify-between px-4 py-2 text-xs text-neutral-400">
                  <span>{user.name} ({user.enrollmentNumber})</span>
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      setMobileMenuOpen(false);
                    }}
                    className="min-h-[44px] px-2 flex items-center text-rose-400 hover:text-rose-300 cursor-pointer"
                  >
                    Sign Out
                  </button>
                </div>
              </>
            ) : (
              <Button
                variant="primary"
                onClick={() => {
                  openAuthModal();
                  setMobileMenuOpen(false);
                }}
                leftIcon={<User className="w-4 h-4" />}
                className="w-full"
              >
                Student Sign In
              </Button>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
