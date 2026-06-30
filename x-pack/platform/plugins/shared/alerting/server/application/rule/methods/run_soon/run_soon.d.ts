import type { RulesClientContext } from '../../../../rules_client/types';
import type { RunSoonParams } from './types';
export declare function runSoon(context: RulesClientContext, params: RunSoonParams): Promise<string | undefined>;
