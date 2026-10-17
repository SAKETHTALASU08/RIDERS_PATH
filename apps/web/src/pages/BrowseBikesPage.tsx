import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Fuel, Heart, MapPin, Scale, Search, SlidersHorizontal, X, Zap } from 'lucide-react';
import { PublicBikeDto, PublicConfig } from '@riders-path/shared';
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
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../context/AuthContext';

type SortBy = 'newest' | 'price_asc' | 'price_desc' | 'hub';
const readIds = (key: string) => {
  try { return JSON.parse(localStorage.getItem(key) || '[]') as string[]; } catch { return []; }
};

export const BrowseBikesPage: React.FC = () => {
  const { error: showToastError, success: showToastSuccess } = useToast();
  const { user, isLoading: isAuthLoading } = useAuth();
  const [urlParams, setUrlParams] = useSearchParams();
  const [bikes, setBikes] = useState<PublicBikeDto[]>([]);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(() => urlParams.get('q') || '');
  const [debouncedQuery, setDebouncedQuery] = useState(() => urlParams.get('q') || '');
  const [selectedType, setSelectedType] = useState(() => urlParams.get('type') || 'all');
  const [selectedFuel, setSelectedFuel] = useState(() => urlParams.get('fuel') || 'all');
  const [selectedTransmission, setSelectedTransmission] = useState(() => urlParams.get('transmission') || 'all');
  const [selectedHub, setSelectedHub] = useState(() => urlParams.get('hub') || 'all');
  const [sortBy, setSortBy] = useState<SortBy>(() => (urlParams.get('sort') as SortBy) || 'newest');
  const [maxPrice, setMaxPrice] = useState(() => urlParams.get('maxPrice') || '');
  const [filterStart, setFilterStart] = useState(() => urlParams.get('pickup') || '');
  const [filterEnd, setFilterEnd] = useState(() => urlParams.get('return') || '');
  const [availabilityFilterMessage, setAvailabilityFilterMessage] = useState('');
  const [verifiedAvailabilityWindow, setVerifiedAvailabilityWindow] = useState<string | null>(null);
  const [showFavorites, setShowFavorites] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(() => readIds('rp_favorites_v1'));
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [recentIds, setRecentIds] = useState<string[]>(() => readIds('rp_recent_bikes_v1'));
  const [quickView, setQuickView] = useState<PublicBikeDto | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(6);
  const requestId = useRef(0);
  const lastUrl = useRef(urlParams.toString());

  const filterDateError = filterStart && filterEnd && new Date(filterEnd) <= new Date(filterStart)
    ? 'Return time must be later than pickup time.' : '';
  const activeFilterCount = [searchQuery, selectedType !== 'all', selectedFuel !== 'all', selectedTransmission !== 'all', selectedHub !== 'all', maxPrice, filterStart || filterEnd].filter(Boolean).length;
  const filteredBikes = useMemo(() => bikes.filter((bike) => !showFavorites || favorites.includes(bike.id)), [bikes, favorites, showFavorites]);
  const visibleBikes = filteredBikes.slice(0, visibleCount);
  const comparedBikes = bikes.filter((bike) => compareIds.includes(bike.id));
  const availabilityWindowKey = `${filterStart}|${filterEnd}`;
  const hasDateAvailability = Boolean(verifiedAvailabilityWindow === availabilityWindowKey && !isLoading && !error);

  useEffect(() => {
    const current = urlParams.toString();
    if (current === lastUrl.current) return;
    lastUrl.current = current;
    setSearchQuery(urlParams.get('q') || '');
    setSelectedType(urlParams.get('type') || 'all');
    setSelectedFuel(urlParams.get('fuel') || 'all');
    setSelectedTransmission(urlParams.get('transmission') || 'all');
    setSelectedHub(urlParams.get('hub') || 'all');
    setSortBy((urlParams.get('sort') as SortBy) || 'newest');
    setMaxPrice(urlParams.get('maxPrice') || '');
    setFilterStart(urlParams.get('pickup') || '');
    setFilterEnd(urlParams.get('return') || '');
  }, [urlParams]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(searchQuery.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (searchQuery) next.set('q', searchQuery);
    if (selectedType !== 'all') next.set('type', selectedType);
    if (selectedFuel !== 'all') next.set('fuel', selectedFuel);
    if (selectedTransmission !== 'all') next.set('transmission', selectedTransmission);
    if (selectedHub !== 'all') next.set('hub', selectedHub);
    if (sortBy !== 'newest') next.set('sort', sortBy);
    if (maxPrice) next.set('maxPrice', maxPrice);
    if (filterStart) next.set('pickup', filterStart);
    if (filterEnd) next.set('return', filterEnd);
    const serialized = next.toString();
    if (serialized !== lastUrl.current) {
      lastUrl.current = serialized;
      setUrlParams(next, { replace: true });
    }
  }, [filterEnd, filterStart, maxPrice, searchQuery, selectedFuel, selectedHub, selectedTransmission, selectedType, setUrlParams, sortBy]);

  useEffect(() => {
    apiClient.getConfig().then(setConfig).catch(() => setConfig(null));
  }, []);

  useEffect(() => {
    if (isAuthLoading) return;
    let active = true;
    if (!user) {
      setFavorites(readIds('rp_favorites_v1'));
      return () => { active = false; };
    }
    apiClient.getFavoriteBikeIds().then((ids) => {
      if (active) setFavorites(ids);
    }).catch(() => {
      if (active) {
        setFavorites(readIds('rp_favorites_v1'));
        showToastError('Saved bikes could not sync', 'Your local saved list is still available on this device.');
      }
    });
    return () => { active = false; };
  }, [isAuthLoading, showToastError, user?.id]);

  useEffect(() => {
    const saved = sessionStorage.getItem('rp_browse_scroll_y');
    if (saved) requestAnimationFrame(() => window.scrollTo(0, Number(saved)));
    return () => sessionStorage.setItem('rp_browse_scroll_y', String(window.scrollY));
  }, []);

  const fetchBikes = useCallback(async () => {
    const thisRequest = ++requestId.current;
    setIsLoading(true); setError(null); setAvailabilityFilterMessage(''); setVerifiedAvailabilityWindow(null);
    if (filterDateError) { setBikes([]); setIsLoading(false); return; }
    try {
      let data = await apiClient.getBikes({ query: debouncedQuery, bikeType: selectedType, fuelType: selectedFuel, transmission: selectedTransmission, hubId: selectedHub, sortBy, maxHourlyRate: maxPrice ? Number(maxPrice) : undefined });
      let statusMessage = '';
      if (filterStart && filterEnd) {
        const checks = await Promise.all(data.map((bike) => apiClient.checkAvailability(bike.id, filterStart, filterEnd)));
        data = data.filter((_bike, index) => checks[index].available);
        statusMessage = `Availability checked for ${data.length} bike${data.length === 1 ? '' : 's'} in these dates.`;
      } else if (filterStart || filterEnd) statusMessage = 'Choose both pickup and return times to check availability.';
      if (thisRequest !== requestId.current) return;
      setAvailabilityFilterMessage(statusMessage);
      if (filterStart && filterEnd) setVerifiedAvailabilityWindow(availabilityWindowKey);
      setBikes(data);
    } catch (cause: any) {
      if (thisRequest === requestId.current) setError(cause.message || 'Unable to load the bike catalog. Please try again.');
    } finally { if (thisRequest === requestId.current) setIsLoading(false); }
  }, [debouncedQuery, filterDateError, filterEnd, filterStart, maxPrice, selectedFuel, selectedHub, selectedTransmission, selectedType, sortBy]);

  useEffect(() => { void fetchBikes(); }, [fetchBikes]);
  useEffect(() => { setVisibleCount(6); }, [debouncedQuery, selectedType, selectedFuel, selectedTransmission, selectedHub, sortBy, maxPrice, filterStart, filterEnd, showFavorites]);

  const resetFilters = () => {
    setSearchQuery(''); setSelectedType('all'); setSelectedFuel('all'); setSelectedTransmission('all'); setSelectedHub('all');
    setSortBy('newest'); setMaxPrice(''); setFilterStart(''); setFilterEnd(''); setShowFavorites(false);
  };
  const toggleFavorite = (bikeId: string) => {
    const wasSaved = favorites.includes(bikeId);
    const next = wasSaved ? favorites.filter((id) => id !== bikeId) : [...favorites, bikeId];
    setFavorites(next);
    if (user) {
      void apiClient.setFavoriteBike(bikeId, !wasSaved).catch(() => {
        setFavorites((latest) => wasSaved ? [...new Set([...latest, bikeId])] : latest.filter((id) => id !== bikeId));
        showToastError('Could not update saved bike', 'Please try again.');
      });
    } else {
      localStorage.setItem('rp_favorites_v1', JSON.stringify(next));
    }
    showToastSuccess(wasSaved ? 'Bike removed' : 'Bike saved', wasSaved ? 'It has been removed from your saved bikes.' : 'You can find it in your saved bikes.');
  };
  const toggleCompare = (bikeId: string) => setCompareIds((current) => {
    if (current.includes(bikeId)) return current.filter((id) => id !== bikeId);
    if (current.length >= 3) return current;
    return [...current, bikeId];
  });
  const markRecentlyViewed = (bike: PublicBikeDto) => {
    setRecentIds((current) => {
      const next = [bike.id, ...current.filter((id) => id !== bike.id)].slice(0, 4);
      sessionStorage.setItem('rp_recent_bikes_v1', JSON.stringify(next)); return next;
    });
  };

  const filterPanel = (prefix: string) => <div className="space-y-4 rounded-2xl border border-slate-800 bg-[#1E293B]/75 backdrop-blur-md p-4 shadow-lg">
    <div className="flex items-center justify-between"><h2 className="font-bold text-[#F8FAFC]">Filters</h2><button type="button" onClick={resetFilters} className="min-h-11 px-2 text-xs text-orange-400 hover:text-orange-300 underline">Clear all</button></div>
    <Input id={`${prefix}-bike-search`} label="Search bikes" placeholder="Brand or model" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} leftIcon={<Search className="w-4 h-4"/>} list={`${prefix}-bike-suggestions`}/>
    <datalist id={`${prefix}-bike-suggestions`}>{bikes.slice(0, 10).map((bike) => <option key={bike.id} value={`${bike.brand} ${bike.model}`}/>)}</datalist>
    <Select id={`${prefix}-type`} label="Bike type" value={selectedType} onChange={(event) => setSelectedType(event.target.value)} options={[{value:'all',label:'All types'},{value:'scooter',label:'Scooter'},{value:'commuter',label:'Commuter'},{value:'sports',label:'Sports'},{value:'cruiser',label:'Cruiser'},{value:'electric',label:'Electric'}]}/>
    <Select id={`${prefix}-fuel`} label="Fuel" value={selectedFuel} onChange={(event) => setSelectedFuel(event.target.value)} options={[{value:'all',label:'Any fuel'},{value:'petrol',label:'Petrol'},{value:'electric',label:'Electric'}]}/>
    <Select id={`${prefix}-transmission`} label="Transmission" value={selectedTransmission} onChange={(event) => setSelectedTransmission(event.target.value)} options={[{value:'all',label:'Any transmission'},{value:'automatic',label:'Automatic'},{value:'manual',label:'Manual'}]}/>
    <Select id={`${prefix}-hub`} label="Pickup hub" value={selectedHub} onChange={(event) => setSelectedHub(event.target.value)} options={[{value:'all',label:'All hubs'},...(config?.hubs || []).map((hub) => ({value:hub.id,label:hub.name}))]}/>
    <fieldset><legend className="mb-2 text-xs font-semibold text-slate-300">Maximum hourly price {maxPrice ? `· ₹${maxPrice}` : '· Any'}</legend><input aria-label="Maximum hourly price" type="range" min="30" max="200" step="5" value={maxPrice || '200'} onChange={(event) => setMaxPrice(event.target.value === '200' ? '' : event.target.value)} className="w-full accent-orange-500"/><div className="flex flex-wrap gap-1.5">{['','50','75','100','150'].map((amount) => <button type="button" key={amount || 'any'} aria-pressed={maxPrice === amount} onClick={() => setMaxPrice(amount)} className={`min-h-9 rounded-full border px-2.5 text-xs ${maxPrice === amount ? 'border-orange-500 text-orange-400 bg-orange-500/10' : 'border-slate-700 text-slate-300 hover:border-slate-600'}`}>{amount ? `≤ ₹${amount}` : 'Any'}</button>)}</div></fieldset>
    <Select id={`${prefix}-sort`} label="Sort by" value={sortBy} onChange={(event) => setSortBy(event.target.value as SortBy)} options={[{value:'newest',label:'Newest listings'},{value:'price_asc',label:'Price: low to high'},{value:'price_desc',label:'Price: high to low'},{value:'hub',label:'Pickup hub'}]}/>
    <DateTimePicker id={`${prefix}-pickup`} label="Pickup date and time" value={filterStart} onChange={setFilterStart} min={new Date().toISOString()} error={filterDateError || undefined}/>
    <DateTimePicker id={`${prefix}-return`} label="Return date and time" value={filterEnd} onChange={setFilterEnd} min={filterStart || new Date().toISOString()} error={filterDateError || undefined}/>
    {availabilityFilterMessage && <p role="status" aria-live="polite" className="text-xs text-slate-300">{availabilityFilterMessage}</p>}
    <button type="button" aria-pressed={showFavorites} onClick={() => setShowFavorites((shown) => !shown)} className="flex min-h-11 w-full items-center gap-2 rounded-xl border border-slate-700 bg-[#1E293B] px-3 text-sm text-slate-200 hover:border-slate-600"><Heart size={16} className={showFavorites ? 'fill-rose-400 text-rose-400' : ''}/>Show saved bikes</button>
  </div>;

  const activeChips = [
    searchQuery && { label: `Search: ${searchQuery}`, clear: () => setSearchQuery('') },
    selectedType !== 'all' && { label: selectedType, clear: () => setSelectedType('all') },
    selectedFuel !== 'all' && { label: selectedFuel, clear: () => setSelectedFuel('all') },
    selectedTransmission !== 'all' && { label: selectedTransmission, clear: () => setSelectedTransmission('all') },
    selectedHub !== 'all' && { label: config?.hubs.find((hub) => hub.id === selectedHub)?.name || selectedHub, clear: () => setSelectedHub('all') },
    maxPrice && { label: `≤ ₹${maxPrice}/hr`, clear: () => setMaxPrice('') },
    filterStart && { label: 'Pickup date set', clear: () => setFilterStart('') },
    filterEnd && { label: 'Return date set', clear: () => setFilterEnd('') },
  ].filter(Boolean) as Array<{ label: string; clear: () => void }>;

  return <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 w-full">
    <header className="mb-6"><div className="flex items-center gap-2 text-xs font-mono text-orange-400 mb-2"><MapPin size={14}/><span>CAMPUS FLEET</span></div><h1 className="text-3xl font-bold text-[#F8FAFC]">Find a bike</h1><p className="mt-1 text-sm text-[#E2E8F0]/80">Compare public listing details, pickup hubs, and server-checked availability.</p></header>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3 lg:hidden"><Button variant="outline" onClick={() => setMobileFiltersOpen(true)}><SlidersHorizontal size={16}/>Filters{activeFilterCount ? ` · ${activeFilterCount}` : ''}</Button><Button variant="outline" disabled={compareIds.length < 2} onClick={() => setCompareOpen(true)}><Scale size={16}/>Compare {compareIds.length}/3</Button></div>
    <div className="grid items-start gap-6 lg:grid-cols-[290px_minmax(0,1fr)]">
      <aside className="sticky top-24 hidden lg:block" aria-label="Bike filters">{filterPanel('desktop')}</aside>
      <section className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-200" aria-live="polite">{isLoading ? 'Loading listings…' : `${filteredBikes.length} bike${filteredBikes.length === 1 ? '' : 's'} found`}</p><div className="hidden lg:flex gap-2"><Button variant="outline" onClick={() => setMobileFiltersOpen(true)}><SlidersHorizontal size={16}/>Filters{activeFilterCount ? ` · ${activeFilterCount}` : ''}</Button><Button variant="outline" disabled={compareIds.length < 2} onClick={() => setCompareOpen(true)}><Scale size={16}/>Compare {compareIds.length}/3</Button></div></div>
        {activeChips.length > 0 && <div className="mb-4 flex flex-wrap gap-2" aria-label="Active filters">{activeChips.map((chip) => <button key={chip.label} type="button" onClick={chip.clear} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-slate-700 bg-[#1E293B] px-3 text-xs text-slate-200 hover:border-slate-500">{chip.label}<X size={13} aria-hidden="true"/></button>)}<button type="button" onClick={resetFilters} className="min-h-9 px-2 text-xs text-orange-400 hover:text-orange-300 underline">Clear filters</button></div>}
        {isLoading && <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">{Array.from({length:6},(_,index)=><Card key={index} className="space-y-4 p-4"><Skeleton height={190} rounded="xl"/><Skeleton height={22} width="70%"/><Skeleton height={16} width="45%"/><Skeleton height={44} rounded="xl"/></Card>)}</div>}
        {!isLoading && error && <ErrorState message={error} onRetry={fetchBikes} className="my-8"/>}
        {!isLoading && !error && filteredBikes.length === 0 && <EmptyState title={showFavorites && favorites.length === 0 ? 'No saved bikes yet' : 'No bikes match these filters'} description="Adjust a filter, try a different search, or clear the filters to see all current listings." actionLabel="Clear filters" onAction={resetFilters} className="my-8"/>}
        {!isLoading && !error && filteredBikes.length > 0 && <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">{visibleBikes.map((bike) => <Card key={bike.id} className="group flex flex-col overflow-hidden p-0 border-slate-800 bg-[#1E293B]/75 hover:border-slate-700 transition-colors">
          <div className="relative h-48 w-full overflow-hidden bg-slate-900"><img src={bike.images[0]} alt={`${bike.brand} ${bike.model}`} width="800" height="450" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"/><div className="absolute left-3 top-3 flex flex-wrap gap-2"><Badge variant="accent">{bike.bikeType}</Badge>{bike.fuelType === 'electric' && <Badge variant="info"><Zap size={12}/>Electric</Badge>}{hasDateAvailability && <Badge variant="success">Available for your dates</Badge>}</div><button type="button" aria-label={`${favorites.includes(bike.id) ? 'Remove' : 'Save'} ${bike.brand} ${bike.model}`} aria-pressed={favorites.includes(bike.id)} onClick={() => toggleFavorite(bike.id)} className="absolute right-3 top-3 flex min-h-11 min-w-11 items-center justify-center rounded-full bg-slate-950/80 backdrop-blur-sm text-slate-100 hover:text-white focus-visible:ring-2 focus-visible:ring-orange-500"><Heart size={18} className={favorites.includes(bike.id) ? 'fill-rose-400 text-rose-400' : ''}/></button><div className="absolute bottom-2 left-3 rounded-lg bg-slate-950/80 backdrop-blur-sm px-2.5 py-1 text-xs text-white border border-slate-800"><MapPin size={13} className="mr-1 inline text-orange-400"/>{bike.hubName}</div></div>
          <div className="flex flex-1 flex-col p-4"><h2 className="text-lg font-bold text-[#F8FAFC]">{bike.brand} {bike.model}</h2><p className="mt-1 text-sm text-[#E2E8F0]/80">{bike.year} · {bike.transmission} · {bike.fuelType}</p><div className="mt-3 flex flex-wrap gap-2">{bike.features.slice(0,2).map((feature) => <span key={feature} className="rounded-md bg-slate-800/80 border border-slate-700 px-2 py-1 text-xs text-slate-300">{feature}</span>)}</div><div className="mt-auto flex items-end justify-between gap-3 border-t border-slate-800 pt-4 mt-4"><div><p className="text-xl font-bold text-[#F8FAFC]">₹{bike.hourlyRateInr}<span className="ml-1 text-xs font-normal text-slate-400">/hour</span></p><p className="text-xs text-slate-400">₹{bike.dailyRateInr}/day cap</p></div><div className="flex flex-col items-end gap-2"><label className="flex min-h-9 items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={compareIds.includes(bike.id)} disabled={!compareIds.includes(bike.id) && compareIds.length >= 3} onChange={() => toggleCompare(bike.id)}/>Compare</label><Button size="sm" variant="outline" onClick={() => setQuickView(bike)}>Quick view</Button></div></div><Link to={`/bikes/${bike.id}`} onClick={() => markRecentlyViewed(bike)} className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#F97316] hover:bg-[#ea580c] px-5 py-2.5 font-bold text-slate-950 shadow-md shadow-orange-500/20 transition-all duration-150">Details and booking <ArrowRight size={15}/></Link></div>
        </Card>)}</div>}
        {!isLoading && !error && visibleCount < filteredBikes.length && <div className="mt-6 text-center"><Button variant="outline" onClick={() => setVisibleCount((count) => count + 6)}>Load 6 more bikes</Button></div>}
        {recentIds.length > 0 && <div className="mt-10 border-t border-neutral-800 pt-5"><h2 className="mb-3 text-sm font-semibold">Recently viewed</h2><div className="flex flex-wrap gap-2">{recentIds.map((recentId) => { const item = bikes.find((bike) => bike.id === recentId); return item ? <Link key={item.id} to={`/bikes/${item.id}`} className="min-h-10 rounded-full border border-neutral-700 px-3 py-2 text-xs text-neutral-200">{item.brand} {item.model}</Link> : null; })}</div></div>}
      </section>
    </div>

    <Modal isOpen={mobileFiltersOpen} onClose={() => setMobileFiltersOpen(false)} title="Filter bikes" description="Choose a few details to narrow the campus listings." maxWidth="md"><div className="max-h-[70vh] overflow-y-auto">{filterPanel('mobile')}<Button className="mt-4 w-full" onClick={() => setMobileFiltersOpen(false)}>Show {filteredBikes.length} bikes</Button></div></Modal>
    <Modal isOpen={Boolean(quickView)} onClose={() => setQuickView(null)} title={quickView ? `${quickView.brand} ${quickView.model}` : 'Bike preview'} maxWidth="lg">{quickView && <div className="space-y-4"><img src={quickView.images[0]} alt={`${quickView.brand} ${quickView.model}`} width="900" height="520" loading="lazy" className="max-h-72 w-full rounded-xl object-cover"/><p className="text-sm text-neutral-300">{quickView.year} · {quickView.bikeType} · {quickView.fuelType} · {quickView.transmission}</p><p className="text-sm"><MapPin size={15} className="mr-1 inline"/>{quickView.hubName}</p><p className="text-lg font-bold">₹{quickView.hourlyRateInr}/hour · ₹{quickView.dailyRateInr}/day cap</p><ul className="list-disc pl-5 text-sm text-neutral-300">{quickView.features.slice(0,4).map((feature) => <li key={feature}>{feature}</li>)}</ul><Link onClick={() => markRecentlyViewed(quickView)} to={`/bikes/${quickView.id}`} className="inline-flex min-h-11 items-center rounded-lg bg-amber-400 px-4 font-semibold text-slate-950">View bike details</Link></div>}</Modal>
    <Modal isOpen={compareOpen} onClose={() => setCompareOpen(false)} title="Compare bikes" description="Public listing details for your selected bikes." maxWidth="2xl"><div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr><th className="p-2">Details</th>{comparedBikes.map((bike) => <th key={bike.id} className="p-2">{bike.brand} {bike.model}</th>)}</tr></thead><tbody>{[['Price / hour',(bike:PublicBikeDto)=>`₹${bike.hourlyRateInr}`],['Price / day',(bike:PublicBikeDto)=>`₹${bike.dailyRateInr}`],['Type',(bike:PublicBikeDto)=>bike.bikeType],['Fuel',(bike:PublicBikeDto)=>bike.fuelType],['Transmission',(bike:PublicBikeDto)=>bike.transmission],['Pickup hub',(bike:PublicBikeDto)=>bike.hubName]].map(([label,value])=><tr key={String(label)} className="border-t border-neutral-800"><th className="p-2 font-medium text-neutral-300">{String(label)}</th>{comparedBikes.map((bike)=><td key={bike.id} className="p-2">{(value as (item:PublicBikeDto)=>string)(bike)}</td>)}</tr>)}</tbody></table></div></Modal>
  </div>;
};
