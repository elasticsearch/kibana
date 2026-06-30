export declare enum TIME_UNITS {
    SECOND = "s",
    MINUTE = "m",
    HOUR = "h",
    DAY = "d"
}
export declare const getTimeUnitLabel: (timeUnit?: TIME_UNITS, timeValue?: string) => string;
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
