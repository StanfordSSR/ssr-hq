'use client';

import { approveCardRegionAction } from '@/app/dashboard/actions';

// A Financial Officer's "approve this location" control. Posts the (user, region)
// pair to the redirecting server action.
export function ApproveCardRegionButton({
  userId,
  regionKey
}: {
  userId: string;
  regionKey: string;
}) {
  return (
    <form action={approveCardRegionAction}>
      <input type="hidden" name="user_id" value={userId} />
      <input type="hidden" name="region_key" value={regionKey} />
      <button className="button-secondary" type="submit">
        Approve this location
      </button>
    </form>
  );
}
