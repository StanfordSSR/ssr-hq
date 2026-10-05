import {
  TEAM_BUDGET_ACADEMIC_YEAR,
  type BudgetApplicationItem
} from '@/lib/team-budget-application-rules';

type FixedTravelLine = { id: string; description: string; amountCents: number };

const FIXED_TRAVEL: Record<string, readonly FixedTravelLine[]> = {
  robosub: [
    { id: 'fixed-travel-robosub-mbari-gas', description: 'Gas to MBARI for open-water testing (2-3 visits; student-owned cars; 64.8 miles one way x3)', amountCents: 65_00 },
    { id: 'fixed-travel-robosub-tahoe-gas', description: 'Gas to Tahoe for open-water testing of hydrophones, thrusters and autonomous systems (3 cars; 227 miles one way)', amountCents: 400_00 },
    { id: 'fixed-travel-robosub-competition-gas', description: 'Gas to RoboSub competition in Irvine (3 personal cars for one week; 806 miles each way plus on-site driving)', amountCents: 900_00 },
    { id: 'fixed-travel-robosub-tahoe-airbnb', description: 'Airbnb in Tahoe for open-water testing (15 undergraduates)', amountCents: 0 },
    { id: 'fixed-travel-robosub-competition-airbnb', description: 'Airbnb for RoboSub competition', amountCents: 3_000_00 }
  ],
  skyrunners: [
    { id: 'fixed-travel-skyrunners-arizona-vans', description: 'Arizona van rentals for SkyRunners technical validation', amountCents: 354_00 },
    { id: 'fixed-travel-skyrunners-facility-rentals', description: 'Quarterly local facility rentals for drone testing, including Wing wind tunnel and SkyDio faraday cage', amountCents: 456_00 },
    { id: 'fixed-travel-skyrunners-caltrain-bus', description: 'Caltrain/bus for monthly off-campus drone flight testing (10-12 students per test)', amountCents: 1_000_00 },
    { id: 'fixed-travel-skyrunners-suas-flights', description: 'SUAS competition flights for about 6 students, San Francisco to Tulsa, Oklahoma', amountCents: 1_800_00 },
    { id: 'fixed-travel-skyrunners-arizona-validation', description: 'Arizona technical validation trip for sensor fusion and flight dynamics (3 days, 12 students)', amountCents: 0 },
    { id: 'fixed-travel-skyrunners-suas-accommodation', description: 'SUAS competition accommodation in Tulsa (about 6 students, 4 nights)', amountCents: 905_00 }
  ],
  'combat-robotics': [
    { id: 'fixed-travel-combat-robotics-tsf', description: 'BattleBots travel - TSF Fund', amountCents: 1_000_00 }
  ]
};

export const FIXED_TRAVEL_ZERO_IDS = new Set(
  Object.values(FIXED_TRAVEL).flatMap((lines) => lines.filter((line) => line.amountCents === 0).map((line) => line.id))
);

export function getFixedTravelItems(teamSlug: string, academicYear: string): BudgetApplicationItem[] {
  if (academicYear !== TEAM_BUDGET_ACADEMIC_YEAR) return [];
  return (FIXED_TRAVEL[teamSlug] || []).map((line) => ({ ...line, category: 'travel' }));
}

export function withFixedTravelItems(items: BudgetApplicationItem[], fixedTravel: BudgetApplicationItem[]) {
  if (fixedTravel.length === 0) return items;
  return [...items.filter((item) => item.category !== 'travel'), ...fixedTravel];
}

export function hasFixedTravelItems(items: BudgetApplicationItem[], fixedTravel: BudgetApplicationItem[]) {
  if (fixedTravel.length === 0) return true;
  const travel = items.filter((item) => item.category === 'travel');
  return travel.length === fixedTravel.length && travel.every((item, index) => {
    const expected = fixedTravel[index];
    return item.id === expected.id && item.description === expected.description && item.amountCents === expected.amountCents;
  });
}

export function assertFixedTravelItems(
  items: BudgetApplicationItem[],
  fixedTravel: BudgetApplicationItem[],
  travelCapCents: number
) {
  if (fixedTravel.length === 0) return;
  const fixedTotal = fixedTravel.reduce((sum, item) => sum + item.amountCents, 0);
  if (fixedTotal !== travelCapCents) {
    throw new Error('The fixed travel items no longer match the club budget plan. Ask an admin to review them.');
  }
  if (!hasFixedTravelItems(items, fixedTravel)) {
    throw new Error('Travel is fixed by the club budget plan. Refresh to see the approved travel lines.');
  }
}
