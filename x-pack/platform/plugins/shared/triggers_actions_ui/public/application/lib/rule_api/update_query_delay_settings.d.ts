import type { HttpSetup } from '@kbn/core/public';
import type { RulesSettingsQueryDelay, RulesSettingsQueryDelayProperties } from '@kbn/alerting-plugin/common';
export declare const updateQueryDelaySettings: ({ http, queryDelaySettings, }: {
    http: HttpSetup;
    queryDelaySettings: RulesSettingsQueryDelayProperties;
}) => Promise<RulesSettingsQueryDelay>;
