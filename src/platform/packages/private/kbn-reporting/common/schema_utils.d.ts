import type { ByteSizeValue } from '@kbn/config-schema';
import moment from 'moment';
export declare const durationToNumber: (value: number | moment.Duration) => number;
export declare const numberToDuration: (value: number | moment.Duration) => moment.Duration;
export declare const byteSizeValueToNumber: (value: number | ByteSizeValue) => number;
