import { createAdminClient } from '@/lib/supabase-admin';

// Single capital equipment over $1,000 must be tracked for stewardship, because
// everything the club buys is the property of Stanford University. The amount
// threshold is held in cents so it matches the migration check exactly.
export const HIGH_VALUE_THRESHOLD_CENTS = 100000;

export const STORAGE_LOCATIONS = [
  { value: 'robotics_room', label: 'Robotics room' },
  { value: 'lab64', label: 'Lab64' },
  { value: 'chip', label: 'CHIP' },
  { value: 'other', label: 'Other' }
] as const;

export type StorageLocation = 'robotics_room' | 'lab64' | 'chip' | 'other';

export function storageLocationLabel(value: string, other?: string | null): string {
  if (value === 'other') {
    return (other || '').trim() || 'Other';
  }

  const match = STORAGE_LOCATIONS.find((location) => location.value === value);
  return match ? match.label : value;
}

export type HighValueAsset = {
  id: string;
  team_id: string;
  logged_by: string | null;
  item_name: string;
  amount_cents: number;
  storage_location: StorageLocation;
  storage_location_other: string | null;
  stewardship_note: string;
  created_at: string;
};

const HIGH_VALUE_ASSET_COLUMNS =
  'id, team_id, logged_by, item_name, amount_cents, storage_location, storage_location_other, stewardship_note, created_at';

export async function getHighValueAssetsForTeams(teamIds: string[]): Promise<HighValueAsset[]> {
  if (teamIds.length === 0) {
    return [];
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from('high_value_assets')
    .select(HIGH_VALUE_ASSET_COLUMNS)
    .in('team_id', teamIds)
    .order('created_at', { ascending: false });

  return (data || []) as HighValueAsset[];
}

export async function getAllHighValueAssets(): Promise<HighValueAsset[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('high_value_assets')
    .select(HIGH_VALUE_ASSET_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(500);

  return (data || []) as HighValueAsset[];
}
