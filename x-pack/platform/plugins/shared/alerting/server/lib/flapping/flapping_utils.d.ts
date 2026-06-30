import type { RulesSettingsFlappingProperties } from '../../../common/rules_settings';
export declare function updateFlappingHistory(flappingSettings: RulesSettingsFlappingProperties, flappingHistory: boolean[], state: boolean): boolean[];
export declare function isFlapping(flappingSettings: RulesSettingsFlappingProperties, flappingHistory: boolean[], isCurrentlyFlapping?: boolean): boolean;
export declare function atCapacity(flappingSettings: RulesSettingsFlappingProperties, flappingHistory?: boolean[]): boolean;
