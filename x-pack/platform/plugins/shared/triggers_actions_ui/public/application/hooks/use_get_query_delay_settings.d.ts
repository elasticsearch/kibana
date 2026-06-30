import type { RulesSettingsQueryDelay } from '@kbn/alerting-plugin/common';
interface UseGetQueryDelaySettingsProps {
    enabled: boolean;
    onSuccess: (settings: RulesSettingsQueryDelay) => void;
}
export declare const useGetQueryDelaySettings: (props: UseGetQueryDelaySettingsProps) => {
    isLoading: boolean;
    isError: boolean;
    data: RulesSettingsQueryDelay | undefined;
};
export {};
