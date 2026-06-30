import type { RulesClientContext } from '../../../../../rules_client/types';
import type { CreateGapAutoFillSchedulerParams } from './types';
import type { GapAutoFillSchedulerResponse } from '../../result/types';
export declare function createGapAutoFillScheduler(context: RulesClientContext, params: CreateGapAutoFillSchedulerParams): Promise<GapAutoFillSchedulerResponse>;
