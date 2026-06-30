import type { HttpStart } from '@kbn/core-http-browser';
export interface UseLoadConnectorsProps {
    http: HttpStart;
    includeSystemActions?: boolean;
    enabled?: boolean;
    cacheTime?: number;
}
export declare const useLoadConnectors: (props: UseLoadConnectorsProps) => {
    data: import("@kbn/alerts-ui-shared").ActionConnector[] | undefined;
    isInitialLoading: boolean;
    isLoading: boolean;
};
