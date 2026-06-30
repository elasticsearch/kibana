import type { RulesClientContext } from '../../../../rules_client/types';
export interface UnsnoozeParams {
    id: string;
    scheduleIds?: string[];
}
export declare function unsnoozeRule(context: RulesClientContext, { id, scheduleIds }: UnsnoozeParams): Promise<void>;
