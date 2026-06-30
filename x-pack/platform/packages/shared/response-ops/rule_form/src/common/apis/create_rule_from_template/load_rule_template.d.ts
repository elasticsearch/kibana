import type { HttpSetup } from '@kbn/core/public';
import type { RuleTemplate } from '../../../types';
export declare function loadRuleTemplate({ http, templateId, }: {
    http: HttpSetup;
    templateId: string;
}): Promise<RuleTemplate>;
