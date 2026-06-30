import { RRuleFrequency } from '../../../../../../types';
export { I18N_WEEKDAY_OPTIONS } from '../../../../../../common/constants';
export { ISO_WEEKDAYS } from '@kbn/alerting-plugin/common';
export declare const RECURRENCE_END_OPTIONS: {
    id: string;
    label: string;
}[];
export declare const DEFAULT_REPEAT_OPTIONS: ({
    text: string;
    value: RRuleFrequency;
} | {
    text: string;
    value: string;
})[];
export declare const DEFAULT_RRULE_PRESETS: {
    4: {
        interval: number;
    };
    3: {
        interval: number;
    };
    2: {
        interval: number;
    };
    1: {
        interval: number;
    };
    0: {
        interval: number;
    };
};
export declare const ISO_WEEKDAYS_TO_RRULE: Record<number, string>;
export declare const RRULE_WEEKDAYS_TO_ISO_WEEKDAYS: {
    [x: string]: number;
};
