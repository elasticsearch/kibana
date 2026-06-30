import React from 'react';
import type { SnoozeSchedule } from '../../../../../types';
interface PanelOpts {
    onSaveSchedule: (sched: SnoozeSchedule) => void;
    onCancelSchedules: (ids: string[]) => void;
    initialSchedule: SnoozeSchedule | null;
    isLoading: boolean;
    bulkSnoozeSchedule?: boolean;
    showDelete?: boolean;
    inPopover?: boolean;
}
export interface ComponentOpts extends PanelOpts {
    onClose: () => void;
    hasTitle: boolean;
}
export declare const hiddenCalendarClassName = "RuleSnoozeScheduler__hiddenCalendar";
export declare const RuleSnoozeScheduler: React.FunctionComponent<ComponentOpts>;
export {};
