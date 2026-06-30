import React from 'react';
export interface ComponentOpts {
    executionDuration: {
        average: number;
        valuesWithTimestamp: Record<string, number>;
    };
    numberOfExecutions: number;
    onChangeDuration: (length: number) => void;
    isLoading?: boolean;
}
export declare const ExecutionDurationChart: React.FunctionComponent<ComponentOpts>;
export declare function padOrTruncateDurations(valuesWithTimestamp: Record<string, number>, desiredSize: number): [string, number][];
