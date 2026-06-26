'use client';

import { useCallback, useState } from 'react';
import { HighValueAssetLogger } from '@/components/high-value-asset-logger';
import { HighValueAssetList, type HighValueAssetView } from '@/components/high-value-asset-list';

// Owns the on-page high value asset list state and renders the logger + list
// together. Logging or removing an asset updates the local list in place, so
// neither action navigates away or forces a full dashboard revalidate.
//
// canLog controls whether the logger is shown (e.g. financial officers view the
// register read-only). canManage enables the per-row inline Remove control.
export function HighValueAssetPanel({
  teams,
  canStewardLeadership = false,
  initialAssets,
  showTeam = false,
  canManage = false,
  canLog = true,
  listTitle
}: {
  teams: { id: string; name: string }[];
  canStewardLeadership?: boolean;
  loggedByName?: string;
  initialAssets: HighValueAssetView[];
  showTeam?: boolean;
  canManage?: boolean;
  canLog?: boolean;
  listTitle?: string;
}) {
  const [assets, setAssets] = useState<HighValueAssetView[]>(initialAssets);

  const handleLogged = useCallback((asset: HighValueAssetView) => {
    setAssets((prev) => [asset, ...prev.filter((existing) => existing.id !== asset.id)]);
  }, []);

  const handleRemoved = useCallback((id: string) => {
    setAssets((prev) => prev.filter((asset) => asset.id !== id));
  }, []);

  return (
    <>
      {canLog ? (
        <HighValueAssetLogger
          teams={teams}
          canStewardLeadership={canStewardLeadership}
          onLogged={handleLogged}
        />
      ) : null}
      <HighValueAssetList
        title={listTitle ?? 'High value equipment'}
        assets={assets}
        showTeam={showTeam}
        canManage={canManage}
        onRemoved={handleRemoved}
      />
    </>
  );
}
