import type { RuleTaskState } from '../../types';
import type { RulesClientContext } from '../types';
export interface GetAlertStateParams {
    id: string;
}
export declare function getAlertState(context: RulesClientContext, { id }: GetAlertStateParams): Promise<RuleTaskState | void>;
