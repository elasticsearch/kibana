import type { MuteAlertQuery, MuteAlertParams } from './types';
import type { RulesClientContext } from '../../../../rules_client/types';
export declare function muteInstance(context: RulesClientContext, { params, query }: {
    params: MuteAlertParams;
    query: MuteAlertQuery;
}): Promise<void>;
