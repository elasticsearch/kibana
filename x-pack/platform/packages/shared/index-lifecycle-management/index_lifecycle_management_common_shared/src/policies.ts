/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export type Phase = keyof Phases;

export type PhaseWithAllocation = 'warm' | 'cold';

export type PhaseWithTiming = keyof Omit<Phases, 'hot'>;

export type PhaseExceptDelete = keyof Omit<Phases, 'delete'>;

export type PhaseWithDownsample = 'hot' | 'warm' | 'cold';

export interface SerializedPolicy {
  name: string;
  phases: Phases;
  deprecated?: boolean;
  _meta?: Record<string, any>;
}

export interface Phases {
  hot?: SerializedHotPhase;
  warm?: SerializedWarmPhase;
  cold?: SerializedColdPhase;
  frozen?: SerializedFrozenPhase;
  delete?: SerializedDeletePhase;
}

export interface PolicyFromES {
  modifiedDate: string;
  name: string;
  policy: SerializedPolicy;
  version: number;
  indices?: string[];
  dataStreams?: string[];
  indexTemplates?: string[];
}

export interface SerializedPhase {
  min_age?: string;
  actions: {
    [action: string]: any;
  };
}

export interface MigrateAction {
  /**
   * If enabled is ever set it will probably only be set to `false` because the default value
   * for this is `true`. Rather leave unspecified for true when serialising.
   */
  enabled: boolean;
}

export interface SerializedActionWithAllocation {
  allocate?: AllocateAction;
  migrate?: MigrateAction;
}

export interface SearchableSnapshotAction {
  snapshot_repository: string;
  /**
   * Controls whether the searchable snapshot action should force merge the managed index to a one segment
   * before creating the snapshot. Defaults to `true`.
   */
  force_merge_index?: boolean;
  /**
   * Controls how the force merge (when enabled) is executed.
   *
   * - `true` (default): clone the index with 0 replicas and force merge the clone before creating the snapshot.
   * - `false`: skip cloning and force merge the managed index directly.
   *
   * Only valid when `force_merge_index` is `true`. Introduced in ES 9.2.1+.
   */
  force_merge_on_clone?: boolean;
}

export interface RolloverAction {
  max_age?: string;
  max_docs?: number;
  max_primary_shard_size?: string;
  max_primary_shard_docs?: number;

  /**
   * @deprecated Deprecated as of Elasticsearch 9.3. Use `max_primary_shard_size` instead.
   * Not yet removed; existing policies may still carry this value.
   */
  max_size?: string;

  min_age?: string;
  min_docs?: number;
  min_size?: string;
  min_primary_shard_size?: string;
  min_primary_shard_docs?: number;
}

export interface SerializedHotPhase extends SerializedPhase {
  actions: {
    rollover?: RolloverAction;
    forcemerge?: ForcemergeAction;
    readonly?: {};
    shrink?: ShrinkAction;
    downsample?: DownsampleAction;

    set_priority?: SetPriorityAction;
    /**
     * Only available on enterprise license
     */
    searchable_snapshot?: SearchableSnapshotAction;
  };
}

export interface SerializedWarmPhase extends SerializedPhase {
  actions: {
    allocate?: AllocateAction;
    shrink?: ShrinkAction;
    forcemerge?: ForcemergeAction;
    readonly?: {};
    downsample?: DownsampleAction;
    set_priority?: SetPriorityAction;
    migrate?: MigrateAction;
  };
}

export interface SerializedColdPhase extends SerializedPhase {
  actions: {
    freeze?: {};
    readonly?: {};
    downsample?: DownsampleAction;
    allocate?: AllocateAction;
    set_priority?: SetPriorityAction;
    migrate?: MigrateAction;
    /**
     * Only available on enterprise license
     */
    searchable_snapshot?: SearchableSnapshotAction;
  };
}

export interface SerializedFrozenPhase extends SerializedPhase {
  actions: {
    /**
     * Only available on enterprise license
     */
    searchable_snapshot?: SearchableSnapshotAction;
  };
}

export interface SerializedDeletePhase extends SerializedPhase {
  actions: {
    wait_for_snapshot?: {
      policy: string;
    };
    delete?: {
      delete_searchable_snapshot?: boolean;
    };
  };
}

export interface AllocateAction {
  number_of_replicas?: number;
  include?: {};
  exclude?: {};
  require?: {
    [attribute: string]: string;
  };
}

export interface ShrinkAction {
  number_of_shards?: number;
  max_primary_shard_size?: string;
  allow_write_after_shrink?: boolean;
}

export interface ForcemergeAction {
  max_num_segments: number;
  // only accepted value for index_codec
  index_codec?: 'best_compression';
}

export interface DownsampleAction {
  fixed_interval: string;
}

export interface SetPriorityAction {
  priority: number | null;
}

export interface CommonPhaseSettings {
  phaseEnabled: boolean;
}

export interface PhaseWithMinAge {
  selectedMinimumAge: string;
  selectedMinimumAgeUnits: string;
}

export interface DeletePhase extends CommonPhaseSettings, PhaseWithMinAge {
  waitForSnapshotPolicy: string;
}
