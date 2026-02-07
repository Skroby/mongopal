import type { TabId } from '../ConnectionFormTypes';

interface TabInfo {
  id: TabId;
  label: string;
  errorCount: number;
  warningCount: number;
}

interface TabNavigationProps {
  tabs: TabInfo[];
  activeTab: TabId;
  onTabChange: (tabId: TabId) => void;
}

export function TabNavigation({ tabs, activeTab, onTabChange }: TabNavigationProps) {
  return (
    <div className="border-b border-zinc-700">
      <nav className="flex space-x-1 px-4">
        {tabs.map(tab => {
          const isActive = tab.id === activeTab;
          const hasBadge = tab.errorCount > 0 || tab.warningCount > 0;

          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`
                relative px-4 py-2.5 text-sm font-medium transition-colors
                ${isActive
                  ? 'text-white border-b-2 border-accent'
                  : 'text-zinc-400 hover:text-white'
                }
              `}
            >
              <span className="flex items-center gap-2">
                {tab.label}
                {hasBadge && (
                  <span
                    className={`
                      inline-flex items-center justify-center min-w-[18px] h-[18px] px-1
                      text-xs font-bold rounded-full
                      ${tab.errorCount > 0
                        ? 'bg-red-600 text-white'
                        : 'bg-yellow-500 text-zinc-900'
                      }
                    `}
                    title={`${tab.errorCount} errors, ${tab.warningCount} warnings`}
                  >
                    {tab.errorCount > 0 ? tab.errorCount : tab.warningCount}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
