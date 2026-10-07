import React, { useState, useEffect, useCallback, useRef } from 'react';
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
} from 'lucide-react';
import { PublicBikeDto } from '@riders-path/shared';
import { apiClient } from '../api/client';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Skeleton } from '../components/ui/Skeleton';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { DateTimePicker } from '../components/ui/DateTimePicker';
import { PLATFORM_CONFIG } from '@riders-path/shared';

export const BrowseBikesPage: React.FC = () => {
  const [bikes, setBikes] = useState<PublicBikeDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedFuel, setSelectedFuel] = useState('all');
  const [selectedTransmission, setSelectedTransmission] = useState('all');
  const [selectedHub, setSelectedHub] = useState('all');
  const [sortBy, setSortBy] = useState<'popular' | 'price_asc' | 'price_desc' | 'rating'>('popular');
  const [maxPrice, setMaxPrice] = useState('');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [availabilityFilterMessage, setAvailabilityFilterMessage] = useState('');
  const requestId = useRef(0);

  const filterDateError = filterStart && filterEnd && new Date(filterEnd) <= new Date(filterStart)
    ? 'Return time must be later than pickup time.'
    : '';

  const fetchBikes = useCallback(async () => {
    const thisRequest = ++requestId.current;
    setIsLoading(true);
    setError(null);
    setAvailabilityFilterMessage('');
    if (filterDateError) {
      setBikes([]);
      setIsLoading(false);
      return;
    }
    try {
      let data = await apiClient.getBikes({
        query: searchQuery,
        bikeType: selectedType,
        fuelType: selectedFuel,
        transmission: selectedTransmission,
        hubId: selectedHub,
        sortBy,
        maxHourlyRate: maxPrice ? Number(maxPrice) : undefined,
      });
      if (filterStart && filterEnd) {
        const availability = await Promise.all(data.map((bike) =>
          apiClient.checkAvailability(bike.id, filterStart, filterEnd)
        ));
        data = data.filter((_bike, index) => availability[index].available);
        setAvailabilityFilterMessage(`Availability checked for ${data.length} matching vehicle${data.length === 1 ? '' : 's'}.`);
      } else if (filterStart || filterEnd) {
        setAvailabilityFilterMessage('Choose both pickup and return times to filter by availability.');
      }
      if (thisRequest !== requestId.current) return;
      setBikes(data);
    } catch (err: any) {
      if (thisRequest !== requestId.current) return;
      setError(err.message || 'Unable to load campus bike catalog. Please try again.');
    } finally {
      if (thisRequest === requestId.current) setIsLoading(false);
    }
  }, [searchQuery, selectedType, selectedFuel, selectedTransmission, selectedHub, sortBy, maxPrice, filterStart, filterEnd, filterDateError]);

  useEffect(() => {
    fetchBikes();
  }, [fetchBikes]);

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedType('all');
    setSelectedFuel('all');
    setSelectedTransmission('all');
    setSelectedHub('all');
    setSortBy('popular');
    setMaxPrice('');
    setFilterStart('');
    setFilterEnd('');
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
            Student-listed rides available across {PLATFORM_CONFIG.hubs.length} campus hubs.
          </p>
        </div>

      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 mb-3">
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

        <Select
          id="filter-fuel"
          label="Fuel"
          value={selectedFuel}
          onChange={(e) => setSelectedFuel(e.target.value)}
          options={[
            { value: 'all', label: 'All Fuel Types' },
            { value: 'petrol', label: 'Petrol' },
            { value: 'electric', label: 'Electric' },
          ]}
        />

        <Select
          id="filter-transmission"
          label="Transmission"
          value={selectedTransmission}
          onChange={(e) => setSelectedTransmission(e.target.value)}
          options={[
            { value: 'all', label: 'Any Transmission' },
            { value: 'automatic', label: 'Automatic' },
            { value: 'manual', label: 'Manual' },
          ]}
        />

        <Input
          id="filter-max-price"
          label="Max hourly price (₹)"
          type="number"
          min={0}
          inputMode="numeric"
          placeholder="Any price"
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 mb-8">
        <DateTimePicker
          id="browse-start"
          label="Pickup date and time"
          value={filterStart}
          onChange={setFilterStart}
          min={new Date().toISOString()}
          error={filterDateError || undefined}
        />
        <DateTimePicker
          id="browse-end"
          label="Return date and time"
          value={filterEnd}
          onChange={setFilterEnd}
          min={filterStart || new Date().toISOString()}
          error={filterDateError || undefined}
        />
        {availabilityFilterMessage && !filterDateError && (
          <p role="status" aria-live="polite" className="sm:col-span-2 text-xs text-neutral-400">{availabilityFilterMessage}</p>
        )}
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
                  width={800}
                  height={450}
                  loading="lazy"
                  decoding="async"
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

                  <Link
                    to={`/bikes/${bike.id}`}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                  >
                    Details & Rent <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
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
