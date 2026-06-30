import { TIME_UNITS } from '../../application/constants';
export declare const getTimeOptions: (unitSize: number) => {
    text: string;
    value: TIME_UNITS;
}[];
interface TimeFieldOptions {
    text: string;
    value: string;
}
export declare const getTimeFieldOptions: (fields: Array<{
    type: string;
    name: string;
}>) => TimeFieldOptions[];
export {};
