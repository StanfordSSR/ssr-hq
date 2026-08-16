import { describe, it, expect } from 'vitest';
import {
  profileHasAdminRole,
  profileHasPresidentRole,
  profileHasVicePresidentRole,
  profileHasFinancialOfficerRole,
  profileHasLeadRole,
  holdsSigningRole,
  getAvailableRoles,
  getRoleLabel
} from '@/lib/auth';

// Minimal profile shape; each test overrides only what it cares about.
const base = {
  role: 'team_lead' as const,
  is_admin: false,
  is_president: false,
  is_vice_president: false,
  is_financial_officer: false
};

describe('role predicates', () => {
  it('recognizes a role held via the role column', () => {
    expect(profileHasAdminRole({ ...base, role: 'admin' })).toBe(true);
    expect(profileHasPresidentRole({ ...base, role: 'president' })).toBe(true);
  });

  it('recognizes a role held via the boolean flag', () => {
    expect(profileHasAdminRole({ ...base, is_admin: true })).toBe(true);
    expect(profileHasPresidentRole({ ...base, is_president: true })).toBe(true);
    expect(profileHasVicePresidentRole({ ...base, is_vice_president: true })).toBe(true);
    expect(profileHasFinancialOfficerRole({ ...base, is_financial_officer: true })).toBe(true);
  });

  it('does not leak one role into another', () => {
    const fo = { ...base, is_financial_officer: true };
    expect(profileHasFinancialOfficerRole(fo)).toBe(true);
    expect(profileHasAdminRole(fo)).toBe(false);
    expect(profileHasPresidentRole(fo)).toBe(false);
    expect(profileHasVicePresidentRole(fo)).toBe(false);
  });

  it('treats null/undefined flags as absent rather than throwing', () => {
    expect(profileHasAdminRole({ role: 'team_lead', is_admin: null })).toBe(false);
    expect(profileHasPresidentRole({ role: 'team_lead', is_president: undefined })).toBe(false);
  });

  it('grants lead either by membership or by role column', () => {
    expect(profileHasLeadRole({ role: 'team_lead' }, false)).toBe(true);
    expect(profileHasLeadRole({ role: 'admin' }, true)).toBe(true);
    expect(profileHasLeadRole({ role: 'admin' }, false)).toBe(false);
  });
});

describe('holdsSigningRole', () => {
  it('is true for president, vice president, and financial officer', () => {
    expect(holdsSigningRole({ ...base, is_president: true })).toBe(true);
    expect(holdsSigningRole({ ...base, is_vice_president: true })).toBe(true);
    expect(holdsSigningRole({ ...base, is_financial_officer: true })).toBe(true);
    expect(holdsSigningRole({ ...base, role: 'president' })).toBe(true);
  });

  it('is false for a plain lead', () => {
    expect(holdsSigningRole(base)).toBe(false);
  });

  it('is false for an admin who holds no signing office', () => {
    // Admin is a systems role; it does not by itself require a signature.
    expect(holdsSigningRole({ ...base, role: 'admin' })).toBe(false);
  });
});

describe('getAvailableRoles', () => {
  it('returns roles in privilege order', () => {
    const everything = {
      role: 'admin' as const,
      is_admin: true,
      is_president: true,
      is_vice_president: true,
      is_financial_officer: true
    };
    expect(getAvailableRoles(everything, true)).toEqual([
      'admin',
      'president',
      'vice_president',
      'financial_officer',
      'team_lead'
    ]);
  });

  it('gives a plain lead exactly one role', () => {
    expect(getAvailableRoles(base, true)).toEqual(['team_lead']);
  });

  it('omits team_lead for an officer who leads no team', () => {
    const fo = { ...base, role: 'financial_officer' as const, is_financial_officer: true };
    expect(getAvailableRoles(fo, false)).toEqual(['financial_officer']);
  });

  it('adds team_lead to an officer who also leads a team', () => {
    const president = { ...base, is_president: true };
    expect(getAvailableRoles(president, true)).toEqual(['president', 'team_lead']);
  });

  it('never returns duplicates when role and flag agree', () => {
    const admin = { ...base, role: 'admin' as const, is_admin: true };
    const roles = getAvailableRoles(admin, false);
    expect(roles).toEqual(Array.from(new Set(roles)));
  });

  it('returns an empty list for a profile with no roles at all', () => {
    // The caller is responsible for defaulting; this must not throw.
    const nobody = { ...base, role: 'member' as unknown as 'team_lead' };
    expect(getAvailableRoles(nobody, false)).toEqual([]);
  });
});

describe('getRoleLabel', () => {
  it('labels every role a human can hold', () => {
    expect(getRoleLabel('admin')).toBeTruthy();
    expect(getRoleLabel('president')).toBeTruthy();
    expect(getRoleLabel('vice_president')).toBeTruthy();
    expect(getRoleLabel('financial_officer')).toBeTruthy();
    expect(getRoleLabel('team_lead')).toBeTruthy();
  });

  it('distinguishes president from vice president', () => {
    expect(getRoleLabel('president')).not.toBe(getRoleLabel('vice_president'));
  });
});
