'use client';

import { useState } from 'react';

type SettingsTabId = 'board' | 'reminders' | 'continuity' | 'reporting' | 'slack' | 'audit';

export function SettingsTabs({
  initialTab,
  tabs
}: {
  initialTab: SettingsTabId;
  tabs: Array<{
    id: SettingsTabId;
    label: string;
    content: React.ReactNode;
  }>;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);

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
