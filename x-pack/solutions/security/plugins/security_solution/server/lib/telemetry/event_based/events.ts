/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { EventTypeOpts } from '@kbn/core/server';
import type { ConfirmationStatus } from '@kbn/agent-builder-common/agents/prompts';
import type { BulkUpsertAssetCriticalityRecordsResponse } from '../../../../common/api/entity_analytics';
import type { CsvErrorCategory } from '../../entity_analytics/entity_resolution/csv_upload';
import type {
  ResponseActionAgentType,
  ResponseActionStatus,
  ResponseActionsApiCommandNames,
} from '../../../../common/endpoint/service/response_actions/constants';
import type {
  DataStreams,
  IlmPolicies,
  IlmsStats,
  IndexTemplatesStats,
  IndicesSettings,
  IndicesStats,
} from '../indices.metadata.types';
import type { NodeIngestPipelinesStats } from '../ingest_pipelines_stats.types';
import type {
  HealthDiagnosticQueryResult,
  HealthDiagnosticQueryStats,
} from '../diagnostic/health_diagnostic_service.types';

import { SIEM_MIGRATIONS_EVENTS } from './events/siem_migrations';
import type {
  RuleBulkUpgradeTelemetry,
  RuleUpgradeTelemetry,
} from '../../detection_engine/prebuilt_rules/api/perform_rule_upgrade/update_rule_telemetry';
import type {
  RuleRestoreTelemetry,
  RuleRestoreErrorTelemetry,
} from '../../detection_engine/rule_management/logic/detection_rules_client/restore_telemetry';
import type {
  RuleDuplicateTelemetry,
  RuleLifecycleTelemetry,
} from '../../detection_engine/rule_management/logic/detection_rules_client/rule_lifecycle_telemetry';
import { TRIAL_COMPANION_EVENTS } from '../../trial_companion/telemetry/trial_companion_ebt_events';

// Telemetry event that is sent for each rule that is upgraded during a prebuilt rule upgrade
export const DETECTION_RULE_UPGRADE_EVENT: EventTypeOpts<RuleUpgradeTelemetry> = {
  eventType: 'detection_rule_upgrade',
  schema: {
    ruleId: { type: 'keyword', _meta: { description: 'Rule ID' } },
    ruleName: { type: 'keyword', _meta: { description: 'Rule name' } },
    hasBaseVersion: {
      type: 'boolean',
      _meta: { description: 'True if base version exists for this rule' },
    },
    hasRuleTypeChange: {
      type: 'boolean',
      _meta: {
        description:
          "True if the rule's type was force-set to the target version's value during this upgrade",
      },
    },
    finalResult: {
      type: 'keyword',
      _meta: { description: 'Overall outcome: SUCCESS | SKIP | ERROR' },
    },
    updatedFieldsSummary: {
      properties: {
        count: { type: 'long', _meta: { description: 'Number of updated fields' } },
        nonSolvableConflictsCount: {
          type: 'long',
          _meta: { description: 'Number of non-solvable conflicts' },
        },
        solvableConflictsCount: {
          type: 'long',
          _meta: { description: 'Number of solvable conflicts' },
        },
        noConflictsCount: {
          type: 'long',
          _meta: { description: 'Number of fields without conflicts' },
        },
      },
    },
    updatedFieldsTotal: {
      type: 'array',
      items: {
        type: 'keyword',
        _meta: {
          description: 'Rule field name',
        },
      },
      _meta: { description: 'Fields that were updated' },
    },
    updatedFieldsWithNonSolvableConflicts: {
      type: 'array',
      items: {
        type: 'keyword',
        _meta: {
          description: 'Rule field name',
        },
      },
      _meta: { description: 'Fields with non-solvable conflicts' },
    },
    updatedFieldsWithSolvableConflicts: {
      type: 'array',
      items: {
        type: 'keyword',
        _meta: {
          description: 'Rule field name',
        },
      },
      _meta: { description: 'Fields with solvable conflicts' },
    },
    updatedFieldsWithNoConflicts: {
      type: 'array',
      items: {
        type: 'keyword',
        _meta: {
          description: 'Rule field name',
        },
      },
      _meta: { description: 'Fields updated without conflicts' },
    },
  },
};

// Telemetry event that is sent when a rule is restored to a previous changes-history revision
export const DETECTION_RULE_RESTORE_EVENT: EventTypeOpts<RuleRestoreTelemetry> = {
  eventType: 'detection_rule_restore',
  schema: {
    ruleId: { type: 'keyword', _meta: { description: 'ID of the rule that was restored' } },
    ruleType: {
      type: 'keyword',
      _meta: { description: 'Type of the restored rule, e.g. query, eql, esql, threshold' },
    },
    isPrebuilt: {
      type: 'boolean',
      _meta: { description: 'True if the restored rule is a prebuilt (external) rule' },
    },
    isCustomized: {
      type: 'boolean',
      _meta: { description: 'True if the restored rule is a customized prebuilt rule' },
    },
    restoredRevisionTimestamp: {
      type: 'date',
      _meta: { description: 'Timestamp of the restored history revision' },
    },
  },
};

export const DETECTION_RULE_RESTORE_ERROR_EVENT: EventTypeOpts<RuleRestoreErrorTelemetry> = {
  eventType: 'detection_rule_restore_error',
  schema: {
    ruleId: { type: 'keyword', _meta: { description: 'ID of the rule that failed to restore' } },
    changeId: {
      type: 'keyword',
      _meta: { description: 'ID of the history change that was being restored' },
    },
    status: {
      type: 'keyword',
      _meta: { description: 'Failure reason: "conflict" or "error"' },
    },
    errorMessage: {
      type: 'keyword',
      _meta: { description: 'Error message thrown while restoring the rule' },
    },
  },
};

const ruleLifecycleTelemetrySchema = {
  ruleId: { type: 'keyword' as const, _meta: { description: 'ID of the rule' } },
  ruleType: {
    type: 'keyword' as const,
    _meta: { description: 'Type of the rule, e.g. query, eql, esql, threshold' },
  },
  isPrebuilt: {
    type: 'boolean' as const,
    _meta: { description: 'True if the rule is a prebuilt (external) rule' },
  },
  isCustomized: {
    type: 'boolean' as const,
    _meta: { description: 'True if the rule is a customized prebuilt rule' },
  },
};

export const DETECTION_RULE_IMPORT_EVENT: EventTypeOpts<RuleLifecycleTelemetry> = {
  eventType: 'detection_rule_import',
  schema: ruleLifecycleTelemetrySchema,
};

export const DETECTION_RULE_REVERT_EVENT: EventTypeOpts<RuleLifecycleTelemetry> = {
  eventType: 'detection_rule_revert',
  schema: ruleLifecycleTelemetrySchema,
};

export const DETECTION_RULE_INSTALL_EVENT: EventTypeOpts<RuleLifecycleTelemetry> = {
  eventType: 'detection_rule_install',
  schema: ruleLifecycleTelemetrySchema,
};

export const DETECTION_RULE_DUPLICATE_EVENT: EventTypeOpts<RuleDuplicateTelemetry> = {
  eventType: 'detection_rule_duplicate',
  schema: {
    ruleId: { type: 'keyword', _meta: { description: 'ID of the newly created (duplicate) rule' } },
    sourceRuleId: { type: 'keyword', _meta: { description: 'ID of the rule that was duplicated' } },
    ruleType: {
      type: 'keyword',
      _meta: { description: 'Type of the duplicated rule, e.g. query, eql, esql, threshold' },
    },
    isPrebuiltSource: {
      type: 'boolean',
      _meta: { description: 'True if the source rule is a prebuilt (external) rule' },
    },
    isCustomizedSource: {
      type: 'boolean',
      _meta: { description: 'True if the source rule is a customized prebuilt rule' },
    },
  },
};

// Telemetry event that is sent for each bulk upgrade rules request
export const DETECTION_RULE_BULK_UPGRADE_EVENT: EventTypeOpts<RuleBulkUpgradeTelemetry> = {
  eventType: 'detection_rule_bulk_upgrade',
  schema: {
    successfulUpdates: {
      properties: {
        totalNumberOfRules: {
          type: 'long',
          _meta: { description: 'Number of successfully updated rules in bulk update request' },
        },
        numOfCustomizedRules: {
          type: 'long',
          _meta: {
            description: 'Number of successfully updated customized rules in bulk update request',
          },
        },
        numOfNonCustomizedRules: {
          type: 'long',
          _meta: {
            description:
              'Number of successfully updated non-customized rules in bulk update request',
          },
        },
        numOfNonSolvableConflicts: {
          type: 'long',
          _meta: {
            description:
              'Number of successfully updated rules with non-solvable conflicts in bulk update request',
          },
        },
        numOfSolvableConflicts: {
          type: 'long',
          _meta: {
            description:
              'Number of successfully updated rules with solvable conflicts in bulk update request',
          },
        },
        numOfNoConflicts: {
          type: 'long',
          _meta: {
            description:
              'Number of successfully updated rules with no conflicts in bulk update request',
          },
        },
        numOfRulesWithRuleTypeChange: {
          type: 'long',
          _meta: {
            description:
              'Number of successfully updated rules with a rule type change in bulk update request',
          },
        },
      },
    },
    errorUpdates: {
      properties: {
        totalNumberOfRules: {
          type: 'long',
          _meta: { description: 'Number of rules that failed to update in bulk update request' },
        },
        numOfCustomizedRules: {
          type: 'long',
          _meta: {
            description: 'Number of customized rules that failed to update in bulk update request',
          },
        },
        numOfNonCustomizedRules: {
          type: 'long',
          _meta: {
            description:
              'Number of non-customized rules that failed to update in bulk update request',
          },
        },
        numOfNonSolvableConflicts: {
          type: 'long',
          _meta: {
            description:
              'Number of rules with non-solvable conflicts that failed to update in bulk update request',
          },
        },
        numOfSolvableConflicts: {
          type: 'long',
          _meta: {
            description:
              'Number of rules with solvable conflicts that failed to update in bulk update request',
          },
        },
        numOfNoConflicts: {
          type: 'long',
          _meta: {
            description:
              'Number of rules with no conflicts that failed to update in bulk update request',
          },
        },
        numOfRulesWithRuleTypeChange: {
          type: 'long',
          _meta: {
            description:
              'Number of rules with a rule type change that failed to update in bulk update request',
          },
        },
      },
    },
    skippedUpdates: {
      properties: {
        totalNumberOfRules: {
          type: 'long',
          _meta: { description: 'Number of rules that were skipped during bulk update request' },
        },
        numOfCustomizedRules: {
          type: 'long',
          _meta: {
            description: 'Number of customized rules that were skipped during bulk update request',
          },
        },
        numOfNonCustomizedRules: {
          type: 'long',
          _meta: {
            description:
              'Number of non-customized rules that were skipped during bulk update request',
          },
        },
        numOfNonSolvableConflicts: {
          type: 'long',
          _meta: {
            description:
              'Number of rules with non-solvable conflicts that were skipped during bulk update request',
          },
        },
        numOfSolvableConflicts: {
          type: 'long',
          _meta: {
            description:
              'Number of rules with solvable conflicts that were skipped during bulk update request',
          },
        },
        numOfNoConflicts: {
          type: 'long',
          _meta: {
            description:
              'Number of rules with no conflicts that were skipped during bulk update request',
          },
        },
        numOfRulesWithRuleTypeChange: {
          type: 'long',
          _meta: {
            description:
              'Number of rules with a rule type change that were skipped during bulk update request',
          },
        },
      },
    },
  },
};

export const RISK_SCORE_EXECUTION_SUCCESS_EVENT: EventTypeOpts<{
  scoresWritten: number;
  taskDurationInSeconds: number;
  interval: string;
  alertSampleSizePerShard: number;
}> = {
  eventType: 'risk_score_execution_success',
  schema: {
    scoresWritten: {
      type: 'long',
      _meta: {
        description: 'Number of risk scores written during this scoring task execution',
      },
    },
    taskDurationInSeconds: {
      type: 'long',
      _meta: {
        description: 'Duration (in seconds) of the current risk scoring task execution',
      },
    },
    interval: {
      type: 'keyword',
      _meta: {
        description: `Configured interval for the current risk scoring task`,
      },
    },
    alertSampleSizePerShard: {
      type: 'long',
      _meta: {
        description: `Number of alerts to sample per shard for the current risk scoring task`,
      },
    },
  },
};

export const RISK_SCORE_EXECUTION_ERROR_EVENT: EventTypeOpts<{}> = {
  eventType: 'risk_score_execution_error',
  schema: {},
};

export const RISK_SCORE_EXECUTION_CANCELLATION_EVENT: EventTypeOpts<{
  scoresWritten: number;
  taskDurationInSeconds: number;
  interval: string;
  alertSampleSizePerShard: number;
}> = {
  eventType: 'risk_score_execution_cancellation',
  schema: {
    scoresWritten: {
      type: 'long',
      _meta: {
        description: 'Number of risk scores written during this scoring task execution',
      },
    },
    taskDurationInSeconds: {
      type: 'long',
      _meta: {
        description: 'Duration (in seconds) of the current risk scoring task execution',
      },
    },
    interval: {
      type: 'keyword',
      _meta: {
        description: `Configured interval for the current risk scoring task`,
      },
    },
    alertSampleSizePerShard: {
      type: 'long',
      _meta: {
        description: `Number of alerts to sample per shard for the current risk scoring task`,
      },
    },
  },
};

export type RiskScoreMaintainerStatus = 'success' | 'error' | 'skipped' | 'aborted';
export type RiskScoreMaintainerSkipReason =
  | 'license_insufficient'
  | 'feature_disabled'
  | 'risk_engine_disabled'
  | 'reset_to_zero_disabled'
  | 'lookup_empty'
  | 'resolution_disabled'
  | 'phase_not_available';
export type RiskScoreMaintainerErrorKind =
  | 'esql_query_failed'
  | 'bulk_write_failed'
  | 'entity_store_write_failed'
  | 'entity_fetch_failed'
  | 'unexpected';
export type RiskScoreMaintainerStage =
  | 'phase0_lookup_build'
  | 'phase1_base_scoring'
  | 'phase2_resolution_scoring'
  | 'reset_to_zero';

interface StageSummaryBase {
  namespace: string;
  entityType: string;
  status: RiskScoreMaintainerStatus;
  skipReason?: RiskScoreMaintainerSkipReason;
  errorKind?: RiskScoreMaintainerErrorKind;
  durationMs: number;
  idBasedRiskScoringEnabled: boolean;
}

interface Phase0LookupBuildSummary extends StageSummaryBase {
  stage: 'phase0_lookup_build';
  pagesProcessed?: number;
  entitiesIterated?: number;
  lookupRowsWritten?: number;
  bulkBatches?: number;
  lookupRowsFailed?: number;
}

interface Phase1BaseScoringSummary extends StageSummaryBase {
  stage: 'phase1_base_scoring';
  pagesProcessed?: number;
  scoresWritten?: number;
  /** Pre-create lookup misses; the funnel reserves `droppedNotInStore` for write-time 404s. */
  scoresMissingFromStore?: number;
  entitiesCreated?: number;
  /** Missing scores not written because no alert was found or policy rejected them. */
  entityCreationsSkipped?: number;
  /** Missing scores rejected by EUID/field validation or bulk creation. */
  entityCreationsFailed?: number;
}

interface Phase2ResolutionScoringSummary extends StageSummaryBase {
  stage: 'phase2_resolution_scoring';
  pagesProcessed?: number;
  scoresWritten?: number;
}

interface ResetToZeroSummary extends StageSummaryBase {
  stage: 'reset_to_zero';
  scoresWritten?: number;
  resetBatchLimitHit?: boolean;
}

export type RiskScoreMaintainerStageSummaryEvent =
  | Phase0LookupBuildSummary
  | Phase1BaseScoringSummary
  | Phase2ResolutionScoringSummary
  | ResetToZeroSummary;

export const RISK_SCORE_MAINTAINER_RUN_SUMMARY_EVENT: EventTypeOpts<{
  namespace: string;
  entityType: string;
  status: RiskScoreMaintainerStatus;
  skipReason?: RiskScoreMaintainerSkipReason;
  errorKind?: RiskScoreMaintainerErrorKind;
  durationMs: number;
  scoresWrittenTotal: number;
  scoresWrittenBase: number;
  scoresWrittenResolution: number;
  scoresWrittenResetToZero: number;
  pagesProcessed: number;
  lookupPrunedDocs: number;
  idBasedRiskScoringEnabled: boolean;
}> = {
  eventType: 'risk_score_maintainer_run_summary',
  schema: {
    namespace: { type: 'keyword', _meta: { description: 'Kibana space where scoring ran' } },
    entityType: { type: 'keyword', _meta: { description: 'Entity type scored (e.g. host, user)' } },
    status: { type: 'keyword', _meta: { description: 'Run outcome status' } },
    skipReason: {
      type: 'keyword',
      _meta: { optional: true, description: 'Bounded reason when status is skipped' },
    },
    errorKind: {
      type: 'keyword',
      _meta: { optional: true, description: 'Bounded error category when status is error' },
    },
    durationMs: { type: 'long', _meta: { description: 'Run duration in milliseconds' } },
    scoresWrittenTotal: { type: 'long', _meta: { description: 'Total risk score docs written' } },
    scoresWrittenBase: {
      type: 'long',
      _meta: { description: 'Risk score docs written during base scoring stage' },
    },
    scoresWrittenResolution: {
      type: 'long',
      _meta: { description: 'Risk score docs written during resolution scoring stage' },
    },
    scoresWrittenResetToZero: {
      type: 'long',
      _meta: { description: 'Risk score docs written during reset-to-zero stage' },
    },
    pagesProcessed: {
      type: 'long',
      _meta: { description: 'Number of base-scoring pages processed' },
    },
    lookupPrunedDocs: {
      type: 'long',
      _meta: { description: 'Lookup docs pruned after reset-to-zero cleanup' },
    },
    idBasedRiskScoringEnabled: {
      type: 'boolean',
      _meta: { description: 'Whether Entity Store dual-write was enabled' },
    },
  },
};

export const RISK_SCORE_MAINTAINER_STAGE_SUMMARY_EVENT: EventTypeOpts<RiskScoreMaintainerStageSummaryEvent> =
  {
    eventType: 'risk_score_maintainer_stage_summary',
    schema: {
      namespace: { type: 'keyword', _meta: { description: 'Kibana space where scoring ran' } },
      entityType: {
        type: 'keyword',
        _meta: { description: 'Entity type scored (e.g. host, user)' },
      },
      stage: { type: 'keyword', _meta: { description: 'Maintainer stage identifier' } },
      status: { type: 'keyword', _meta: { description: 'Stage outcome status' } },
      skipReason: {
        type: 'keyword',
        _meta: { optional: true, description: 'Bounded reason when status is skipped' },
      },
      errorKind: {
        type: 'keyword',
        _meta: { optional: true, description: 'Bounded error category when status is error' },
      },
      durationMs: { type: 'long', _meta: { description: 'Stage duration in milliseconds' } },
      pagesProcessed: {
        type: 'long',
        _meta: { optional: true, description: 'Number of pages processed in this stage' },
      },
      scoresWritten: {
        type: 'long',
        _meta: { optional: true, description: 'Risk score docs written in this stage' },
      },
      scoresMissingFromStore: {
        type: 'long',
        _meta: {
          optional: true,
          description:
            'Raw count of base-scoring scores whose entity_id was absent from the entity store at lookup time, before any create-if-missing attempt (phase1_base_scoring only)',
        },
      },
      entitiesCreated: {
        type: 'long',
        _meta: {
          optional: true,
          description:
            'Entities created by the create-if-missing path during base scoring (phase1_base_scoring only)',
        },
      },
      entityCreationsSkipped: {
        type: 'long',
        _meta: {
          optional: true,
          description:
            'not_in_store scores the create-if-missing path never attempted to write during base scoring: no representative alert document was found, or the creation policy rejected the candidate',
        },
      },
      entityCreationsFailed: {
        type: 'long',
        _meta: {
          optional: true,
          description:
            'not_in_store scores that were policy-eligible but did not end up written during base scoring: the re-derived EUID did not match the score, a reserved field was supplied, or the bulk create itself failed',
        },
      },
      entitiesIterated: {
        type: 'long',
        _meta: {
          optional: true,
          description: 'Entity-store entities iterated during lookup build',
        },
      },
      lookupRowsWritten: {
        type: 'long',
        _meta: { optional: true, description: 'Lookup rows written during lookup build' },
      },
      bulkBatches: {
        type: 'long',
        _meta: { optional: true, description: 'Bulk batches issued during Phase 0 lookup build' },
      },
      lookupRowsFailed: {
        type: 'long',
        _meta: {
          optional: true,
          description: 'Bulk items that failed during Phase 0 lookup build',
        },
      },
      resetBatchLimitHit: {
        type: 'boolean',
        _meta: { optional: true, description: 'Whether reset-to-zero hit per-run batch limit' },
      },
      idBasedRiskScoringEnabled: {
        type: 'boolean',
        _meta: { description: 'Whether Entity Store dual-write was enabled' },
      },
    },
  };

interface AssetCriticalitySystemProcessedAssignmentFileEvent {
  processing: {
    startTime: string;
    endTime: string;
    tookMs: number;
  };
  result?: BulkUpsertAssetCriticalityRecordsResponse['stats'] & { unmatched?: number };
  status: 'success' | 'partial_success' | 'fail';
}

export const ASSET_CRITICALITY_SYSTEM_PROCESSED_ASSIGNMENT_FILE_EVENT: EventTypeOpts<AssetCriticalitySystemProcessedAssignmentFileEvent> =
  {
    eventType: 'Asset Criticality Csv Upload Processed',
    schema: {
      processing: {
        properties: {
          startTime: { type: 'date', _meta: { description: 'Processing start time' } },
          endTime: { type: 'date', _meta: { description: 'Processing end time' } },
          tookMs: { type: 'long', _meta: { description: 'How long processing took ms' } },
        },
      },
      result: {
        properties: {
          successful: {
            type: 'long',
            _meta: { description: 'Number of criticality records successfully created or updated' },
          },
          failed: {
            type: 'long',
            _meta: { description: 'Number of criticality records which had errors' },
          },
          unmatched: {
            type: 'long',
            _meta: {
              optional: true,
              description:
                'Number of criticality records which did not match any entities to update',
            },
          },
          total: { type: 'long', _meta: { description: 'Total number of lines in the file' } },
        },
      },
      status: {
        type: 'keyword',
        _meta: { description: 'Status of the processing either success, partial_success or fail' },
      },
    },
  };

export const FIELD_RETENTION_ENRICH_POLICY_EXECUTION_EVENT: EventTypeOpts<{
  duration: number;
  interval: string;
}> = {
  eventType: 'field_retention_enrich_policy_execution',
  schema: {
    duration: {
      type: 'long',
      _meta: {
        description: 'Duration (in seconds) of the field retention enrich policy execution time',
      },
    },
    interval: {
      type: 'keyword',
      _meta: {
        description: 'Configured interval for the field retention enrich policy task',
      },
    },
  },
};

export const ENTITY_STORE_DATA_VIEW_REFRESH_EXECUTION_EVENT: EventTypeOpts<{
  duration: number;
  interval: string;
}> = {
  eventType: 'entity_store_data_view_refresh_execution_event',
  schema: {
    duration: {
      type: 'long',
      _meta: {
        description: 'Duration (in seconds) of the entity store data view refresh execution time',
      },
    },
    interval: {
      type: 'keyword',
      _meta: {
        description: 'Configured interval for the entity store data view refresh task',
      },
    },
  },
};

export const ENTITY_STORE_SNAPSHOT_TASK_EXECUTION_EVENT: EventTypeOpts<{
  entityType: string;
  namespace: string;
  snapshotDate: Date;
  snapshotIndex: string;
  entityCount: number;
  durationMs: number;
  success: boolean;
  errorMessage: string | undefined;
}> = {
  eventType: 'entity_store_data_view_refresh_execution',
  schema: {
    entityType: {
      type: 'keyword',
      _meta: {
        description: 'Type of entities stored (e.g. "host")',
      },
    },
    namespace: {
      type: 'keyword',
      _meta: {
        description: 'Namespace where the entities are stored (e.g. "default")',
      },
    },
    snapshotDate: {
      type: 'date',
      _meta: {
        description:
          'Snapshot date marks the date on which the entities were captured (the day before the task run)',
      },
    },
    snapshotIndex: {
      type: 'keyword',
      _meta: {
        description: 'Name of the index containing captured entities',
      },
    },
    entityCount: {
      type: 'long',
      _meta: {
        description: 'Number of entities captured in the snapshot',
      },
    },
    durationMs: {
      type: 'long',
      _meta: {
        description:
          'Duration (in milliseconds) of the entity store data view refresh execution time',
      },
    },
    success: {
      type: 'boolean',
      _meta: {
        description: 'True if the task run was completed succesfully, false otherwise',
      },
    },
    errorMessage: {
      type: 'keyword',
      _meta: {
        optional: true,
        description: 'Contains the error message in case the task run failed (success: false)',
      },
    },
  },
};

export const ENTITY_ENGINE_RESOURCE_INIT_FAILURE_EVENT: EventTypeOpts<{
  error: string;
}> = {
  eventType: 'entity_engine_resource_init_failure',
  schema: {
    error: {
      type: 'keyword',
      _meta: {
        description: 'Error message for a resource initialization failure',
      },
    },
  },
};

export const ENTITY_ENGINE_INITIALIZATION_EVENT: EventTypeOpts<{
  duration: number;
  entityType: string;
  namespace: string;
}> = {
  eventType: 'entity_engine_initialization',
  schema: {
    duration: {
      type: 'long',
      _meta: {
        description: 'Duration (in seconds) of the entity engine initialization',
      },
    },
    entityType: {
      type: 'keyword',
      _meta: {
        description: 'Type of entities stored (e.g. "host")',
      },
    },
    namespace: {
      type: 'keyword',
      _meta: {
        description: 'Namespace where the entities are stored (e.g. "default")',
      },
    },
  },
};

export const ENTITY_ENGINE_DELETION_EVENT: EventTypeOpts<{
  duration: number;
  entityType: string;
  namespace: string;
}> = {
  eventType: 'entity_engine_deletion',
  schema: {
    duration: {
      type: 'long',
      _meta: {
        description: 'Duration (in seconds) of the entity engine deletion',
      },
    },
    entityType: {
      type: 'keyword',
      _meta: {
        description: 'Type of entities stored (e.g. "host")',
      },
    },
    namespace: {
      type: 'keyword',
      _meta: {
        description: 'Namespace where the entities are stored (e.g. "default")',
      },
    },
  },
};

export const ENTITY_HIGHLIGHTS_USAGE_EVENT: EventTypeOpts<{
  entityType: string;
  spaceId: string;
}> = {
  eventType: 'entity_highlights_usage',
  schema: {
    entityType: {
      type: 'keyword',
      _meta: {
        description: 'Type of entity highlights have been request for  (e.g. "host")',
      },
    },
    spaceId: {
      type: 'keyword',
      _meta: {
        description: 'Space where the highlight request originated (e.g. "default")',
      },
    },
  },
};

export const ENTITY_AI_SUMMARY_PERSISTED_EVENT: EventTypeOpts<{
  entityType: string;
  spaceId: string;
  highlightsCount: number;
  recommendedActionsCount: number;
}> = {
  eventType: 'entity_ai_summary_persisted',
  schema: {
    entityType: {
      type: 'keyword',
      _meta: {
        description: 'Type of entity the AI summary was generated for (e.g. "host")',
      },
    },
    spaceId: {
      type: 'keyword',
      _meta: {
        description: 'Space where the summary was persisted (e.g. "default")',
      },
    },
    highlightsCount: {
      type: 'long',
      _meta: {
        description:
          'Number of highlights the model produced (pre-cap), captured client-side before capping. Compare against MAX_ENTITY_SUMMARY_HIGHLIGHTS to see how often/by how much the model overshoots.',
      },
    },
    recommendedActionsCount: {
      type: 'long',
      _meta: {
        description:
          'Number of recommended actions the model produced (pre-cap), captured client-side before capping. Compare against MAX_ENTITY_SUMMARY_RECOMMENDED_ACTIONS to gauge overshoot.',
      },
    },
  },
};

export const ENTITY_ANALYTICS_AI_TOOL_USAGE_EVENT: EventTypeOpts<{
  actionType?: 'read' | 'mutation';
  /**
   * @deprecated Use `resultCount` instead. Retained in the schema so historical
   * rows (written before the rename) can still be queried in BigQuery; no tool
   * populates this field anymore — dashboards should `COALESCE(resultCount, entitiesReturned)`.
   */
  entitiesReturned?: number;
  entityTypes?: string[];
  errorMessage?: string;
  userConfirmationOutcome?: ConfirmationStatus;
  resultCount?: number;
  spaceId: string;
  success: boolean;
  toolId: string;
}> = {
  eventType: 'entity_ai_tool_usage',
  schema: {
    toolId: {
      type: 'keyword',
      _meta: {
        description: 'ID of the agent tool being used (e.g. "security.get_entity")',
      },
    },
    actionType: {
      type: 'keyword',
      _meta: {
        optional: true,
        description:
          'Whether the tool call reads data or mutates state ("read" | "mutation"). Omitted for legacy events emitted before this field was introduced.',
      },
    },
    entityTypes: {
      type: 'array',
      items: {
        type: 'keyword',
        _meta: {
          description: 'Type of entity the tool was called for (e.g. "host")',
        },
      },
      _meta: {
        optional: true,
        description:
          'Entity types the tool was called for (e.g. ["host", "user"]). Not populated for tools that do not operate on a specific entity type (e.g. watchlist and lead tools).',
      },
    },
    spaceId: {
      type: 'keyword',
      _meta: {
        description: 'Space where the tool invocation originated (e.g. "default")',
      },
    },
    success: {
      type: 'boolean',
      _meta: {
        description: 'Whether the tool usage was successful or not',
      },
    },
    entitiesReturned: {
      type: 'long',
      _meta: {
        optional: true,
        description:
          'Deprecated — use `resultCount` instead. Historical field populated by `get_entity` / `search_entities` before the rename; no tool populates it anymore. Kept in the schema so historical rows remain queryable.',
      },
    },
    resultCount: {
      type: 'long',
      _meta: {
        optional: true,
        description:
          'Number of items returned or affected by the tool (entities, watchlists, leads, entities added to a watchlist, …). Replaces `entitiesReturned` for tools whose result set is not "entities". Not populated for tools that do not return a countable result set (e.g. single-record mutations).',
      },
    },
    userConfirmationOutcome: {
      type: 'keyword',
      _meta: {
        optional: true,
        description:
          'For HITL-gated mutation tools: "accepted" or "rejected" once the user has responded to the confirmation prompt, or "unprompted" if the tool resolved to a final answer without asking. Omitted entirely for tools that do not require a HITL prompt.',
      },
    },
    errorMessage: {
      type: 'keyword',
      _meta: {
        optional: true,
        description: 'Contains the error message in case the tool usage was not successful',
      },
    },
  },
};

export const ENTITY_STORE_API_CALL_EVENT: EventTypeOpts<{
  endpoint: string;
  error?: string;
}> = {
  eventType: 'entity_store_api_call',
  schema: {
    endpoint: {
      type: 'keyword',
      _meta: {
        description: 'Name of the endpoint called',
      },
    },
    error: {
      type: 'keyword',
      _meta: {
        optional: true,
        description: 'Contains error message in case the call failed',
      },
    },
  },
};

export const PRIVMON_ENGINE_INITIALIZATION_EVENT: EventTypeOpts<{
  duration: number;
}> = {
  eventType: 'privmon_engine_initialization',
  schema: {
    duration: {
      type: 'long',
      _meta: {
        description: 'Duration (in seconds) of the privilege monitoring engine initialization',
      },
    },
  },
};

export const PRIVMON_ENGINE_RESOURCE_INIT_FAILURE_EVENT: EventTypeOpts<{
  error: string;
}> = {
  eventType: 'privmon_engine_resource_init_failure',
  schema: {
    error: {
      type: 'keyword',
      _meta: {
        description: 'Error message for a resource initialization failure',
      },
    },
  },
};

export type AttacksApiCallOperation = 'search' | 'tags' | 'assignees' | 'status';

export const ATTACKS_API_CALL_EVENT: EventTypeOpts<{
  endpoint: string;
  operation: AttacksApiCallOperation;
  ids_count?: number;
  update_related_alerts?: boolean;
  tags_to_add_count?: number;
  tags_to_remove_count?: number;
  assignees_to_add_count?: number;
  assignees_to_remove_count?: number;
  status?: string;
  has_aggregations?: boolean;
  has_ids_filter?: boolean;
  error?: string;
}> = {
  eventType: 'attacks_api_call',
  schema: {
    endpoint: {
      type: 'keyword',
      _meta: { description: 'The attacks API route path that was called' },
    },
    operation: {
      type: 'keyword',
      _meta: { description: 'The attacks API operation: search, tags, assignees, or status' },
    },
    ids_count: {
      type: 'long',
      _meta: { optional: true, description: 'Number of attack IDs in the request' },
    },
    update_related_alerts: {
      type: 'boolean',
      _meta: {
        optional: true,
        description: 'Whether related detection alerts were also updated',
      },
    },
    tags_to_add_count: {
      type: 'long',
      _meta: { optional: true, description: 'Number of tags to add' },
    },
    tags_to_remove_count: {
      type: 'long',
      _meta: { optional: true, description: 'Number of tags to remove' },
    },
    assignees_to_add_count: {
      type: 'long',
      _meta: { optional: true, description: 'Number of assignees to add' },
    },
    assignees_to_remove_count: {
      type: 'long',
      _meta: { optional: true, description: 'Number of assignees to remove' },
    },
    status: {
      type: 'keyword',
      _meta: { optional: true, description: 'Workflow status value being set' },
    },
    has_aggregations: {
      type: 'boolean',
      _meta: { optional: true, description: 'Whether the search request included aggregations' },
    },
    has_ids_filter: {
      type: 'boolean',
      _meta: { optional: true, description: 'Whether the search request filtered by IDs' },
    },
    error: {
      type: 'keyword',
      _meta: { optional: true, description: 'Error message if the call failed' },
    },
  },
};

export const WATCHLIST_API_CALL_EVENT: EventTypeOpts<{
  endpoint: string;
  watchlist_id?: string;
  watchlist_name?: string;
  risk_modifier?: number;
  is_managed?: boolean;
  entity_source_count?: number;
  entity_source_types?: string[];
  error?: string;
}> = {
  eventType: 'watchlist_api_call',
  schema: {
    endpoint: {
      type: 'keyword',
      _meta: { description: 'The watchlist route path that was called' },
    },
    watchlist_id: {
      type: 'keyword',
      _meta: { optional: true, description: 'The ID of the watchlist' },
    },
    watchlist_name: {
      type: 'keyword',
      _meta: {
        optional: true,
        description: 'Name of the watchlist, only captured for managed/prebuilt watchlists',
      },
    },
    risk_modifier: {
      type: 'float',
      _meta: { optional: true, description: 'Risk modifier value applied to the watchlist (0–2)' },
    },
    is_managed: {
      type: 'boolean',
      _meta: {
        optional: true,
        description: 'Whether the watchlist is a managed/prebuilt watchlist',
      },
    },
    entity_source_count: {
      type: 'integer',
      _meta: { optional: true, description: 'Number of entity sources linked at creation time' },
    },
    entity_source_types: {
      type: 'array',
      items: {
        type: 'keyword',
        _meta: {
          description: 'Type of entity source (index, entity_analytics_integration, store)',
          optional: false,
        },
      },
      _meta: { optional: true, description: 'Types of entity sources linked at creation time' },
    },
    error: {
      type: 'keyword',
      _meta: { optional: true, description: 'Error message if the call failed' },
    },
  },
};

export const ALERT_SUPPRESSION_EVENT: EventTypeOpts<{
  suppressionAlertsCreated: number;
  suppressionAlertsSuppressed: number;
  suppressionRuleName: string;
  suppressionDuration: number;
  suppressionGroupByFieldsNumber: number;
  suppressionGroupByFields: string[];
  suppressionRuleType: string;
  suppressionMissingFields: boolean;
  suppressionRuleId: string;
}> = {
  eventType: 'alert_suppression_on_rule_execution',
  schema: {
    suppressionAlertsCreated: {
      type: 'long',
      _meta: {
        description:
          'Number of alerts created during rule execution with configured alert suppression',
      },
    },
    suppressionAlertsSuppressed: {
      type: 'long',
      _meta: {
        description:
          'Number of alerts suppressed during rule execution with configured alert suppression',
      },
    },
    suppressionRuleName: {
      type: 'keyword',
      _meta: {
        description: 'Name of rule',
      },
    },
    suppressionDuration: {
      type: 'long',
      _meta: {
        description: 'Duration in seconds of suppression period. -1 for per rule execution config',
      },
    },
    suppressionGroupByFieldsNumber: {
      type: 'long',
      _meta: {
        description: 'Number of Suppress by fields',
      },
    },
    suppressionGroupByFields: {
      type: 'array',
      items: {
        type: 'keyword',
        _meta: {
          description: 'Tag attached to the element...',
          optional: false,
        },
      },
      _meta: {
        description: 'List of tags attached to the element...',
        optional: false,
      },
    },
    suppressionRuleType: {
      type: 'keyword',
      _meta: {
        description: 'Rule type',
      },
    },
    suppressionMissingFields: {
      type: 'boolean',
      _meta: {
        description: 'Suppression of missing fields enabled',
      },
    },
    suppressionRuleId: {
      type: 'keyword',
      _meta: {
        description: 'ruleId',
      },
    },
  },
};

export const TELEMETRY_DATA_STREAM_EVENT: EventTypeOpts<DataStreams> = {
  eventType: 'telemetry_data_stream_event',
  schema: {
    items: {
      type: 'array',
      items: {
        properties: {
          datastream_name: {
            type: 'keyword',
            _meta: { description: 'Name of the data stream' },
          },
          ilm_policy: {
            type: 'keyword',
            _meta: { optional: true, description: 'ILM policy associated to the datastream' },
          },
          template: {
            type: 'keyword',
            _meta: { optional: true, description: 'Template associated to the datastream' },
          },
          indices: {
            type: 'array',
            items: {
              properties: {
                index_name: { type: 'date', _meta: { description: 'Index name' } },
                ilm_policy: { type: 'date', _meta: { optional: true, description: 'ILM policy' } },
              },
            },
            _meta: { optional: true, description: 'Indices associated with the data stream' },
          },
        },
      },
      _meta: { description: 'Datastream settings' },
    },
  },
};

export const TELEMETRY_INDEX_STATS_EVENT: EventTypeOpts<IndicesStats> = {
  eventType: 'telemetry_index_stats_event',
  schema: {
    items: {
      type: 'array',
      items: {
        properties: {
          index_name: {
            type: 'keyword',
            _meta: { description: 'The name of the index being monitored.' },
          },

          query_total: {
            type: 'long',
            _meta: {
              optional: true,
              description: 'The total number of search queries executed on the index.',
            },
          },
          query_time_in_millis: {
            type: 'long',
            _meta: {
              optional: true,
              description:
                'The total time spent on query execution across all search requests, measured in milliseconds.',
            },
          },

          docs_count_primaries: {
            type: 'long',
            _meta: {
              optional: true,
              description:
                'The total number of documents currently stored in the index (primary shards).',
            },
          },
          docs_deleted_primaries: {
            type: 'long',
            _meta: {
              optional: true,
              description:
                'The total number of documents that have been marked as deleted in the index (primary shards).',
            },
          },
          docs_total_size_in_bytes_primaries: {
            type: 'long',
            _meta: {
              optional: true,
              description:
                'The total size, in bytes, of all documents stored in the index, including storage overhead (primary shards).',
            },
          },

          docs_count: {
            type: 'long',
            _meta: {
              optional: true,
              description:
                'The total number of documents currently stored in the index (primary and replica shards).',
            },
          },
          docs_deleted: {
            type: 'long',
            _meta: {
              optional: true,
              description:
                'The total number of documents that have been marked as deleted in the index (primary and replica shards).',
            },
          },
          docs_total_size_in_bytes: {
            type: 'long',
            _meta: {
              optional: true,
              description:
                'The total size, in bytes, of all documents stored in the index, including storage overhead (primary and replica shards).',
            },
          },

          index_failed: {
            type: 'long',
            _meta: {
              optional: true,
              description:
                'The total number of documents failed to index (primary and replica shards).',
            },
          },
          index_failed_due_to_version_conflict: {
            type: 'long',
            _meta: {
              optional: true,
              description:
                'The total number of documents failed to index due to version conflict (primary and replica shards).',
            },
          },
        },
      },
      _meta: { description: 'Index stats' },
    },
  },
};

export const TELEMETRY_INDEX_SETTINGS_EVENT: EventTypeOpts<IndicesSettings> = {
  eventType: 'telemetry_index_settings_event',
  schema: {
    items: {
      type: 'array',
      items: {
        properties: {
          index_name: {
            type: 'keyword',
            _meta: { description: 'The name of the index.' },
          },
          index_mode: {
            type: 'keyword',
            _meta: { optional: true, description: 'Index mode.' },
          },
          source_mode: {
            type: 'keyword',
            _meta: { optional: true, description: 'Source mode.' },
          },
          default_pipeline: {
            type: 'keyword',
            _meta: {
              optional: true,
              description: 'Pipeline applied if no pipeline parameter specified when indexing.',
            },
          },
          final_pipeline: {
            type: 'keyword',
            _meta: {
              optional: true,
              description:
                'Pipeline applied to the document at the end of the indexing process, after the document has been indexed.',
            },
          },
        },
      },
      _meta: { description: 'Index settings' },
    },
  },
};

export const TELEMETRY_ILM_POLICY_EVENT: EventTypeOpts<IlmPolicies> = {
  eventType: 'telemetry_ilm_policy_event',
  schema: {
    items: {
      type: 'array',
      items: {
        properties: {
          policy_name: {
            type: 'keyword',
            _meta: { description: 'The name of the ILM policy.' },
          },
          modified_date: {
            type: 'date',
            _meta: { description: 'The date when the ILM policy was last modified.' },
          },
          phases: {
            properties: {
              cold: {
                properties: {
                  min_age: {
                    type: 'text',
                    _meta: {
                      description:
                        'The minimum age before the index transitions to the "cold" phase.',
                    },
                  },
                },
                _meta: {
                  optional: true,
                  description:
                    'Configuration settings for the "cold" phase of the ILM policy, applied when data is infrequently accessed.',
                },
              },
              delete: {
                properties: {
                  min_age: {
                    type: 'text',
                    _meta: {
                      description:
                        'The minimum age before the index transitions to the "delete" phase.',
                    },
                  },
                },
                _meta: {
                  optional: true,
                  description:
                    'Configuration settings for the "delete" phase of the ILM policy, specifying when the index should be removed.',
                },
              },
              frozen: {
                properties: {
                  min_age: {
                    type: 'text',
                    _meta: {
                      description:
                        'The minimum age before the index transitions to the "frozen" phase.',
                    },
                  },
                },
                _meta: {
                  optional: true,
                  description:
                    'Configuration settings for the "frozen" phase of the ILM policy, where data is fully searchable but stored with a reduced resource footprint.',
                },
              },
              hot: {
                properties: {
                  min_age: {
                    type: 'text',
                    _meta: {
                      description:
                        'The minimum age before the index transitions to the "hot" phase.',
                    },
                  },
                },
                _meta: {
                  optional: true,
                  description:
                    'Configuration settings for the "hot" phase of the ILM policy, applied to actively written and queried data.',
                },
              },
              warm: {
                properties: {
                  min_age: {
                    type: 'text',
                    _meta: {
                      description:
                        'The minimum age before the index transitions to the "warm" phase.',
                    },
                  },
                },
                _meta: {
                  optional: true,
                  description:
                    'Configuration settings for the "warm" phase of the ILM policy, used for read-only data that is less frequently accessed.',
                },
              },
            },
            _meta: {
              description:
                'The different phases of the ILM policy that define how the index is managed over time.',
            },
          },
        },
      },
      _meta: { description: 'ILM policies' },
    },
  },
};

export const TELEMETRY_ILM_STATS_EVENT: EventTypeOpts<IlmsStats> = {
  eventType: 'telemetry_ilm_stats_event',
  schema: {
    items: {
      type: 'array',
      items: {
        properties: {
          index_name: {
            type: 'keyword',
            _meta: { description: 'The name of the index currently managed by the ILM  policy.' },
          },
          phase: {
            type: 'keyword',
            _meta: {
              optional: true,
              description:
                'The current phase of the ILM policy that the index is in (e.g., hot, warm, cold, frozen, or delete).',
            },
          },
          age: {
            type: 'text',
            _meta: {
              optional: true,
              description:
                'The age of the index since its creation, indicating how long it has existed.',
            },
          },
          policy_name: {
            type: 'keyword',
            _meta: {
              optional: true,
              description: 'The name of the ILM policy applied to this index.',
            },
          },
        },
      },
      _meta: { description: 'ILM stats' },
    },
  },
};

export const TELEMETRY_INDEX_TEMPLATES_EVENT: EventTypeOpts<IndexTemplatesStats> = {
  eventType: 'telemetry_index_templates_event',
  schema: {
    items: {
      type: 'array',
      items: {
        properties: {
          template_name: {
            type: 'keyword',
            _meta: { description: 'The name of the template.' },
          },
          index_mode: {
            type: 'keyword',
            _meta: {
              optional: true,
              description: 'The index mode.',
            },
          },
          datastream: {
            type: 'boolean',
            _meta: {
              description: 'Datastream dataset',
            },
          },
          package_name: {
            type: 'keyword',
            _meta: {
              optional: true,
              description: 'The package name',
            },
          },
          managed_by: {
            type: 'keyword',
            _meta: {
              optional: true,
              description: 'Managed by',
            },
          },
          beat: {
            type: 'keyword',
            _meta: {
              optional: true,
              description: 'Shipper name',
            },
          },
          is_managed: {
            type: 'boolean',
            _meta: {
              optional: true,
              description: 'Whether the template is managed',
            },
          },
          composed_of: {
            type: 'array',
            items: {
              type: 'keyword',
              _meta: {
                description: 'List of template components',
              },
            },
            _meta: { description: '' },
          },
          source_enabled: {
            type: 'boolean',
            _meta: {
              optional: true,
              description:
                'The _source field contains the original JSON document body that was provided at index time',
            },
          },
          source_includes: {
            type: 'array',
            items: {
              type: 'keyword',
              _meta: {
                description: 'Fields included in _source, if enabled',
              },
            },
            _meta: { description: '' },
          },
          source_excludes: {
            type: 'array',
            items: {
              type: 'keyword',
              _meta: {
                description: '',
              },
            },
            _meta: { description: 'Fields excludes from _source, if enabled' },
          },
        },
      },
      _meta: { description: 'Index templates info' },
    },
  },
};

export const TELEMETRY_NODE_INGEST_PIPELINES_STATS_EVENT: EventTypeOpts<NodeIngestPipelinesStats> =
  {
    eventType: 'telemetry_node_ingest_pipelines_stats_event',
    schema: {
      name: {
        type: 'keyword',
        _meta: { description: 'The name of the node' },
      },
      pipelines: {
        type: 'array',
        items: {
          properties: {
            name: {
              type: 'keyword',
              _meta: { description: 'The name of the pipeline.' },
            },
            totals: {
              properties: {
                count: {
                  type: 'long',
                  _meta: {
                    description:
                      'Total number of documents ingested during the lifetime of this node.',
                  },
                },
                time_in_millis: {
                  type: 'long',
                  _meta: {
                    description: 'Ingestion elapsed time during the lifetime of this node.',
                  },
                },
                current: {
                  type: 'long',
                  _meta: { description: 'Total number of documents currently being ingested.' },
                },
                failed: {
                  type: 'long',
                  _meta: {
                    description:
                      'Total number of failed ingest operations during the lifetime of this node.',
                  },
                },
              },
            },
            processors: {
              type: 'array',
              items: {
                properties: {
                  name: {
                    type: 'keyword',
                    _meta: { description: 'The name of the pipeline.' },
                  },
                  totals: {
                    properties: {
                      count: {
                        type: 'long',
                        _meta: {
                          description:
                            'Total number of documents ingested during the lifetime of this node.',
                        },
                      },
                      time_in_millis: {
                        type: 'long',
                        _meta: {
                          description: 'Ingestion elapsed time during the lifetime of this node.',
                        },
                      },
                      current: {
                        type: 'long',
                        _meta: {
                          description: 'Total number of documents currently being ingested.',
                        },
                      },
                      failed: {
                        type: 'long',
                        _meta: {
                          description:
                            'Total number of failed ingest operations during the lifetime of this node.',
                        },
                      },
                    },
                  },
                },
                _meta: { description: 'Datastreams' },
              },
            },
          },
          _meta: { description: 'Datastreams' },
        },
      },
      totals: {
        properties: {
          count: {
            type: 'long',
            _meta: {
              description: 'Total number of documents ingested during the lifetime of this node.',
            },
          },
          time_in_millis: {
            type: 'long',
            _meta: { description: 'Ingestion elapsed time during the lifetime of this node.' },
          },
          current: {
            type: 'long',
            _meta: { description: 'Total number of documents currently being ingested.' },
          },
          failed: {
            type: 'long',
            _meta: {
              description:
                'Total number of failed ingest operations during the lifetime of this node.',
            },
          },
        },
      },
    },
  };

export const TELEMETRY_HEALTH_DIAGNOSTIC_QUERY_RESULT_EVENT: EventTypeOpts<HealthDiagnosticQueryResult> =
  {
    eventType: 'telemetry_health_diagnostic_query_result_event',
    schema: {
      name: {
        type: 'keyword',
        _meta: { description: 'Identifier for the executed query.' },
      },
      queryId: {
        type: 'keyword',
        _meta: { description: 'Unique identifier for the specific query.' },
      },
      traceId: {
        type: 'keyword',
        _meta: { description: 'Unique trace ID for correlating a single query execution.' },
      },
      page: {
        type: 'integer',
        _meta: { description: 'Page number of the query result.' },
      },
      data: {
        type: 'pass_through',
        _meta: { description: 'Raw query result payload.' },
      },
    },
  };
export const TELEMETRY_HEALTH_DIAGNOSTIC_QUERY_STATS_EVENT: EventTypeOpts<HealthDiagnosticQueryStats> =
  {
    eventType: 'telemetry_health_diagnostic_query_stats_event',
    schema: {
      name: {
        type: 'keyword',
        _meta: { description: 'Identifier for the executed query.' },
      },
      traceId: {
        type: 'keyword',
        _meta: { description: 'Unique trace ID for correlating a single query execution.' },
      },
      numDocs: {
        type: 'integer',
        _meta: { description: 'Number of documents returned by the query.' },
      },
      passed: {
        type: 'boolean',
        _meta: { description: 'Indicates whether the query completed successfully.' },
      },
      started: {
        type: 'keyword',
        _meta: { description: 'When the query started execution.' },
      },
      finished: {
        type: 'keyword',
        _meta: { description: 'When the query finished execution.' },
      },
      failure: {
        properties: {
          message: {
            type: 'keyword',
            _meta: { description: 'A high-level failure message describing the error.' },
          },
          reason: {
            properties: {
              circuitBreaker: {
                type: 'keyword',
                _meta: {
                  description: 'The name of the circuit breaker that triggered the failure.',
                },
              },
              valid: {
                type: 'boolean',
                _meta: {
                  description: 'Indicates whether the query execution was considered valid.',
                },
              },
              message: {
                type: 'keyword',
                _meta: {
                  optional: true,
                  description:
                    'A detailed reason or message explaining why the circuit breaker was triggered.',
                },
              },
            },
            _meta: {
              optional: true,
              description: 'Reason for the failure if the query execution was unsuccessful.',
            },
          },
        },
        _meta: {
          optional: true,
          description: 'Details about the failure if the operation was unsuccessful.',
        },
      },
      fieldNames: {
        type: 'array',
        items: {
          type: 'keyword',
          _meta: {
            description: 'Field names in the query result.',
          },
        },
      },
      circuitBreakers: {
        type: 'pass_through',
        _meta: {
          optional: true,
          description: 'Circuit breaker metrics such as execution time and memory usage.',
        },
      },
      descriptorVersion: {
        type: 'integer',
        _meta: {
          description: 'Version of the query descriptor that produced this event.',
        },
      },
      status: {
        type: 'keyword',
        _meta: {
          description: "Execution status: 'success', 'failed', or 'skipped'.",
        },
      },
      skipReason: {
        type: 'keyword',
        _meta: {
          optional: true,
          description:
            "Reason for skipping: 'datastreams_not_matched', 'integration_not_installed' or 'unknown_version'.",
        },
      },
      integration: {
        properties: {
          name: {
            type: 'keyword',
            _meta: { description: 'Name of the matched integration.' },
          },
          version: {
            type: 'keyword',
            _meta: { description: 'Version of the matched integration.' },
          },
          indices: {
            type: 'array',
            items: {
              type: 'keyword',
              _meta: { description: 'Index patterns for this integration after type filtering.' },
            },
          },
        },
        _meta: {
          optional: true,
          description: 'Integration resolution metadata. Present only for v2 query descriptors.',
        },
      },
    },
  };

interface CreateAssetCriticalityProcessedFileEvent {
  result?: BulkUpsertAssetCriticalityRecordsResponse['stats'];
  startTime: Date;
  endTime: Date;
}

export const createAssetCriticalityProcessedFileEvent = ({
  result,
  startTime,
  endTime,
}: CreateAssetCriticalityProcessedFileEvent): [
  string,
  AssetCriticalitySystemProcessedAssignmentFileEvent
] => {
  const status = getUploadStatus(result);

  const processing = {
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    tookMs: endTime.getTime() - startTime.getTime(),
  };

  return [
    ASSET_CRITICALITY_SYSTEM_PROCESSED_ASSIGNMENT_FILE_EVENT.eventType,
    {
      processing,
      result,
      status,
    },
  ];
};

const getUploadStatus = (stats?: BulkUpsertAssetCriticalityRecordsResponse['stats']) => {
  if (!stats) {
    return 'fail';
  }

  if (stats.failed === 0) {
    return 'success';
  }

  if (stats.successful > 0) {
    return 'partial_success';
  }

  return 'fail';
};

export const ENDPOINT_RESPONSE_ACTION_SENT_ERROR_EVENT: EventTypeOpts<{
  responseActions: {
    agentType: ResponseActionAgentType;
    command: ResponseActionsApiCommandNames;
    error: string;
  };
}> = {
  eventType: 'endpoint_response_action_sent_error',
  schema: {
    responseActions: {
      properties: {
        agentType: {
          type: 'keyword',
          _meta: {
            description: 'The type of agent that the action was sent to',
            optional: false,
          },
        },
        command: {
          type: 'keyword',
          _meta: {
            description: 'The command that was sent to the endpoint',
            optional: false,
          },
        },
        error: {
          type: 'text',
          _meta: {
            description: 'The error message for the response action',
          },
        },
      },
    },
  },
};

export const ENDPOINT_RESPONSE_ACTION_SENT_EVENT: EventTypeOpts<{
  responseActions: {
    actionId: string;
    agentType: ResponseActionAgentType;
    command: ResponseActionsApiCommandNames;
    isAutomated: boolean;
  };
}> = {
  eventType: 'endpoint_response_action_sent',
  schema: {
    responseActions: {
      properties: {
        actionId: {
          type: 'keyword',
          _meta: {
            description: 'The ID of the action that was sent to the endpoint',
            optional: false,
          },
        },
        agentType: {
          type: 'keyword',
          _meta: {
            description: 'The type of agent that the action was sent to',
            optional: false,
          },
        },
        command: {
          type: 'keyword',
          _meta: {
            description: 'The command that was sent to the endpoint',
            optional: false,
          },
        },
        isAutomated: {
          type: 'boolean',
          _meta: {
            description: 'Whether the action was auto-initiated by a pre-configured rule',
            optional: false,
          },
        },
      },
    },
  },
};

export const ENDPOINT_RESPONSE_ACTION_STATUS_CHANGE_EVENT: EventTypeOpts<{
  responseActions: {
    actionId: string;
    agentType: ResponseActionAgentType;
    actionStatus: ResponseActionStatus;
    command: ResponseActionsApiCommandNames;
  };
}> = {
  eventType: 'endpoint_response_action_status_change_event',
  schema: {
    responseActions: {
      properties: {
        actionId: {
          type: 'keyword',
          _meta: {
            description: 'The ID of the action that was sent to the endpoint',
            optional: false,
          },
        },
        agentType: {
          type: 'keyword',
          _meta: {
            description: 'The type of agent that the action was sent to',
            optional: false,
          },
        },
        actionStatus: {
          type: 'keyword',
          _meta: {
            description: 'The status of the action',
            optional: false,
          },
        },
        command: {
          type: 'keyword',
          _meta: {
            description: 'The command that was sent to the endpoint',
            optional: false,
          },
        },
      },
    },
  },
};

export const ENDPOINT_WORKFLOW_INSIGHTS_REMEDIATED_EVENT: EventTypeOpts<{
  insightId: string;
  insightType: string;
}> = {
  eventType: 'endpoint_workflow_insights_remediated_event',
  schema: {
    insightId: {
      type: 'keyword',
      _meta: {
        description: 'The ID of the workflow insight that was remediated',
        optional: false,
      },
    },
    insightType: {
      type: 'keyword',
      _meta: {
        description:
          'The type of the workflow insight (e.g. incompatible_antivirus, policy_response_failure)',
        optional: false,
      },
    },
  },
};

export const ENDPOINT_WORKFLOW_INSIGHTS_SCAN_TRIGGERED_EVENT: EventTypeOpts<{
  insightTypes: string[];
  endpointCount: number;
  hasConnectorId: boolean;
  newExecutions: number;
  deduplicatedExecutions: number;
  failures: number;
}> = {
  eventType: 'endpoint_workflow_insights_scan_triggered_event',
  schema: {
    insightTypes: {
      type: 'array',
      items: {
        type: 'keyword',
        _meta: {
          description: 'An insight type requested in the scan',
          optional: false,
        },
      },
      _meta: {
        description: 'The insight types requested in the scan',
        optional: false,
      },
    },
    endpointCount: {
      type: 'long',
      _meta: {
        description: 'Number of endpoints targeted by the scan',
        optional: false,
      },
    },
    hasConnectorId: {
      type: 'boolean',
      _meta: {
        description: 'Whether a specific connector was selected for the scan',
        optional: false,
      },
    },
    newExecutions: {
      type: 'long',
      _meta: {
        description: 'Number of new agent executions created',
        optional: false,
      },
    },
    deduplicatedExecutions: {
      type: 'long',
      _meta: {
        description: 'Number of executions skipped because they were already in-flight',
        optional: false,
      },
    },
    failures: {
      type: 'long',
      _meta: {
        description: 'Number of executions that failed to start',
        optional: false,
      },
    },
  },
};

export const ENDPOINT_WORKFLOW_INSIGHTS_CREATED_EVENT: EventTypeOpts<{
  insightType: string;
  count: number;
}> = {
  eventType: 'endpoint_workflow_insights_created_event',
  schema: {
    insightType: {
      type: 'keyword',
      _meta: {
        description: 'The type of insights created',
        optional: false,
      },
    },
    count: {
      type: 'long',
      _meta: {
        description: 'Number of insights created in this batch',
        optional: false,
      },
    },
  },
};

export const ENDPOINT_WORKFLOW_INSIGHTS_DISMISSED_EVENT: EventTypeOpts<{
  insightType: string;
}> = {
  eventType: 'endpoint_workflow_insights_dismissed_event',
  schema: {
    insightType: {
      type: 'keyword',
      _meta: {
        description:
          'The type of the workflow insight (e.g. incompatible_antivirus, policy_response_failure)',
        optional: false,
      },
    },
  },
};

export const GAP_DETECTED_EVENT: EventTypeOpts<{
  gapDuration: number;
  intervalDuration: number;
  intervalAndLookbackDuration: number;
  ruleType: string;
  ruleSource: string;
  isCustomized: boolean;
  gapReasonType?: string;
}> = {
  eventType: 'gap_detected_event',
  schema: {
    gapDuration: {
      type: 'long',
      _meta: {
        description: 'The duration of the gap',
      },
    },
    intervalDuration: {
      type: 'long',
      _meta: {
        description: 'The duration of the interval',
      },
    },
    intervalAndLookbackDuration: {
      type: 'long',
      _meta: {
        description: 'The duration of the interval and lookback',
      },
    },
    ruleType: {
      type: 'keyword',
      _meta: {
        description: 'The type of the rule',
      },
    },
    ruleSource: {
      type: 'keyword',
      _meta: {
        description: 'The source of the rule',
      },
    },
    isCustomized: {
      type: 'boolean',
      _meta: {
        description: 'Whether the prebuilt rule is customized',
      },
    },
    gapReasonType: {
      type: 'keyword',
      _meta: {
        description: 'Detected reason for the gap (rule_disabled or rule_did_not_run)',
        optional: true,
      },
    },
  },
};

export const LEAD_GENERATION_EXECUTION_EVENT: EventTypeOpts<{
  spaceId: string;
  leadsGenerated: number;
  newLeads: number;
  revisedLeads: number;
  resurfacedLeads: number;
  skippedLeads: number;
  failedLeads: number;
  sourceType: string;
}> = {
  eventType: 'lead_generation_execution',
  schema: {
    spaceId: {
      type: 'keyword',
      _meta: {
        description: 'Space ID where lead generation was run',
      },
    },
    leadsGenerated: {
      type: 'long',
      _meta: {
        description:
          'Number of prepared lead candidates in this run (after scoring and the maxLeads cap)',
      },
    },
    newLeads: {
      type: 'long',
      _meta: {
        description: 'Number of new leads in this run',
      },
    },
    revisedLeads: {
      type: 'long',
      _meta: {
        description: 'Number of reobserved leads with different observations',
      },
    },
    resurfacedLeads: {
      type: 'long',
      _meta: {
        description: 'Number of reobserved leads, without any observations changes',
      },
    },
    skippedLeads: {
      type: 'long',
      _meta: {
        description:
          'Number of reobserved leads skipped because matching one was previously dismissed',
      },
    },
    failedLeads: {
      type: 'long',
      _meta: {
        description: 'Number of leads that failed to persist in the index',
      },
    },
    sourceType: {
      type: 'keyword',
      _meta: {
        description: 'How lead generation was triggered: "adhoc" or "scheduled"',
      },
    },
  },
};

interface ResolutionCsvUploadEvent {
  total: number;
  successful: number;
  failed: number;
  unmatched: number;
  durationMs: number;
  errors?: Array<{
    errorCategory: CsvErrorCategory;
    count: number;
  }>;
  namespace: string;
}

export const ENTITY_STORE_RESOLUTION_CSV_UPLOAD_EVENT: EventTypeOpts<ResolutionCsvUploadEvent> = {
  eventType: 'entity_store_resolution_csv_upload',
  schema: {
    total: {
      type: 'long',
      _meta: { description: 'Total number of CSV rows processed' },
    },
    successful: {
      type: 'long',
      _meta: { description: 'Number of rows successfully linked' },
    },
    failed: {
      type: 'long',
      _meta: { description: 'Number of rows that failed processing' },
    },
    unmatched: {
      type: 'long',
      _meta: { description: 'Number of rows with no matching entities found' },
    },
    durationMs: {
      type: 'long',
      _meta: { description: 'Duration of the CSV upload processing in milliseconds' },
    },
    errors: {
      type: 'array',
      _meta: {
        optional: true,
        description: 'Per-category error counts for failed rows',
      },
      items: {
        properties: {
          errorCategory: {
            type: 'keyword',
            _meta: { description: 'Error category for failed rows' },
          },
          count: {
            type: 'long',
            _meta: { description: 'Number of rows with this error category' },
          },
        },
      },
    },
    namespace: {
      type: 'keyword',
      _meta: { description: 'Kibana space ID where the upload was performed' },
    },
  },
};

// Telemetry event sent when the alert analysis workflow settings are saved through the
// dedicated settings page, whether the save succeeds or fails.
export const ALERT_ANALYSIS_WORKFLOW_SETTINGS_UPDATED_EVENT: EventTypeOpts<{
  status: 'success' | 'error';
  workflowEnabled: boolean;
  autoCloseEnabled: boolean;
  createConversation: boolean;
  connectorConfigured: boolean;
  customAgent: boolean;
  autoCloseConfidenceScoreMinThreshold: number;
  autoCloseConfidenceScoreMaxThreshold: number;
}> = {
  eventType: 'alert_analysis_workflow_settings_updated',
  schema: {
    status: {
      type: 'keyword',
      _meta: { description: 'Whether the settings update succeeded or failed' },
    },
    workflowEnabled: {
      type: 'boolean',
      _meta: { description: 'Whether the alert analysis workflow is enabled' },
    },
    autoCloseEnabled: {
      type: 'boolean',
      _meta: { description: 'Whether auto-closing false positive alerts is enabled' },
    },
    createConversation: {
      type: 'boolean',
      _meta: { description: 'Whether a new AI conversation is created per alert analysis' },
    },
    connectorConfigured: {
      type: 'boolean',
      _meta: { description: 'Whether an AI connector is configured for the workflow' },
    },
    customAgent: {
      type: 'boolean',
      _meta: {
        description: 'Whether a non-default (custom) agent is configured for the workflow',
      },
    },
    autoCloseConfidenceScoreMinThreshold: {
      type: 'float',
      _meta: { description: 'Minimum confidence score threshold for auto-close (0-1)' },
    },
    autoCloseConfidenceScoreMaxThreshold: {
      type: 'float',
      _meta: { description: 'Maximum confidence score threshold for auto-close (0-1)' },
    },
  },
};

export const ANALYZER_CROSS_PROJECT_RENDER_EVENT: EventTypeOpts<{
  projectCount: number;
}> = {
  eventType: 'analyzer_cross_project_render',
  schema: {
    projectCount: {
      type: 'long',
      _meta: {
        description:
          'Number of distinct projects represented in an Analyzer tree that included at least one linked-project node. Counts only; no document content.',
        optional: false,
      },
    },
  },
};

/**
 * Temporary sizing telemetry for the New Terms to ES|QL INLINE STATS migration decision. This is a
 * one-off study to measure the cardinality and value length of the fields customers group by. It should be removed once the migration sizing is settled.
 *
 * Removal tracking issue: https://github.com/elastic/kibana/issues/290516
 */
export const NEW_TERMS_FIELD_CARDINALITY_EVENT: EventTypeOpts<{
  isElasticRule: boolean;
  newTermsFieldsCount: number;
  distinctFieldCombinations: number;
  maxCombinationValueLength: number;
  combinationValueLengthSum: number;
  interruptedByMaxSignals: boolean;
}> = {
  eventType: 'new_terms_field_cardinality_on_rule_execution',
  schema: {
    isElasticRule: {
      type: 'boolean',
      _meta: {
        description:
          'True for an Elastic prebuilt rule, false for a user-created rule. No rule id, name, field names or values are reported.',
      },
    },
    newTermsFieldsCount: {
      type: 'long',
      _meta: { description: 'Number of fields the New Terms rule groups by (1-3)' },
    },
    distinctFieldCombinations: {
      type: 'long',
      _meta: {
        description:
          'Number of distinct combinations of the grouping-field values seen in the rule run window this execution. Counts every combination scanned, not only the new ones that produced alerts',
      },
    },
    maxCombinationValueLength: {
      type: 'long',
      _meta: {
        description:
          'Longest combined character length of the grouping-field values across a single distinct combination this run (value lengths only, not the values)',
      },
    },
    combinationValueLengthSum: {
      type: 'long',
      _meta: {
        description:
          'Sum over the distinct combinations this run of the combined character length of their grouping-field values (lengths only, not the values). Divide by distinctFieldCombinations to get the average',
      },
    },
    interruptedByMaxSignals: {
      type: 'boolean',
      _meta: {
        description:
          'True if the run stopped early after reaching maxSignals before paging through all terms, in which case the counts are a lower bound. False if it paged through all terms',
      },
    },
  },
};

export const events = [
  DETECTION_RULE_UPGRADE_EVENT,
  DETECTION_RULE_BULK_UPGRADE_EVENT,
  DETECTION_RULE_RESTORE_EVENT,
  DETECTION_RULE_RESTORE_ERROR_EVENT,
  DETECTION_RULE_IMPORT_EVENT,
  DETECTION_RULE_REVERT_EVENT,
  DETECTION_RULE_INSTALL_EVENT,
  DETECTION_RULE_DUPLICATE_EVENT,
  RISK_SCORE_EXECUTION_SUCCESS_EVENT,
  RISK_SCORE_EXECUTION_ERROR_EVENT,
  RISK_SCORE_EXECUTION_CANCELLATION_EVENT,
  RISK_SCORE_MAINTAINER_RUN_SUMMARY_EVENT,
  RISK_SCORE_MAINTAINER_STAGE_SUMMARY_EVENT,
  ASSET_CRITICALITY_SYSTEM_PROCESSED_ASSIGNMENT_FILE_EVENT,
  ALERT_SUPPRESSION_EVENT,
  NEW_TERMS_FIELD_CARDINALITY_EVENT,
  ENDPOINT_RESPONSE_ACTION_SENT_EVENT,
  ENDPOINT_RESPONSE_ACTION_SENT_ERROR_EVENT,
  ENDPOINT_RESPONSE_ACTION_STATUS_CHANGE_EVENT,
  ENDPOINT_WORKFLOW_INSIGHTS_REMEDIATED_EVENT,
  ENDPOINT_WORKFLOW_INSIGHTS_SCAN_TRIGGERED_EVENT,
  ENDPOINT_WORKFLOW_INSIGHTS_CREATED_EVENT,
  ENDPOINT_WORKFLOW_INSIGHTS_DISMISSED_EVENT,
  ANALYZER_CROSS_PROJECT_RENDER_EVENT,
  FIELD_RETENTION_ENRICH_POLICY_EXECUTION_EVENT,
  ENTITY_STORE_DATA_VIEW_REFRESH_EXECUTION_EVENT,
  ENTITY_STORE_SNAPSHOT_TASK_EXECUTION_EVENT,
  ENTITY_STORE_API_CALL_EVENT,
  ENTITY_ENGINE_RESOURCE_INIT_FAILURE_EVENT,
  ENTITY_ENGINE_INITIALIZATION_EVENT,
  ENTITY_ENGINE_DELETION_EVENT,
  ENTITY_ANALYTICS_AI_TOOL_USAGE_EVENT,
  ENTITY_HIGHLIGHTS_USAGE_EVENT,
  ENTITY_AI_SUMMARY_PERSISTED_EVENT,
  PRIVMON_ENGINE_INITIALIZATION_EVENT,
  PRIVMON_ENGINE_RESOURCE_INIT_FAILURE_EVENT,
  WATCHLIST_API_CALL_EVENT,
  ATTACKS_API_CALL_EVENT,
  TELEMETRY_DATA_STREAM_EVENT,
  TELEMETRY_HEALTH_DIAGNOSTIC_QUERY_RESULT_EVENT,
  TELEMETRY_HEALTH_DIAGNOSTIC_QUERY_STATS_EVENT,
  TELEMETRY_ILM_POLICY_EVENT,
  TELEMETRY_ILM_STATS_EVENT,
  TELEMETRY_INDEX_SETTINGS_EVENT,
  TELEMETRY_INDEX_STATS_EVENT,
  TELEMETRY_INDEX_TEMPLATES_EVENT,
  TELEMETRY_NODE_INGEST_PIPELINES_STATS_EVENT,
  ...SIEM_MIGRATIONS_EVENTS,
  GAP_DETECTED_EVENT,
  ...TRIAL_COMPANION_EVENTS,
  LEAD_GENERATION_EXECUTION_EVENT,
  ENTITY_STORE_RESOLUTION_CSV_UPLOAD_EVENT,
  ALERT_ANALYSIS_WORKFLOW_SETTINGS_UPDATED_EVENT,
];
