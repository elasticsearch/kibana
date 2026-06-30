import type { RulesClientContext } from '../../../../rules_client';
import type { FindGapsParams } from '../../types';
export declare function findGaps(context: RulesClientContext, params: FindGapsParams): Promise<{
    total: number;
    data: import("../../../../lib/rule_gaps/gap").Gap[];
    page: number;
    perPage: number;
}>;
