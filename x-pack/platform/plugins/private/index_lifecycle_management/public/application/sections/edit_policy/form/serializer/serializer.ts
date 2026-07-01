/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { merge, cloneDeep, get } from 'lodash';

import type { RolloverAction, SerializedPolicy } from '../../../../../../common/types';

import { defaultPolicy } from '../../../../constants';

import type { FormInternal } from '../../types';
import {
  DEFAULT_ROLLOVER_TRIGGER_FIELDS,
  ROLLOVER_RESTRICTION_FIELDS,
  ROLLOVER_TRIGGER_FIELDS,
  ROLLOVER_UNIT_PATHS,
  type RolloverField,
} from '../../constants';

import { serializeMigrateAndAllocateActions } from './serialize_migrate_and_allocate_actions';

const numberRolloverFields = new Set<RolloverField>([
  'max_docs',
  'max_primary_shard_docs',
  'min_docs',
  'min_primary_shard_docs',
]);

const hasRolloverValue = (value: unknown): boolean => {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  return value !== undefined && value !== null && value !== '';
};

const getRolloverUnit = (data: FormInternal, field: RolloverField): string => {
  const unitPath = ROLLOVER_UNIT_PATHS[field];
  return unitPath ? get(data, unitPath, '') : '';
};

export const createSerializer =
  (originalPolicy?: SerializedPolicy) =>
  (data: FormInternal): SerializedPolicy => {
    const { _meta, ...updatedPolicy } = data;
    updatedPolicy.phases = updatedPolicy.phases ?? {};

    const hotMeta = _meta?.hot;
    const warmMeta = _meta?.warm;
    const coldMeta = _meta?.cold;
    const frozenMeta = _meta?.frozen;
    const deleteMeta = _meta?.delete;
    const searchableSnapshotMeta = _meta?.searchableSnapshot;

    const hotEnabled = hotMeta?.enabled ?? true;
    if (hotEnabled) {
      updatedPolicy.phases = {
        ...updatedPolicy.phases,
        hot: updatedPolicy.phases.hot ?? { actions: {} },
      };
    } else if (updatedPolicy.phases.hot) {
      delete updatedPolicy.phases.hot;
    }

    const draft = cloneDeep<SerializedPolicy>(originalPolicy ?? defaultPolicy);
    // Copy over all updated fields
    merge(draft, updatedPolicy);
    if (!hotEnabled) {
      delete draft.phases.hot;
    }

    /**
     * Important shared values for serialization
     */
    const isUsingRollover = Boolean(hotEnabled && hotMeta?.customRollover?.enabled);

    // Next copy over all meta fields and delete any fields that have been removed
    // by fields exposed in the form. It is very important that we do not delete
    // data that the form does not control! E.g., unfollow action in hot phase.

    /**
     * HOT PHASE SERIALIZATION
     */
    if (hotEnabled && draft.phases.hot) {
      draft.phases.hot.min_age = draft.phases.hot.min_age ?? '0ms';

      if (draft.phases.hot?.actions) {
        const hotPhaseActions = draft.phases.hot.actions;

        /**
         * HOT PHASE ROLLOVER
         */
        if (isUsingRollover) {
          // Rollover may not exist if editing an existing policy with initially no rollover configured
          if (!hotPhaseActions.rollover) {
            hotPhaseActions.rollover = {};
          }

          const activeTriggerFields =
            hotMeta?.customRollover?.triggerFields ?? DEFAULT_ROLLOVER_TRIGGER_FIELDS;
          const activeRestrictionFields = hotMeta?.customRollover?.restrictionFields ?? [];
          const activeRolloverFields = new Set<RolloverField>([
            ...activeTriggerFields,
            ...activeRestrictionFields,
          ]);
          const controlledRolloverFields: RolloverField[] = [
            ...ROLLOVER_TRIGGER_FIELDS,
            ...ROLLOVER_RESTRICTION_FIELDS,
          ];
          const updatedRollover = updatedPolicy.phases.hot?.actions.rollover as
            | RolloverAction
            | undefined;

          controlledRolloverFields.forEach((field) => {
            const formValue = updatedRollover?.[field];
            if (!activeRolloverFields.has(field) || !hasRolloverValue(formValue)) {
              delete hotPhaseActions.rollover![field];
              return;
            }

            if (!numberRolloverFields.has(field)) {
              (hotPhaseActions.rollover as Record<string, unknown>)[field] = `${
                hotPhaseActions.rollover![field]
              }${getRolloverUnit(data, field)}`;
            }
          });

          /**
           * HOT PHASE FORCEMERGE
           */
          if (!updatedPolicy.phases.hot?.actions?.forcemerge) {
            delete hotPhaseActions.forcemerge;
          } else if (hotMeta?.bestCompression) {
            hotPhaseActions.forcemerge!.index_codec = 'best_compression';
          } else {
            delete hotPhaseActions.forcemerge!.index_codec;
          }

          if (hotMeta?.bestCompression && hotPhaseActions.forcemerge) {
            hotPhaseActions.forcemerge.index_codec = 'best_compression';
          }

          /**
           * HOT PHASE READ-ONLY
           */
          if (hotMeta?.readonlyEnabled) {
            hotPhaseActions.readonly = hotPhaseActions.readonly ?? {};
          } else {
            delete hotPhaseActions.readonly;
          }
          /**
           * HOT PHASE SHRINK
           */
          if (!updatedPolicy.phases.hot?.actions?.shrink) {
            delete hotPhaseActions.shrink;
          } else if (hotMeta?.shrink?.isUsingShardSize) {
            delete hotPhaseActions.shrink!.number_of_shards;
            hotPhaseActions.shrink!.max_primary_shard_size = `${
              hotPhaseActions.shrink?.max_primary_shard_size
            }${hotMeta?.shrink?.maxPrimaryShardSizeUnits ?? ''}`;
          } else {
            delete hotPhaseActions.shrink!.max_primary_shard_size;
          }

          /**
           * HOT PHASE DOWNSAMPLE
           */
          if (_meta.hot?.downsample?.enabled) {
            hotPhaseActions.downsample = {
              ...hotPhaseActions.downsample,
              fixed_interval: `${_meta.hot.downsample.fixedIntervalSize!}${_meta.hot.downsample
                .fixedIntervalUnits!}`,
            };
          } else {
            delete hotPhaseActions.downsample;
          }
        } else {
          delete hotPhaseActions.rollover;
          delete hotPhaseActions.forcemerge;
          delete hotPhaseActions.readonly;
          delete hotPhaseActions.shrink;
        }
        /**
         * HOT PHASE SET PRIORITY
         */
        if (!updatedPolicy.phases.hot?.actions?.set_priority) {
          delete hotPhaseActions.set_priority;
        }

        /**
         * HOT PHASE SEARCHABLE SNAPSHOT
         */
        if (updatedPolicy.phases.hot?.actions?.searchable_snapshot) {
          hotPhaseActions.searchable_snapshot = {
            ...hotPhaseActions.searchable_snapshot,
            snapshot_repository: searchableSnapshotMeta?.repository,
          };
          if (hotPhaseActions.searchable_snapshot.force_merge_index === true) {
            delete hotPhaseActions.searchable_snapshot.force_merge_index;
          }
          if (hotPhaseActions.searchable_snapshot.force_merge_index === false) {
            delete hotPhaseActions.searchable_snapshot.force_merge_on_clone;
          }
          if (hotPhaseActions.searchable_snapshot.force_merge_on_clone === true) {
            delete hotPhaseActions.searchable_snapshot.force_merge_on_clone;
          }
        } else {
          delete hotPhaseActions.searchable_snapshot;
        }
      }
    }

    /**
     * WARM PHASE SERIALIZATION
     */
    if (warmMeta?.enabled) {
      draft.phases.warm = draft.phases.warm ?? { actions: {} };
      draft.phases.warm!.actions = draft.phases.warm?.actions ?? {};
      const warmPhase = draft.phases.warm!;

      /**
       * WARM PHASE MIN AGE
       *
       */
      if (updatedPolicy.phases.warm?.min_age) {
        warmPhase.min_age = `${updatedPolicy.phases.warm!.min_age}${warmMeta?.minAgeUnit ?? ''}`;
      }

      /**
       * WARM PHASE DATA ALLOCATION
       */
      warmPhase.actions = serializeMigrateAndAllocateActions(
        warmMeta,
        warmPhase.actions,
        originalPolicy?.phases.warm?.actions,
        updatedPolicy.phases.warm?.actions?.allocate?.number_of_replicas
      );

      /**
       * WARM PHASE FORCEMERGE
       */
      if (!updatedPolicy.phases.warm?.actions?.forcemerge) {
        delete warmPhase.actions.forcemerge;
      } else if (warmMeta?.bestCompression) {
        warmPhase.actions.forcemerge!.index_codec = 'best_compression';
      } else {
        delete warmPhase.actions.forcemerge!.index_codec;
      }

      /**
       * WARM PHASE READ ONLY
       */
      if (warmMeta?.readonlyEnabled) {
        warmPhase.actions.readonly = warmPhase.actions.readonly ?? {};
      } else {
        delete warmPhase.actions.readonly;
      }

      /**
       * WARM PHASE SET PRIORITY
       */
      if (!updatedPolicy.phases.warm?.actions?.set_priority) {
        delete warmPhase.actions.set_priority;
      }

      /**
       * WARM PHASE SHRINK
       */
      if (!updatedPolicy.phases.warm?.actions?.shrink) {
        delete warmPhase.actions.shrink;
      } else if (warmMeta?.shrink?.isUsingShardSize) {
        delete warmPhase.actions.shrink!.number_of_shards;
        warmPhase.actions.shrink!.max_primary_shard_size = `${
          warmPhase.actions.shrink?.max_primary_shard_size
        }${warmMeta?.shrink?.maxPrimaryShardSizeUnits ?? ''}`;
      } else {
        delete warmPhase.actions.shrink!.max_primary_shard_size;
      }

      /**
       * WARM PHASE DOWNSAMPLE
       */
      if (_meta.warm?.downsample?.enabled) {
        warmPhase.actions.downsample = {
          ...warmPhase.actions.downsample,
          fixed_interval: `${_meta.warm.downsample.fixedIntervalSize!}${_meta.warm.downsample
            .fixedIntervalUnits!}`,
        };
      } else {
        delete warmPhase.actions.downsample;
      }
    } else {
      delete draft.phases.warm;
    }

    /**
     * COLD PHASE SERIALIZATION
     */
    if (coldMeta?.enabled) {
      draft.phases.cold = draft.phases.cold ?? { actions: {} };
      draft.phases.cold!.actions = draft.phases.cold?.actions ?? {};
      const coldPhase = draft.phases.cold!;

      /**
       * COLD PHASE MIN AGE
       */
      if (updatedPolicy.phases.cold?.min_age) {
        coldPhase.min_age = `${updatedPolicy.phases.cold!.min_age}${coldMeta?.minAgeUnit ?? ''}`;
      }

      /**
       * COLD PHASE DATA ALLOCATION
       */
      coldPhase.actions = serializeMigrateAndAllocateActions(
        coldMeta,
        coldPhase.actions,
        originalPolicy?.phases.cold?.actions,
        updatedPolicy.phases.cold?.actions?.allocate?.number_of_replicas
      );

      /**
       * COLD PHASE FREEZE
       * The freeze action has been removed in 8.0.
       * Clean up any policies that still have this action configured
       */
      if (coldPhase.actions.freeze) {
        delete coldPhase.actions.freeze;
      }

      /**
       * COLD PHASE READ ONLY
       */
      if (coldMeta?.readonlyEnabled) {
        coldPhase.actions.readonly = coldPhase.actions.readonly ?? {};
      } else {
        delete coldPhase.actions.readonly;
      }

      /**
       * COLD PHASE SET PRIORITY
       */
      if (!updatedPolicy.phases.cold?.actions?.set_priority) {
        delete coldPhase.actions.set_priority;
      }

      /**
       * COLD PHASE SEARCHABLE SNAPSHOT
       */
      if (updatedPolicy.phases.cold?.actions?.searchable_snapshot) {
        coldPhase.actions.searchable_snapshot = {
          ...coldPhase.actions.searchable_snapshot,
          snapshot_repository: searchableSnapshotMeta?.repository,
        };
        if (coldPhase.actions.searchable_snapshot.force_merge_index === true) {
          delete coldPhase.actions.searchable_snapshot.force_merge_index;
        }
        if (coldPhase.actions.searchable_snapshot.force_merge_index === false) {
          delete coldPhase.actions.searchable_snapshot.force_merge_on_clone;
        }
        if (coldPhase.actions.searchable_snapshot.force_merge_on_clone === true) {
          delete coldPhase.actions.searchable_snapshot.force_merge_on_clone;
        }
      } else {
        delete coldPhase.actions.searchable_snapshot;
      }

      /**
       * COLD PHASE DOWNSAMPLE
       */
      if (_meta.cold?.downsample?.enabled) {
        coldPhase.actions.downsample = {
          ...coldPhase.actions.downsample,
          fixed_interval: `${_meta.cold.downsample.fixedIntervalSize!}${_meta.cold.downsample
            .fixedIntervalUnits!}`,
        };
      } else {
        delete coldPhase.actions.downsample;
      }
    } else {
      delete draft.phases.cold;
    }

    /**
     * FROZEN PHASE SERIALIZATION
     */
    if (frozenMeta?.enabled) {
      draft.phases.frozen = draft.phases.frozen ?? { actions: {} };
      draft.phases.frozen!.actions = draft.phases.frozen?.actions ?? {};
      const frozenPhase = draft.phases.frozen!;

      /**
       * FROZEN PHASE MIN AGE
       */
      if (updatedPolicy.phases.frozen?.min_age) {
        frozenPhase.min_age = `${updatedPolicy.phases.frozen!.min_age}${
          frozenMeta?.minAgeUnit ?? ''
        }`;
      }

      /**
       * FROZEN PHASE SEARCHABLE SNAPSHOT
       */
      if (updatedPolicy.phases.frozen?.actions?.searchable_snapshot) {
        frozenPhase.actions.searchable_snapshot = {
          ...frozenPhase.actions.searchable_snapshot,
          snapshot_repository: searchableSnapshotMeta?.repository,
        };
        if (frozenPhase.actions.searchable_snapshot.force_merge_index === true) {
          delete frozenPhase.actions.searchable_snapshot.force_merge_index;
        }
        if (frozenPhase.actions.searchable_snapshot.force_merge_index === false) {
          delete frozenPhase.actions.searchable_snapshot.force_merge_on_clone;
        }
        if (frozenPhase.actions.searchable_snapshot.force_merge_on_clone === true) {
          delete frozenPhase.actions.searchable_snapshot.force_merge_on_clone;
        }
      } else {
        delete frozenPhase.actions.searchable_snapshot;
      }
    } else {
      delete draft.phases.frozen;
    }

    /**
     * DELETE PHASE SERIALIZATION
     */
    if (deleteMeta?.enabled) {
      draft.phases.delete = draft.phases.delete ?? { actions: {} };
      const deletePhase = draft.phases.delete!;

      /**
       * DELETE PHASE DELETE
       */
      deletePhase.actions = deletePhase.actions ?? {};
      deletePhase.actions.delete = deletePhase.actions.delete ?? {};

      /**
       * DELETE PHASE MIN AGE
       */
      if (updatedPolicy.phases.delete?.min_age) {
        deletePhase.min_age = `${updatedPolicy.phases.delete!.min_age}${
          deleteMeta?.minAgeUnit ?? ''
        }`;
      }

      /**
       * DELETE PHASE WAIT FOR SNAPSHOT
       */
      if (!updatedPolicy.phases.delete?.actions?.wait_for_snapshot) {
        delete deletePhase.actions.wait_for_snapshot;
      }
    } else {
      delete draft.phases.delete;
    }

    return draft;
  };
