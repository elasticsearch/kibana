import type { Alert } from '@kbn/alerting-types';
export declare const useAlertMutedState: (alert?: Alert) => {
    isMuted: boolean | null;
    ruleId: string | undefined;
    rule: string[];
    alertInstanceId: string | undefined;
};
