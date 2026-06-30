import type { HttpSetup } from '@kbn/core/public';
import type { RulesSettingsQueryDelay } from '@kbn/alerting-plugin/common';
export declare const getQueryDelaySettings: ({ http }: {
    http: HttpSetup;
}) => Promise<RulesSettingsQueryDelay>;
