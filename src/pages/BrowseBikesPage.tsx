import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  Filter,
  SlidersHorizontal,
  MapPin,
  Fuel,
  Zap,
  Star,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { PublicBikeDto } from '../shared/contract';
import { apiClient } from '../api/client';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { PLATFORM_CONFIG } from '../config/platform.config';

export const BrowseBikesPage: React.FC = () => {
  const [bikes, setBikes] = useState<PublicBikeDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedFuel, setSelectedFuel] = useState('all');
  const [selectedHub, setSelectedHub] = useState('all');
  const [sortBy, setSortBy] = useState<'popular' | 'price_asc' | 'price_desc' | 'rating'>('popular');
  const [instantOnly, setInstantOnly] = useState(false);
  const [maxPrice, setMaxPrice] = useState<number>(200);

  const fetchBikes = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiClient.getBikes({
        query: searchQuery,
        bikeType: selectedType,
        fuelType: selectedFuel,
        hubId: selectedHub,
        sortBy: sortBy,
        instantOnly: instantOnly,
        maxHourlyRate: maxPrice,
      });
      setBikes(data);
    } catch (err: any) {
      setError(err.message || 'Unable to load campus bike catalog. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, selectedType, selectedFuel, selectedHub, sortBy, instantOnly, maxPrice]);

  useEffect(() => {
    fetchBikes();
  }, [fetchBikes]);

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedType('all');
    setSelectedFuel('all');
    setSelectedHub('all');
    setSortBy('popular');
    setInstantOnly(false);
    setMaxPrice(200);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 w-full">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-amber-400 mb-1.5">
            <MapPin className="w-3.5 h-3.5" />
            <span>CAMPUS FLEET CATALOG</span>
          </div>
          <h1 className="text-3xl font-bold font-heading text-neutral-100">
            Available Two-Wheelers
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Inspected student-owned rides available across {PLATFORM_CONFIG.hubs.length} campus hubs.
          </p>
        </div>

        {/* Instant toggle */}
        <label className="flex items-center gap-2.5 text-xs text-neutral-300 font-medium cursor-pointer select-none bg-neutral-900 border border-neutral-800 px-4 py-2.5 rounded-xl self-start md:self-auto">
          <input
            type="checkbox"
            checked={instantOnly}
            onChange={(e) => setInstantOnly(e.target.checked)}
            className="w-4 h-4 rounded text-amber-500 bg-neutral-800 border-neutral-700 focus:ring-amber-500 cursor-pointer"
          />
          <Zap className="w-4 h-4 text-amber-400" />
          <span>Instant Booking Only</span>
        </label>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 mb-8">
        {/* Search */}
        <div className="lg:col-span-2">
          <Input
            id="bike-search"
            label="Search Model or Brand"
            placeholder="e.g. Ather, Activa, Yamaha..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search className="w-4 h-4" />}
          />
        </div>

        {/* Hub */}
        <Select
          id="filter-hub"
          label="Campus Hub"
          value={selectedHub}
          onChange={(e) => setSelectedHub(e.target.value)}
          options={[
            { value: 'all', label: 'All Campus Hubs' },
            ...PLATFORM_CONFIG.hubs.map((h) => ({ value: h.id, label: h.name })),
          ]}
        />

        {/* Bike Type */}
        <Select
          id="filter-type"
          label="Category"
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          options={[
            { value: 'all', label: 'All Categories' },
            { value: 'scooter', label: 'Scooter' },
            { value: 'commuter', label: 'Commuter' },
            { value: 'sports', label: 'Sports' },
            { value: 'cruiser', label: 'Cruiser' },
            { value: 'electric', label: 'Electric' },
          ]}
        />

        {/* Sort */}
        <Select
          id="filter-sort"
          label="Sort By"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          options={[
            { value: 'popular', label: 'Most Popular' },
            { value: 'price_asc', label: 'Price: Low to High' },
            { value: 'price_desc', label: 'Price: High to Low' },
            { value: 'rating', label: 'Top Rated' },
          ]}
        />
      </div>

      {/* Loading Skeletons */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="flex flex-col gap-4 p-4">
              <Skeleton height={200} rounded="xl" />
              <div className="flex justify-between items-center">
                <Skeleton width="60%" height={24} />
                <Skeleton width="20%" height={20} />
              </div>
              <Skeleton width="40%" height={16} />
              <Skeleton width="100%" height={44} rounded="xl" />
            </Card>
          ))}
        </div>
      )}

      {/* Error State */}
      {!isLoading && error && (
        <ErrorState message={error} onRetry={fetchBikes} className="my-8" />
      )}

      {/* Empty State */}
      {!isLoading && !error && bikes.length === 0 && (
        <EmptyState
          title="No two-wheelers match your filter"
          description="Try broadening your search keywords, switching campus hubs, or resetting applied filters."
          actionLabel="Reset All Filters"
          onAction={resetFilters}
          className="my-8"
        />
      )}

      {/* Bike Cards Grid */}
      {!isLoading && !error && bikes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {bikes.map((bike) => (
            <Card
              key={bike.id}
              className="flex flex-col justify-between overflow-hidden p-0 border-neutral-800 hover:border-neutral-700 transition-all duration-200 group"
            >
              {/* Image & Badges */}
              <div className="relative h-48 sm:h-52 w-full overflow-hidden bg-neutral-900">
                <img
                  src={bike.images[0]}
                  alt={`${bike.brand} ${bike.model}`}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
                  <Badge variant="accent" size="sm">
                    {bike.bikeType.toUpperCase()}
                  </Badge>
                  {bike.fuelType === 'electric' && (
                    <Badge variant="info" size="sm" className="flex items-center gap-1">
                      <Zap className="w-3 h-3" />
                      <span>EV</span>
                    </Badge>
                  )}
                </div>

                <div className="absolute top-3 right-3">
                  <span className="flex items-center gap-1 text-xs font-mono font-bold bg-neutral-950/80 backdrop-blur-md px-2 py-1 rounded-lg text-amber-400 border border-neutral-800">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    <span>{bike.rating.toFixed(1)}</span>
                  </span>
                </div>

                <div className="absolute bottom-2.5 left-3 text-[11px] font-mono text-neutral-300 bg-black/70 backdrop-blur-md px-2.5 py-0.5 rounded-md flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
                  <span className="truncate max-w-[200px]">{bike.hubName}</span>
                </div>
              </div>

              {/* Body */}
              <div className="p-5 flex flex-col flex-1 justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h3 className="text-base font-bold font-heading text-neutral-100 group-hover:text-amber-400 transition-colors">
                      {bike.brand} {bike.model}
                    </h3>
                  </div>

                  <p className="text-xs text-neutral-400 mb-3">
                    Model Year: {bike.year} • {bike.transmission.toUpperCase()}
                  </p>

                  {/* Features */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {bike.features.slice(0, 2).map((feat, idx) => (
                      <span
                        key={idx}
                        className="text-[11px] font-mono text-neutral-300 bg-neutral-800/80 px-2 py-0.5 rounded-md"
                      >
                        ✓ {feat}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Pricing & CTA */}
                <div className="pt-4 border-t border-neutral-800/80 flex items-center justify-between">
                  <div className="flex flex-col">
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-bold font-mono text-neutral-100">
                        ₹{bike.hourlyRateInr}
                      </span>
                      <span className="text-xs text-neutral-400">/hr</span>
                    </div>
                    <span className="text-[11px] font-mono text-neutral-400">
                      ₹{bike.dailyRateInr}/day cap
                    </span>
                  </div>

                  <Link to={`/bikes/${bike.id}`}>
                    <Button size="sm" variant="primary" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                      Details & Rent
                    </Button>
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
