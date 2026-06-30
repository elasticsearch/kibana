export declare const validateSchedule: (schedule: {
    duration: string;
    recurring?: {
        every?: string;
        end?: string;
        occurrences?: number;
    };
}) => string | undefined;
