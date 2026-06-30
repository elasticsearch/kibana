import type { RuleSnooze } from '@kbn/alerting-plugin/common';
import React from 'react';
import type { SnoozeSchedule } from '../../../../../../types';
export interface BaseSnoozePanelProps {
    interval?: string;
    snoozeRule: (schedule: SnoozeSchedule) => Promise<void>;
    unsnoozeRule: (scheduleIds?: string[]) => Promise<void>;
    showCancel: boolean;
    showAddSchedule?: boolean;
    scheduledSnoozes: RuleSnooze;
    activeSnoozes: string[];
    hasTitle?: boolean;
    navigateToScheduler: (sched?: SnoozeSchedule) => void;
    isLoading: boolean;
    onRemoveAllSchedules: (ids: string[]) => void;
    inPopover?: boolean;
}
export declare const BaseSnoozePanel: React.FunctionComponent<BaseSnoozePanelProps>;
