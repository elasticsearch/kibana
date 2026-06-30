import type { SavedObjectsClientContract } from '@kbn/core/server';
import type { RulesClientContext } from '../../../../rules_client/types';
import type { GapAutoFillSchedulerSO } from '../../../../data/gap_auto_fill_scheduler/types/gap_auto_fill_scheduler';
import type { ReadOperations, WriteOperations } from '../../../../authorization';
import { GapAutoFillSchedulerAuditAction } from '../../../../rules_client/common/audit_events';
import type { SchedulerContext } from '../../methods/utils';
/**
 * Fetches the gap auto fill scheduler saved object and performs rule type based authorization.
 */
export declare const getGapAutoFillSchedulerSO: ({ context, id, operation, authAuditAction, }: {
    context: RulesClientContext;
    id: string;
    operation: ReadOperations | WriteOperations;
    authAuditAction: GapAutoFillSchedulerAuditAction;
}) => Promise<import("@kbn/core/server").SavedObject<GapAutoFillSchedulerSO>>;
/**
 * Fetches the scheduler config (enabled + numRetries) for gap fill status calculation.
 * Skips authorization, the caller already has permission to read gaps/rules,
 * and the scheduler lookup is an internal detail of status computation.
 * Returns null if the scheduler does not exist or if the lookup fails for any reason.
 * Failures are non-fatal: the gap query will proceed without error status detection.
 */
export declare const getSchedulerContextInternal: (savedObjectsClient: SavedObjectsClientContract, schedulerId: string) => Promise<SchedulerContext | null>;
