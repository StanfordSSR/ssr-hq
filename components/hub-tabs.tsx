'use client';

import { useState } from 'react';

// Generic client-side tab switcher for hub pages (same visual pattern as
// SettingsTabs, but not tied to the settings tab ids). Content is rendered
// server-side and simply shown/hidden here, so switching tabs is instant.
export function HubTabs({
  initialTab,
  tabs
}: {
  initialTab: string;
  tabs: Array<{
    id: string;
    label: string;
    content: React.ReactNode;
  }>;
}) {
  const [activeTab, setActiveTab] = useState(initialTab);

  return (
    <>
      <div className="hq-tab-row">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`hq-tab-button ${activeTab === item.id ? 'hq-tab-button-active' : ''}`}
            onClick={() => setActiveTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tabs.map((item) => (
        <div key={item.id} hidden={activeTab !== item.id}>
          {item.content}
        </div>
      ))}
    </>
  );
}
