import { describe, it, expect } from 'vitest';
import { resolveCardGeo, cardViewNeedsSign } from '@/lib/credit-card';

function headersWith(country?: string, region?: string): Headers {
  const h = new Headers();
  if (country) h.set('x-vercel-ip-country', country);
  if (region) h.set('x-vercel-ip-country-region', region);
  return h;
}

describe('resolveCardGeo', () => {
  it('resolves California (US-CA) as in California and North America', () => {
    const geo = resolveCardGeo(headersWith('US', 'CA'));
    expect(geo.country).toBe('US');
    expect(geo.region).toBe('CA');
    expect(geo.regionKey).toBe('US-CA');
    expect(geo.inCalifornia).toBe(true);
    expect(geo.inNorthAmerica).toBe(true);
  });

  it('treats other North American countries as in NA but not California', () => {
    const canada = resolveCardGeo(headersWith('CA', 'ON'));
    expect(canada.inNorthAmerica).toBe(true);
    expect(canada.inCalifornia).toBe(false);
    expect(canada.regionKey).toBe('CA-ON');

    const mexico = resolveCardGeo(headersWith('MX', 'CMX'));
    expect(mexico.inNorthAmerica).toBe(true);
    expect(mexico.inCalifornia).toBe(false);
  });

  it('uppercases lowercase header values', () => {
    const geo = resolveCardGeo(headersWith('us', 'ca'));
    expect(geo.country).toBe('US');
    expect(geo.inCalifornia).toBe(true);
  });

  it('flags non-North-America countries as outside NA', () => {
    const uk = resolveCardGeo(headersWith('GB', 'ENG'));
    expect(uk.inNorthAmerica).toBe(false);
    expect(uk.inCalifornia).toBe(false);
  });

  it('treats an unknown country as NOT North America (safe default)', () => {
    const geo = resolveCardGeo(new Headers());
    expect(geo.country).toBeNull();
    expect(geo.inNorthAmerica).toBe(false);
    expect(geo.inCalifornia).toBe(false);
  });
});

describe('cardViewNeedsSign', () => {
  const region = 'US-CA';
  // A timestamp known to be August 2025 in Pacific time.
  const augustPacific = '2025-08-15T20:00:00.000Z';
  const septemberPacific = '2025-09-15T20:00:00.000Z';

  it('requires signing when there is no prior state', () => {
    expect(cardViewNeedsSign(null, region, septemberPacific)).toBe(true);
  });

  it('requires signing when never signed before', () => {
    expect(cardViewNeedsSign({ last_signed_at: null, last_region: region }, region, septemberPacific)).toBe(
      true
    );
  });

  it('does NOT require signing within the same Pacific month and region', () => {
    expect(
      cardViewNeedsSign({ last_signed_at: augustPacific, last_region: region }, region, augustPacific)
    ).toBe(false);
  });

  it('requires signing when the Pacific month rolls over', () => {
    expect(
      cardViewNeedsSign({ last_signed_at: augustPacific, last_region: region }, region, septemberPacific)
    ).toBe(true);
  });

  it('requires signing when the region changed since last view', () => {
    expect(
      cardViewNeedsSign({ last_signed_at: augustPacific, last_region: 'US-NY' }, region, augustPacific)
    ).toBe(true);
  });
});
