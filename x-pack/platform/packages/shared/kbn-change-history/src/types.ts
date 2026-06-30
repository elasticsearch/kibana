/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  QueryDslQueryContainer,
  Refresh,
  SortCombinations,
} from '@elastic/elasticsearch/lib/api/types';
/**
 * Represents a single document in the change history.
 */
export interface ChangeHistoryDocument {
  /** ISO8601 timestamp when the target object was changed (successful write confirmed). */
  '@timestamp': string;

  ecs: {
    /** The version of ECS used (9.3.0) */
    version: '9.3.0';
  };

  user: {
    /** Unique profile identifier used by auth realm (@see https://www.elastic.co/docs/deploy-manage/users-roles/cluster-or-deployment-auth/user-profiles) */
    id?: string;
    /** Current login name for user that generated the change. */
    name: string;
  };

  event: {
    /** Unique identifier for the event. Always set by the client as UUID v7. */
    id: string;
    /** Kibana module that the event belongs to. (e.g. `security`, etc.) */
    module: string;
    /** Name of the dataset that the event belongs to (e.g. `alerting-rules`, etc.) */
    dataset: string;
    /** Human readable action performed by the user (`rule_create`, `rule_update`, `rule_delete`, etc.). For audit log examples (@see https://www.elastic.co/docs/reference/kibana/kibana-audit-events#xpack-security-ecs-audit-logging) */
    action: string;
    /** ECS Categorization of the event performed (`creation`, `change`, `deletion`) */
    type: 'change' | 'creation' | 'deletion';
    /** User-provided reason for the change. */
    reason?: string;
    /** ISO8601 timestamp of the event creation time. */
    created?: string;
  };

  span?: {
    /** ID shared between events in the same bulk operation. */
    id: string;
  };

  object: {
    /** Unique id of the target entity in kibana. */
    id: string;
    /** Type of the target entity in kibana. Allows tracking multiple entity types in same stream. */
    type: string;
    /** SHA256 hash of the entity.raw to identify changes in the payload. */
    hash: string;
    /**
     * Monotonically increasing integer determining object changes order.
     *
     * `@timestamp` is used for ordering when omitted.
     *
     * Use `object.sequence` when you can't tolerate clock skew. The best source for
     * such a sequence number is some monotonically increasing number tracked in the
     * source object which gets incremented upon every object change. It has to survive
     * reindexing, upgrades, failovers, migrations and cluster rebuilds.
     */
    sequence?: number;
    fields: {
      /** Full paths of fields stored as hashes (high-entropy secrets). */
      hashed: string[];
      /** Full paths of fields replaced with a `[redacted]` placeholder (low-entropy sensitive data, large blobs). */
      redacted: string[];
    };
    /** Full snapshot after the change. */
    snapshot: Record<string, unknown>;
  };

  /** Optional list of tags for the event. */
  tags?: string[];

  /** Optional metadata about the event. Information that does not form part of the ECS schema. */
  metadata?: Record<string, unknown>;

  service: {
    type: 'kibana';
    /** Version of kibana that the event belongs to. */
    version: string;
  };
}

export interface ObjectChange {
  /** ISO8601 `@timestamp` when this change was confirmed. */
  timestamp?: string;
  /** The `object.type`. Allows multiple object types per data stream. */
  objectType: string;
  /** The `object.id`. Uniquely identifies this object in Kibana within its `type` */
  objectId: string;
  /**
   * Monotonically increasing integer determining object changes order.
   *
   * `@timestamp` is used for ordering when omitted.
   *
   * Use `object.sequence` when you can't tolerate clock skew. The best source for
   * such a sequence number is some monotonically increasing number tracked in the
   * source object which gets incremented upon every object change. It has to survive
   * reindexing, upgrades, failovers, migrations and cluster rebuilds.
   */
  sequence?: number;
  /**
   * Full snapshot of the object **after** the change (post-write state). Persisted as
   * `object.snapshot`.
   */
  snapshot: Record<string, any>;
}

export interface LogChangeHistoryOptions {
  /** Action performed by the user (`rule_create`, `rule_update`, `rule_delete`, etc.). Some Audit log examples (@see https://www.elastic.co/docs/reference/kibana/kibana-audit-events#xpack-security-ecs-audit-logging) */
  action: string;
  /** Current login name for user that generated the change. */
  username: string;
  /** Unique profile identifier used by auth realm (@see https://www.elastic.co/docs/deploy-manage/users-roles/cluster-or-deployment-auth/user-profiles) */
  userProfileId?: string;
  /** Kibana space that the event belongs to. (ie `default` etc). */
  spaceId: string;
  /** ID shared between events that take place together (ie in the same bulk operation). */
  correlationId?: string;
  /**
   * Direct overrides for the change document (`tags`, `metadata`, and selected `event` fields).
   * `event.id` is always generated by the client and cannot be supplied here.
   */
  data?: Partial<Pick<ChangeHistoryDocument, 'event' | 'tags' | 'metadata'>>;
  /** Snapshot fields to replace with a salted SHA-256 digest. High-entropy secrets only (API keys, tokens); low-entropy values stay brute-forceable, use `fieldsToRedact` for those. */
  fieldsToHash?: ChangeHistoryFieldsToMask;
  /** Snapshot fields to replace with a `[redacted]` placeholder. Use for low-entropy sensitive data (emails, names, IPs). */
  fieldsToRedact?: ChangeHistoryFieldsToMask;
  /** Optional indicator to force an ES refresh after changes (affects performance) */
  refresh?: Refresh;
}

export interface GetChangeHistoryOptions {
  additionalFilters?: QueryDslQueryContainer[];
  sort?: SortCombinations[];
  from?: number;
  size?: number;
}

/**
 * Result from a history query.
 */
export interface GetHistoryResult {
  total: number;
  items: ChangeHistoryDocument[];
}

/**
 * Nested map of snapshot field paths to mask (set `true` to select a path). Used by `fieldsToHash` and `fieldsToRedact`.
 */
export interface ChangeHistoryFieldsToMask {
  [Key: string]: boolean | ChangeHistoryFieldsToMask;
}
