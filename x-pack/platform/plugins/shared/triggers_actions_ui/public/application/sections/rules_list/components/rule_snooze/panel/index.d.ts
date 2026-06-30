import React from 'react';
import type { BaseSnoozePanelProps } from './base_snooze_panel';
export { futureTimeToInterval } from './helpers';
type SnoozePanelProps = Pick<BaseSnoozePanelProps, 'interval' | 'snoozeRule' | 'unsnoozeRule' | 'showCancel' | 'scheduledSnoozes' | 'activeSnoozes' | 'hasTitle' | 'inPopover' | 'showAddSchedule'>;
export declare const SnoozePanel: React.FC<SnoozePanelProps>;
export { SnoozePanel as default };
