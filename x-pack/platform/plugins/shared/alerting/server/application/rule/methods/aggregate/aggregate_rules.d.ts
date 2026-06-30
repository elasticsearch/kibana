import type { RulesClientContext } from '../../../../rules_client/types';
import type { AggregateParams } from './types';
export declare function aggregateRules<T = Record<string, unknown>>(context: RulesClientContext, params: AggregateParams<T>): Promise<T>;
