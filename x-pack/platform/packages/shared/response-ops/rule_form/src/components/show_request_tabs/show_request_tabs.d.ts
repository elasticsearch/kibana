import React from 'react';
import type { ShowRequestActivePage } from '../../types';
interface ShowRequestTabsProps {
    activeTab: ShowRequestActivePage;
    onTabChange: (tab: ShowRequestActivePage) => void;
}
export declare const ShowRequestTabs: ({ activeTab, onTabChange }: ShowRequestTabsProps) => React.JSX.Element;
export {};
