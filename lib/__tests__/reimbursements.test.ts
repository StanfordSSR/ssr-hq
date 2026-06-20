import { describe, it, expect } from 'vitest';
import {
  normalizeReimbursementNumber,
  isOutsideBayArea,
  extractSubmissionFootprint
} from '@/lib/reimbursements';

describe('normalizeReimbursementNumber', () => {
  it('accepts and canonicalizes valid Granted numbers', () => {
    expect(normalizeReimbursementNumber('R-119704')).toBe('R-119704');
    expect(normalizeReimbursementNumber('r119704')).toBe('R-119704');
    expect(normalizeReimbursementNumber('R 119704')).toBe('R-119704');
    expect(normalizeReimbursementNumber('  r-000123  ')).toBe('R-000123');
  });

  it('rejects values that are not a Granted number', () => {
    expect(normalizeReimbursementNumber('119704')).toBeNull(); // missing the R
    expect(normalizeReimbursementNumber('R-12')).toBeNull(); // too few digits
    expect(normalizeReimbursementNumber('R-119704-extra')).toBeNull(); // trailing junk
    expect(normalizeReimbursementNumber('not a code')).toBeNull();
    expect(normalizeReimbursementNumber('')).toBeNull();
  });
});

describe('isOutsideBayArea', () => {
  it('treats Bay Area coordinates as in-area', () => {
    // Stanford campus
    expect(isOutsideBayArea({ latitude: 37.4275, longitude: -122.17, country: 'US', region: 'CA' })).toBe(false);
    // San Francisco
    expect(isOutsideBayArea({ latitude: 37.7749, longitude: -122.4194, country: 'US', region: 'CA' })).toBe(false);
    // San Jose
    expect(isOutsideBayArea({ latitude: 37.3382, longitude: -121.8863, country: 'US', region: 'CA' })).toBe(false);
  });

  it('flags coordinates outside the Bay Area', () => {
    expect(isOutsideBayArea({ latitude: 40.7128, longitude: -74.006, country: 'US', region: 'NY' })).toBe(true); // NYC
    expect(isOutsideBayArea({ latitude: 34.0522, longitude: -118.2437, country: 'US', region: 'CA' })).toBe(true); // LA
  });

  it('never blocks when location is unknown', () => {
    expect(isOutsideBayArea({ latitude: null, longitude: null, country: null, region: null })).toBe(false);
  });

  it('falls back to country/region when coordinates are absent', () => {
    expect(isOutsideBayArea({ latitude: null, longitude: null, country: 'US', region: 'CA' })).toBe(false);
    expect(isOutsideBayArea({ latitude: null, longitude: null, country: 'US', region: 'NY' })).toBe(true);
    expect(isOutsideBayArea({ latitude: null, longitude: null, country: 'CA', region: null })).toBe(true); // Canada
  });
});

describe('extractSubmissionFootprint', () => {
  it('parses IP, headers, and Bay Area geo from request headers', () => {
    const headers = new Headers({
      'x-forwarded-for': '1.2.3.4, 5.6.7.8',
      'x-real-ip': '9.9.9.9',
      'user-agent': 'Mozilla/5.0',
      'accept-language': 'en-US',
      referer: 'https://hq.stanfordssr.org/submit',
      'x-vercel-ip-country': 'US',
      'x-vercel-ip-country-region': 'CA',
      'x-vercel-ip-city': 'Stanford',
      'x-vercel-ip-latitude': '37.4275',
      'x-vercel-ip-longitude': '-122.17'
    });

    const fp = extractSubmissionFootprint(headers);
    expect(fp.ip).toBe('1.2.3.4'); // first forwarded IP wins
    expect(fp.userAgent).toBe('Mozilla/5.0');
    expect(fp.acceptLanguage).toBe('en-US');
    expect(fp.referer).toBe('https://hq.stanfordssr.org/submit');
    expect(fp.geo.city).toBe('Stanford');
    expect(fp.geo.latitude).toBeCloseTo(37.4275);
    expect(fp.geo.outsideBayArea).toBe(false);
  });

  it('falls back to x-real-ip and flags off-campus coordinates', () => {
    const headers = new Headers({
      'x-real-ip': '9.9.9.9',
      'x-vercel-ip-country': 'US',
      'x-vercel-ip-country-region': 'NY',
      'x-vercel-ip-latitude': '40.7128',
      'x-vercel-ip-longitude': '-74.006'
    });

    const fp = extractSubmissionFootprint(headers);
    expect(fp.ip).toBe('9.9.9.9');
    expect(fp.geo.outsideBayArea).toBe(true);
  });

  it('handles missing geo headers without blocking', () => {
    const fp = extractSubmissionFootprint(new Headers());
    expect(fp.ip).toBeNull();
    expect(fp.geo.latitude).toBeNull();
    expect(fp.geo.outsideBayArea).toBe(false);
  });
});
