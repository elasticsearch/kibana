import type { Moment } from 'moment';
import React from 'react';
import type { CustomFrequencyState } from './helpers';
interface CustomRecurrenceSchedulerProps {
    startDate: Moment | null;
    onChange: (state: CustomFrequencyState) => void;
    initialState: CustomFrequencyState;
    minimumRecurrenceDays: number;
}
export declare const CustomRecurrenceScheduler: React.FC<CustomRecurrenceSchedulerProps>;
export {};
