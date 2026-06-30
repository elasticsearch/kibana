import React from 'react';
import type { BoolQuery, Filter } from '@kbn/es-query';
import type { FilterGroupHandler } from '@kbn/alerts-ui-shared/src/alert_filter_controls/types';
interface RuleAlertSearchBarProps {
    ruleTypeId: string;
    filterControls?: Filter[];
    onFilterControlsChange: (filterControls: Filter[]) => void;
    onControlApiAvailable: (controlGroupHandler: FilterGroupHandler | undefined) => void;
    onEsQueryChange: (esQuery: {
        bool: BoolQuery;
    }) => void;
}
export declare const RuleAlertSearchBar: ({ ruleTypeId, filterControls, onFilterControlsChange, onControlApiAvailable, onEsQueryChange, }: RuleAlertSearchBarProps) => React.JSX.Element;
export {};
