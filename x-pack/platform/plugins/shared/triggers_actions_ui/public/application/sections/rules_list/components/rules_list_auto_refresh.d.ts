import React from 'react';
interface RulesListAutoRefreshProps {
    lastUpdate: string;
    initialUpdateInterval?: number;
    onRefresh: () => void;
}
export declare const RulesListAutoRefresh: (props: RulesListAutoRefreshProps) => React.JSX.Element;
export {};
