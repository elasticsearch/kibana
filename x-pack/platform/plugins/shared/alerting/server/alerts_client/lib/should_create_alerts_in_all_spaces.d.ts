import type { Logger } from '@kbn/core/server';
import type { UntypedRuleTypeAlerts } from '../../types';
interface ShouldCreateAlertsInAllSpacesOpts {
    ruleTypeId: string;
    ruleTypeAlertDef?: UntypedRuleTypeAlerts;
    logger: Logger;
}
export declare const shouldCreateAlertsInAllSpaces: ({ ruleTypeId, ruleTypeAlertDef, logger, }: ShouldCreateAlertsInAllSpacesOpts) => boolean;
export {};
