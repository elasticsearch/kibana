import { RRuleFrequency } from '../../../../../../types';
export declare const i18nNthWeekday: (dayOfWeek: string) => string[];
export declare const i18nNthWeekdayShort: (dayOfWeek: string) => string[];
export declare const i18nFreqSummary: (interval: number) => {
    4: string;
    3: string;
    2: string;
    1: string;
    0: string;
};
export declare const i18nEndControlOptions: (interval: number) => {
    text: string;
    value: RRuleFrequency;
    'data-test-subj': string;
}[];
