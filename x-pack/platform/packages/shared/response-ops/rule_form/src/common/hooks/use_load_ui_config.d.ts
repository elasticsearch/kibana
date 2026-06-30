import type { HttpStart } from '@kbn/core-http-browser';
export interface UseLoadUiConfigProps {
    http: HttpStart;
}
export declare const useLoadUiConfig: (props: UseLoadUiConfigProps) => {
    data: import("../apis/fetch_ui_config").UiConfig | undefined;
    isLoading: boolean;
    isInitialLoading: boolean;
    isSuccess: boolean;
    isError: boolean;
    error: unknown;
};
