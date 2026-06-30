import type { HttpStart } from '@kbn/core-http-browser';
export interface UseLoadConnectorTypesProps {
    http: HttpStart;
    includeSystemActions?: boolean;
    enabled?: boolean;
    featureId?: string;
}
export declare const useLoadConnectorTypes: (props: UseLoadConnectorTypesProps) => {
    data: import("@kbn/actions-types").ActionType[] | undefined;
    isInitialLoading: boolean;
    isLoading: boolean;
};
