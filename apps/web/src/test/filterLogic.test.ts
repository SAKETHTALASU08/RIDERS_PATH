import { describe, it, expect } from 'vitest';
import { mockApi } from '../api/mock';

describe('Fleet Catalog Filtering & Sorting Logic', () => {
  it('filters bikes by search query', async () => {
    const results = await mockApi.getBikes({ query: 'Ather' });
    expect(results.length).toBeGreaterThan(0);
    results.forEach((b) => {
      expect(b.brand.toLowerCase()).toContain('ather');
    });
  });

  it('filters bikes by vehicle category', async () => {
    const scooters = await mockApi.getBikes({ bikeType: 'scooter' });
    expect(scooters.length).toBeGreaterThan(0);
    scooters.forEach((b) => {
      expect(b.bikeType).toBe('scooter');
    });
  });

  it('filters bikes by fuel type (EV vs Petrol)', async () => {
    const evs = await mockApi.getBikes({ fuelType: 'electric' });
    expect(evs.length).toBeGreaterThan(0);
    evs.forEach((b) => {
      expect(b.fuelType).toBe('electric');
    });
  });

  it('filters bikes by campus hub', async () => {
    const gate1Bikes = await mockApi.getBikes({ hubId: 'hub_main_gate' });
    expect(gate1Bikes.length).toBeGreaterThan(0);
    gate1Bikes.forEach((b) => {
      expect(b.hubId).toBe('hub_main_gate');
    });
  });

  it('sorts bikes accurately by price ascending and descending', async () => {
    const priceAsc = await mockApi.getBikes({ sortBy: 'price_asc' });
    for (let i = 0; i < priceAsc.length - 1; i++) {
      expect(priceAsc[i].hourlyRateInr).toBeLessThanOrEqual(priceAsc[i + 1].hourlyRateInr);
    }

    const priceDesc = await mockApi.getBikes({ sortBy: 'price_desc' });
    for (let i = 0; i < priceDesc.length - 1; i++) {
      expect(priceDesc[i].hourlyRateInr).toBeGreaterThanOrEqual(priceDesc[i + 1].hourlyRateInr);
    }
  });
});
