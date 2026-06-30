import type { Moment } from 'moment';
import React from 'react';
import type { RecurrenceSchedule } from '../../../../../../types';
interface ComponentOpts {
    startDate: Moment | null;
    endDate: Moment | null;
    initialState: RecurrenceSchedule | null;
    onChange: (schedule: RecurrenceSchedule) => void;
}
export declare const RecurrenceScheduler: React.FC<ComponentOpts>;
export {};
