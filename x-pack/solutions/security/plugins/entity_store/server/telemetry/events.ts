/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AnalyticsServiceSetup } from '@kbn/core/server';
import type { EventTypeOpts } from '@kbn/core/server';
import type { EntityMaintainerTelemetryEventType } from '../tasks/entity_maintainers/types';

// ------------------------------------
//  Event types
// ------------------------------------

interface InitializationEvent {
  entityType: string;
  namespace: string;
}

interface InitializationFailureEvent {
  error: string;
  namespace: string;
}

interface DeletionEvent {
  entityType: string;
  namespace: string;
}

interface StoreUsageEventPayload {
  storeSize: number;
  entityType: string;
  namespace: string;
}

interface MetadataUsageEventPayload {
  namespace: string;
  docCount: number;
}

interface EntityStoreHealthComponentPayload {
  id: string;
  resource: string;
  installed: boolean;
  status?: string;
  lastError?: string;
}

interface EntityStoreHealthEnginePayload {
  type: string;
  status: string;
  components: EntityStoreHealthComponentPayload[];
}

interface EntityStoreHealthReportPayload {
  namespace: string;
  engines: EntityStoreHealthEnginePayload[];
}

interface EntityMaintainerEvent {
  id: string;
  namespace?: string;
  type: EntityMaintainerTelemetryEventType;
  errorMessage?: string;
}

interface EntityMaintainerRunSummaryFunnel {
  /** Entities or records scanned from source */
  scanned: number;
  /** Entities that passed business-logic qualification */
  qualified: number;
  /**
   * Bulk-update objects built after cross-source merge; omitted when the
   * maintainer has no distinct proposal phase (relationship and resolution
   * maintainers go straight from qualified → applied).
   */
  proposed?: number;
  /** Writes successfully applied to the entity store */
  applied: number;
  /** 404 bulk errors — entity absent from store; omitted when not applicable */
  droppedNotInStore?: number;
  /** Entities intentionally skipped (ambiguous, deferred); omitted when not applicable */
  skipped?: number;
  /** Non-404 write errors */
  failed: number;
  /** Relationship metadata docs successfully appended to the metadata datastream; omitted when not applicable */
  metadataDocsApplied?: number;
}

interface EntityMaintainerRunSummarySource {
  /** Integration or logical input id (e.g. "aws_cloudtrail") */
  id: string;
  /** Records scanned from this source */
  scanned: number;
  /** Records that qualified from this source */
  qualified: number;
  /** Source outcome: index_missing | empty | partial | producing | error */
  outcome: 'index_missing' | 'empty' | 'partial' | 'producing' | 'error';
}

interface EntityMaintainerRunSummaryBreakdown {
  /** Relationship kind or sub-category name */
  name: string;
  /** Applied writes for this breakdown entry */
  count: number;
}

interface EntityMaintainerRunSummaryStage {
  /** Stage name (fixed enum per maintainer) */
  name: string;
  /** Stage outcome: success | error | skipped */
  status: 'success' | 'error' | 'skipped';
  /** Stage duration in milliseconds */
  durationMs: number;
  /** Fixed enum per maintainer when status is skipped */
  skipReason?: string;
  /** Fixed enum per maintainer when status is error */
  errorKind?: string;
  /** Stage-specific applied count rolling up into funnel.applied */
  applied?: number;
}

export interface EntityMaintainerRunSummaryEvent {
  /** Entity maintainer identifier */
  id: string;
  /** Kibana space the maintainer runs in (e.g. "default") */
  namespace: string;
  /** UUID shared by all events from one scheduled run; joins to logs */
  runId: string;
  /** Sub-run discriminator; only risk-score uses this (one event per entity type) */
  scope?: {
    /** Scope discriminator kind (e.g. "entity_type") */
    kind: string;
    /** Scope value (e.g. "host", "user", "service", "generic") */
    value: string;
  };
  /** Total run duration in milliseconds */
  durationMs: number;
  /** Number of outer-loop pagination passes consumed during the run */
  iterations?: number;
  /** Run hit a hard-coded pagination or query ceiling and stopped voluntarily */
  truncated?: boolean;
  /** Run was cut short by an external abort signal */
  aborted: boolean;
  /** Sanitised error class name, set only on error */
  errorClass?: string;
  /** Error message capped at 500 chars, set only on error */
  errorMessage?: string;
  funnel: EntityMaintainerRunSummaryFunnel;
  /**
   * Per-source pre-merge funnel: counts how many records each integration or logical input
   * contributed, before cross-source deduplication. Answers "where did the inputs come from?".
   * Pairs with breakdown, which counts outputs by relationship kind. Omitted when not applicable.
   */
  sources?: EntityMaintainerRunSummarySource[];
  /**
   * Per-relationship-kind split of applied writes: counts outputs after the merge, grouped by
   * what was written (e.g. relationship type, sub-category). Answers "what was produced?".
   * Pairs with sources, which counts inputs by integration. Omitted when not applicable.
   */
  breakdown?: EntityMaintainerRunSummaryBreakdown[];
  /** Per-stage execution detail for multi-stage maintainers; omitted when not applicable */
  stages?: EntityMaintainerRunSummaryStage[];
}

// ------------------------------------
// Event definitions
// ------------------------------------

export const ENTITY_STORE_INITIALIZATION_EVENT = {
  eventType: 'entity_store_initialization',
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
  },
} as const satisfies EventTypeOpts<InitializationEvent>;

export const ENTITY_STORE_INITIALIZATION_FAILURE_EVENT = {
  eventType: 'entity_store_initialization_failure',
  schema: {
    error: {
      type: 'keyword',
      _meta: {
        description: 'Error message for a resource initialization failure',
      },
    },
    namespace: {
      type: 'keyword',
      _meta: {
        description: 'Namespace where the entities are stored (e.g. "default")',
      },
    },
  },
} as const satisfies EventTypeOpts<InitializationFailureEvent>;

export const ENTITY_STORE_DELETION_EVENT = {
  eventType: 'entity_store_deletion',
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
  },
} as const satisfies EventTypeOpts<DeletionEvent>;

export const ENTITY_STORE_USAGE_EVENT = {
  eventType: 'entity_store_usage',
  schema: {
    storeSize: {
      type: 'long',
      _meta: {
        description: 'Number of entities stored in the entity store by type and namespace',
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
} as const satisfies EventTypeOpts<StoreUsageEventPayload>;

export const ENTITY_STORE_METADATA_USAGE_EVENT = {
  eventType: 'entity_store_metadata_usage',
  schema: {
    namespace: {
      type: 'keyword',
      _meta: {
        description: 'Namespace where the metadata datastream lives (e.g. "default")',
      },
    },
    docCount: {
      type: 'long',
      _meta: {
        description: 'Total documents in the entity metadata datastream (.entities.v2.metadata.*)',
      },
    },
  },
} as const satisfies EventTypeOpts<MetadataUsageEventPayload>;

export const ENTITY_MAINTAINER_EVENT = {
  eventType: 'entity_store_entity_maintainer',
  schema: {
    id: {
      type: 'keyword',
      _meta: {
        description: 'Entity maintainer identifier',
      },
    },
    namespace: {
      type: 'keyword',
      _meta: {
        description: 'Namespace where the maintainer runs (e.g. "default")',
        optional: true,
      },
    },
    type: {
      type: 'keyword',
      _meta: {
        description:
          'Entity maintainer telemetry event type (register, abort, setup, run, error, stop, start, delete)',
      },
    },
    errorMessage: {
      type: 'keyword',
      _meta: {
        description: 'Optional error message for error events',
        optional: true,
      },
    },
  },
} as const satisfies EventTypeOpts<EntityMaintainerEvent>;

export const ENTITY_MAINTAINER_RUN_SUMMARY_EVENT = {
  eventType: 'entity_store_entity_maintainer_run_summary',
  schema: {
    id: {
      type: 'keyword',
      _meta: { description: 'Entity maintainer identifier' },
    },
    namespace: {
      type: 'keyword',
      _meta: { description: 'Kibana space the maintainer runs in (e.g. "default")' },
    },
    runId: {
      type: 'keyword',
      _meta: { description: 'UUID shared by all events from one scheduled run; joins to logs' },
    },
    scope: {
      properties: {
        kind: {
          type: 'keyword',
          _meta: { description: 'Scope discriminator kind (e.g. "entity_type")' },
        },
        value: {
          type: 'keyword',
          _meta: { description: 'Scope value (e.g. "host", "user", "service", "generic")' },
        },
      },
      _meta: {
        optional: true,
        description: 'Sub-run discriminator; only risk-score uses this (one event per entity type)',
      },
    },
    durationMs: {
      type: 'long',
      _meta: { description: 'Total run duration in milliseconds' },
    },
    iterations: {
      type: 'long',
      _meta: {
        optional: true,
        description: 'Number of outer-loop pagination passes consumed during the run',
      },
    },
    truncated: {
      type: 'boolean',
      _meta: {
        optional: true,
        description: 'Run hit a hard-coded pagination or query ceiling and stopped voluntarily',
      },
    },
    aborted: {
      type: 'boolean',
      _meta: { description: 'Run was cut short by an external abort signal' },
    },
    errorClass: {
      type: 'keyword',
      _meta: { optional: true, description: 'Sanitised error class name, set only on error' },
    },
    errorMessage: {
      type: 'keyword',
      _meta: {
        optional: true,
        description: 'Error message capped at 500 chars, set only on error',
      },
    },
    funnel: {
      properties: {
        scanned: {
          type: 'long',
          _meta: { description: 'Entities or records scanned from source' },
        },
        qualified: {
          type: 'long',
          _meta: { description: 'Entities that passed business-logic qualification' },
        },
        proposed: {
          type: 'long',
          _meta: {
            optional: true,
            description:
              'Bulk-update objects built after cross-source merge; omitted when the maintainer has no distinct proposal phase (relationship and resolution maintainers go straight from qualified → applied)',
          },
        },
        applied: {
          type: 'long',
          _meta: { description: 'Writes successfully applied to the entity store' },
        },
        droppedNotInStore: {
          type: 'long',
          _meta: {
            optional: true,
            description: '404 bulk errors — entity absent from store; omitted when not applicable',
          },
        },
        skipped: {
          type: 'long',
          _meta: {
            optional: true,
            description:
              'Entities intentionally skipped (ambiguous, deferred); omitted when not applicable',
          },
        },
        failed: {
          type: 'long',
          _meta: { description: 'Non-404 write errors' },
        },
        metadataDocsApplied: {
          type: 'long',
          _meta: {
            optional: true,
            description:
              'Relationship metadata docs successfully appended to the metadata datastream; omitted when not applicable',
          },
        },
      },
    },
    sources: {
      type: 'array',
      items: {
        properties: {
          id: {
            type: 'keyword',
            _meta: { description: 'Integration or logical input id (e.g. "aws_cloudtrail")' },
          },
          scanned: {
            type: 'long',
            _meta: { description: 'Records scanned from this source' },
          },
          qualified: {
            type: 'long',
            _meta: { description: 'Records that qualified from this source' },
          },
          outcome: {
            type: 'keyword',
            _meta: {
              description: 'Source outcome: index_missing | empty | partial | producing | error',
            },
          },
        },
      },
      _meta: {
        optional: true,
        description:
          'Per-source pre-merge funnel: counts how many records each integration or logical input contributed, before cross-source deduplication. Answers "where did the inputs come from?". Pairs with breakdown, which counts outputs by relationship kind. Omitted when not applicable.',
      },
    },
    breakdown: {
      type: 'array',
      items: {
        properties: {
          name: {
            type: 'keyword',
            _meta: { description: 'Relationship kind or sub-category name' },
          },
          count: {
            type: 'long',
            _meta: { description: 'Applied writes for this breakdown entry' },
          },
        },
      },
      _meta: {
        optional: true,
        description:
          'Per-relationship-kind split of applied writes: counts outputs after the merge, grouped by what was written (e.g. relationship type, sub-category). Answers "what was produced?". Pairs with sources, which counts inputs by integration. Omitted when not applicable.',
      },
    },
    stages: {
      type: 'array',
      items: {
        properties: {
          name: {
            type: 'keyword',
            _meta: { description: 'Stage name (fixed enum per maintainer)' },
          },
          status: {
            type: 'keyword',
            _meta: { description: 'Stage outcome: success | error | skipped' },
          },
          durationMs: {
            type: 'long',
            _meta: { description: 'Stage duration in milliseconds' },
          },
          skipReason: {
            type: 'keyword',
            _meta: {
              optional: true,
              description: 'Fixed enum per maintainer when status is skipped',
            },
          },
          errorKind: {
            type: 'keyword',
            _meta: {
              optional: true,
              description: 'Fixed enum per maintainer when status is error',
            },
          },
          applied: {
            type: 'long',
            _meta: {
              optional: true,
              description: 'Stage-specific applied count rolling up into funnel.applied',
            },
          },
        },
      },
      _meta: {
        optional: true,
        description:
          'Per-stage execution detail for multi-stage maintainers; omitted when not applicable',
      },
    },
  },
} as const satisfies EventTypeOpts<EntityMaintainerRunSummaryEvent>;

export const ENTITY_STORE_HEALTH_REPORT_EVENT = {
  eventType: 'entity_store_health_report',
  schema: {
    namespace: {
      type: 'keyword',
      _meta: {
        description: 'Namespace where the entity store health is reported (e.g. "default")',
      },
    },
    engines: {
      type: 'array',
      items: {
        properties: {
          type: {
            type: 'keyword',
            _meta: { description: 'Engine type (e.g "host" or "generic")' },
          },
          status: {
            type: 'keyword',
            _meta: {
              description: 'Overall engine status',
            },
          },
          components: {
            type: 'array',
            items: {
              properties: {
                id: {
                  type: 'keyword',
                  _meta: { description: 'Component identifier' },
                },
                resource: {
                  type: 'keyword',
                  _meta: {
                    description: 'Type of the component (e.g. "index" or "task")',
                  },
                },
                installed: {
                  type: 'boolean',
                  _meta: { description: 'Whether the component is installed' },
                },
                status: {
                  type: 'keyword',
                  _meta: {
                    optional: true,
                    description: 'Task component status when the component is a task',
                  },
                },
                lastError: {
                  type: 'keyword',
                  _meta: {
                    optional: true,
                    description: 'Task component last error message, when present',
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const satisfies EventTypeOpts<EntityStoreHealthReportPayload>;

// ------------------------------------
// Registration
// ------------------------------------

const events = [
  ENTITY_STORE_INITIALIZATION_EVENT,
  ENTITY_STORE_INITIALIZATION_FAILURE_EVENT,
  ENTITY_STORE_DELETION_EVENT,
  ENTITY_STORE_USAGE_EVENT,
  ENTITY_STORE_METADATA_USAGE_EVENT,
  ENTITY_STORE_HEALTH_REPORT_EVENT,
  ENTITY_MAINTAINER_EVENT,
  ENTITY_MAINTAINER_RUN_SUMMARY_EVENT,
] as const;

export const registerTelemetry = (analytics: AnalyticsServiceSetup) =>
  events.forEach((eventConfig: EventTypeOpts<{}>) => analytics.registerEventType(eventConfig));

// ------------------------------------
// Type-safe reporting
// ------------------------------------

interface TelemetryEventMap {
  [ENTITY_STORE_INITIALIZATION_EVENT.eventType]: InitializationEvent;
  [ENTITY_STORE_DELETION_EVENT.eventType]: DeletionEvent;
  [ENTITY_STORE_INITIALIZATION_FAILURE_EVENT.eventType]: InitializationFailureEvent;
  [ENTITY_STORE_USAGE_EVENT.eventType]: StoreUsageEventPayload;
  [ENTITY_STORE_METADATA_USAGE_EVENT.eventType]: MetadataUsageEventPayload;
  [ENTITY_STORE_HEALTH_REPORT_EVENT.eventType]: EntityStoreHealthReportPayload;
  [ENTITY_MAINTAINER_EVENT.eventType]: EntityMaintainerEvent;
  [ENTITY_MAINTAINER_RUN_SUMMARY_EVENT.eventType]: EntityMaintainerRunSummaryEvent;
}

export type TelemetryReporter = ReturnType<typeof createReportEvent>;

export const createReportEvent = (analytics: AnalyticsServiceSetup) => ({
  reportEvent: <T extends (typeof events)[number]>(
    event: T,
    eventData: TelemetryEventMap[T['eventType']]
  ) => analytics.reportEvent(event.eventType, eventData),
});
