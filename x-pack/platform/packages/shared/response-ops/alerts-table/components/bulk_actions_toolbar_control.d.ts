import React from 'react';
import type { Alert } from '@kbn/alerting-types';
import type { SettingsStart } from '@kbn/core-ui-settings-browser';
import type { BulkActionsPanelConfig } from '../types';
interface BulkActionsProps {
    totalItems: number;
    panels: BulkActionsPanelConfig[];
    alerts: Alert[];
    setIsBulkActionsLoading: (loading: boolean) => void;
    clearSelection: () => void;
    refresh: () => void;
    settings: SettingsStart;
}
declare const _default: React.NamedExoticComponent<BulkActionsProps>;
export default _default;
