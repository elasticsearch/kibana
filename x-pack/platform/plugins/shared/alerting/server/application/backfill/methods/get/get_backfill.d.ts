import type { RulesClientContext } from '../../../../rules_client';
import type { Backfill } from '../../result/types';
export declare function getBackfill(context: RulesClientContext, id: string): Promise<Backfill>;
