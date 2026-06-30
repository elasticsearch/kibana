import type { HttpSetup } from '@kbn/core/public';
import type { RulesSettingsFlapping, RulesSettingsFlappingProperties } from '@kbn/alerting-plugin/common';
export declare const updateFlappingSettings: ({ http, flappingSettings, }: {
    http: HttpSetup;
    flappingSettings: RulesSettingsFlappingProperties;
}) => Promise<RulesSettingsFlapping>;
