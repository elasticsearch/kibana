/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { cloneDeep } from 'lodash';
import type { SerializedPolicy } from '../../../../../common/types';
import type {
  FormData,
  ValidationFuncArg,
} from '@kbn/es-ui-shared-plugin/static/forms/hook_form_lib';
import { defaultRolloverAction } from '../../../constants';
import { createDeserializer } from './deserializer';
import { createSerializer } from './serializer';
import { atLeastOneDataPhaseEnabled, DATA_PHASE_REQUIRED_VALIDATION_CODE } from './validations';
import type { FormInternal } from '../types';

const isObject = (v: unknown): v is { [key: string]: any } =>
  Object.prototype.toString.call(v) === '[object Object]';

const unknownValue = { some: 'value' };

const deserializer = createDeserializer(false);

const populateWithUnknownEntries = (v: unknown) => {
  if (isObject(v)) {
    for (const key of Object.keys(v)) {
      if (['require', 'include', 'exclude'].includes(key)) continue; // this will generate an invalid policy
      populateWithUnknownEntries(v[key]);
    }
    v.unknown = unknownValue;
    return;
  }
  if (Array.isArray(v)) {
    v.forEach(populateWithUnknownEntries);
  }
};

const originalPolicy: SerializedPolicy = {
  name: 'test',
  phases: {
    hot: {
      actions: {
        rollover: {
          max_age: '1d',
          max_primary_shard_size: '33gb',
          max_primary_shard_docs: 12,
          max_docs: 1000,
          max_size: '10gb',
        },
        forcemerge: {
          index_codec: 'best_compression',
          max_num_segments: 22,
        },
        readonly: {},
        set_priority: {
          priority: 1,
        },
      },
      min_age: '12ms',
    },
    warm: {
      min_age: '12ms',
      actions: {
        shrink: { number_of_shards: 12 },
        allocate: {
          number_of_replicas: 3,
          include: {
            some: 'value',
          },
          exclude: {
            some: 'value',
          },
        },
        readonly: {},
        set_priority: {
          priority: 10,
        },
        migrate: { enabled: true },
      },
    },
    cold: {
      min_age: '30ms',
      actions: {
        allocate: {
          number_of_replicas: 12,
          require: { test: 'my_value' },
          include: { test: 'my_value' },
          exclude: { test: 'my_value' },
        },
        readonly: {},
        set_priority: {
          priority: 12,
        },
        searchable_snapshot: {
          snapshot_repository: 'my repo!',
          force_merge_index: false,
        },
      },
    },
    delete: {
      min_age: '33ms',
      actions: {
        delete: {
          delete_searchable_snapshot: true,
        },
        wait_for_snapshot: {
          policy: 'test',
        },
      },
    },
  },
};

const originalMinimalPolicy: SerializedPolicy = {
  name: 'minimalPolicy',
  phases: {
    hot: { min_age: '0ms', actions: {} },
    warm: { min_age: '1d', actions: {} },
    cold: { min_age: '2d', actions: {} },
    delete: { min_age: '3d', actions: {} },
  },
};

describe('deserializer and serializer', () => {
  let policy: SerializedPolicy;
  let serializer: ReturnType<typeof createSerializer>;
  let formInternal: FormInternal;

  beforeEach(() => {
    policy = cloneDeep(originalPolicy);
    formInternal = deserializer(policy);
    // Because the policy object is not deepCloned by the form lib we
    // clone here so that we can mutate the policy and preserve the
    // original reference in the createSerializer
    serializer = createSerializer(cloneDeep(policy));
  });

  describe('unknown policy settings', function () {
    it('preserves any unknown properties', () => {
      const thisTestPolicy = cloneDeep(originalPolicy);
      // We populate all levels of the policy with entries our UI does not know about
      populateWithUnknownEntries(thisTestPolicy);
      serializer = createSerializer(thisTestPolicy);

      const copyOfThisTestPolicy = cloneDeep(thisTestPolicy);

      const _formInternal = deserializer(thisTestPolicy);
      expect(serializer(_formInternal)).toEqual(thisTestPolicy);

      // Assert that the policy we passed in is unaltered after deserialization and serialization
      expect(thisTestPolicy).not.toBe(copyOfThisTestPolicy);
      expect(thisTestPolicy).toEqual(copyOfThisTestPolicy);
    });

    it('except freeze action in the cold phase', () => {
      const policyWithoutFreeze = cloneDeep(originalPolicy);

      const policyWithFreeze = cloneDeep(policyWithoutFreeze);
      // add a freeze action to the cold phase
      policyWithFreeze.phases.cold!.actions!.freeze = {};
      serializer = createSerializer(policyWithFreeze);

      const _formInternal = deserializer(policyWithFreeze);
      expect(serializer(_formInternal)).toEqual(policyWithoutFreeze);
    });
  });

  it('removes all phases if they were disabled in the form', () => {
    formInternal._meta.warm.enabled = false;
    formInternal._meta.cold.enabled = false;
    formInternal._meta.delete.enabled = false;

    expect(serializer(formInternal)).toEqual({
      name: 'test',
      phases: {
        hot: policy.phases.hot, // We expect to see only the hot phase
      },
    });
  });

  it('removes the forcemerge action if it is disabled in the form', () => {
    delete formInternal.phases.hot!.actions.forcemerge;
    delete formInternal.phases.warm!.actions.forcemerge;

    const result = serializer(formInternal);

    expect(result.phases.hot!.actions.forcemerge).toBeUndefined();
    expect(result.phases.warm!.actions.forcemerge).toBeUndefined();
  });

  it('removes the index_codec option in the forcemerge action if it is disabled in the form', () => {
    formInternal.phases.warm!.actions.forcemerge = {
      max_num_segments: 22,
      index_codec: 'best_compression',
    };
    formInternal._meta.hot.bestCompression = false;
    formInternal._meta.warm.bestCompression = false;

    const result = serializer(formInternal);

    expect(result.phases.hot!.actions.forcemerge!.index_codec).toBeUndefined();
    expect(result.phases.warm!.actions.forcemerge!.index_codec).toBeUndefined();
  });

  it('removes the readonly action if it is disabled in hot', () => {
    formInternal._meta.hot.readonlyEnabled = false;

    const result = serializer(formInternal);

    expect(result.phases.hot!.actions.readonly).toBeUndefined();
  });

  it('removes the readonly action if it is disabled in warm', () => {
    formInternal._meta.warm.readonlyEnabled = false;

    const result = serializer(formInternal);

    expect(result.phases.warm!.actions.readonly).toBeUndefined();
  });

  it('removes the readonly action if it is disabled in cold', () => {
    formInternal._meta.cold.readonlyEnabled = false;

    const result = serializer(formInternal);

    expect(result.phases.cold!.actions.readonly).toBeUndefined();
  });

  it('allows force merge and readonly actions to be configured in hot with rollover enabled', () => {
    formInternal._meta.hot.bestCompression = false;
    formInternal.phases.hot!.actions.forcemerge = undefined;
    formInternal._meta.hot.readonlyEnabled = false;

    const result = serializer(formInternal);

    expect(result.phases.hot!.actions.readonly).toBeUndefined();
    expect(result.phases.hot!.actions.forcemerge).toBeUndefined();
  });

  it('removes set priority if it is disabled in the form', () => {
    delete formInternal.phases.hot!.actions.set_priority;
    delete formInternal.phases.warm!.actions.set_priority;
    delete formInternal.phases.cold!.actions.set_priority;

    const result = serializer(formInternal);

    expect(result.phases.hot!.actions.set_priority).toBeUndefined();
    expect(result.phases.warm!.actions.set_priority).toBeUndefined();
    expect(result.phases.cold!.actions.set_priority).toBeUndefined();
  });

  it('removes node attribute allocation when it is not selected in the form', () => {
    // Change from 'node_attrs' to 'node_roles'
    formInternal._meta.cold.dataTierAllocationType = 'node_roles';

    const result = serializer(formInternal);

    expect(result.phases.cold!.actions.allocate!.number_of_replicas).toBe(12);
    expect(result.phases.cold!.actions.allocate!.require).toBeUndefined();
    expect(result.phases.cold!.actions.allocate!.include).toBeUndefined();
    expect(result.phases.cold!.actions.allocate!.exclude).toBeUndefined();
  });

  it('removes forcemerge, readonly, and rollover config when rollover is disabled in hot phase', () => {
    formInternal._meta.hot.customRollover.enabled = false;

    const result = serializer(formInternal);

    expect(result.phases.hot!.actions.rollover).toBeUndefined();
    expect(result.phases.hot!.actions.forcemerge).toBeUndefined();
    expect(result.phases.hot!.actions.readonly).toBeUndefined();
  });

  it('adds default rollover configuration when enabled, but previously not configured', () => {
    delete formInternal.phases.hot!.actions.rollover;
    formInternal.phases.hot!.actions.rollover = {
      max_age: '30',
      max_primary_shard_size: '50',
    };
    formInternal._meta.hot.customRollover.triggerFields = ['max_primary_shard_size', 'max_age'];
    formInternal._meta.hot.customRollover.maxAgeUnit = 'd';
    formInternal._meta.hot.customRollover.maxPrimaryShardSizeUnit = 'gb';

    const result = serializer(formInternal);

    expect(result.phases.hot!.actions.rollover).toEqual(defaultRolloverAction);
  });

  it('preserves unknown rollover fields the UI does not manage', () => {
    formInternal.phases.hot!.actions.rollover!.min_primary_shard_size = '5gb';
    // @ts-expect-error - this is an unknown field that should be preserved by the serializer
    formInternal.phases.hot!.actions.rollover!.unknown_setting = 123;

    const result = serializer(formInternal);
    const rollover = result.phases.hot!.actions.rollover;

    expect(rollover).toEqual(
      expect.objectContaining({
        unknown_setting: 123,
      })
    );
    expect(rollover!.min_primary_shard_size).toBeUndefined();
    expect(rollover!.max_docs).toBe(1000);
    expect(rollover!.max_primary_shard_docs).toBe(12);
    expect(rollover!.max_size).toBe('10gb');
  });

  it('does not drop active rollover min_* fields on save', () => {
    const policyWithRolloverMinFields: SerializedPolicy = {
      name: 'policyWithRolloverMinFields',
      phases: {
        hot: {
          min_age: '0ms',
          actions: {
            rollover: {
              max_age: '30d',
              max_primary_shard_size: '50gb',
              min_age: '1d',
              min_docs: 100,
              min_size: '10gb',
              min_primary_shard_size: '5gb',
              min_primary_shard_docs: 50,
            },
          },
        },
      },
    };

    const nextSerializer = createSerializer(cloneDeep(policyWithRolloverMinFields));
    const nextFormInternal = deserializer(cloneDeep(policyWithRolloverMinFields));
    const result = nextSerializer(nextFormInternal);

    const rollover = result.phases.hot!.actions.rollover!;
    expect(rollover.min_age).toBe('1d');
    expect(rollover.min_docs).toBe(100);
    expect(rollover.min_size).toBe('10gb');
    expect(rollover.min_primary_shard_size).toBe('5gb');
    expect(rollover.min_primary_shard_docs).toBe(50);
    expect(rollover).toEqual(expect.objectContaining(defaultRolloverAction));
  });

  it('removes snapshot_repository when it is unset', () => {
    delete formInternal.phases.hot!.actions.searchable_snapshot;
    delete formInternal.phases.cold!.actions.searchable_snapshot;

    const result = serializer(formInternal);

    expect(result.phases.hot!.actions.searchable_snapshot).toBeUndefined();
    expect(result.phases.cold!.actions.searchable_snapshot).toBeUndefined();
  });

  it('preserves searchable_snapshot.force_merge_on_clone when configured', () => {
    formInternal.phases.cold!.actions.searchable_snapshot!.force_merge_index = true;
    formInternal.phases.cold!.actions.searchable_snapshot!.force_merge_on_clone = false;

    const result = serializer(formInternal);

    expect(result.phases.cold!.actions.searchable_snapshot!.force_merge_on_clone).toBe(false);
  });

  it('serializes searchable_snapshot.force_merge_on_clone when updated in the form', () => {
    formInternal.phases.cold!.actions.searchable_snapshot!.force_merge_on_clone = true;

    const result = serializer(formInternal);

    expect(result.phases.cold!.actions.searchable_snapshot!.force_merge_on_clone).toBeUndefined();
  });

  it('serializes searchable_snapshot.force_merge_index when updated in the form', () => {
    formInternal.phases.cold!.actions.searchable_snapshot!.force_merge_index = true;

    const result = serializer(formInternal);

    expect(result.phases.cold!.actions.searchable_snapshot!.force_merge_index).toBeUndefined();
  });

  it('does not serialize searchable_snapshot.force_merge_on_clone when set to true', () => {
    formInternal.phases.cold!.actions.searchable_snapshot!.force_merge_index = false;
    formInternal.phases.cold!.actions.searchable_snapshot!.force_merge_on_clone = true;

    const result = serializer(formInternal);

    expect(result.phases.cold!.actions.searchable_snapshot!.force_merge_index).toBe(false);
    expect(result.phases.cold!.actions.searchable_snapshot!.force_merge_on_clone).toBeUndefined();
  });

  it('does not serialize searchable_snapshot.force_merge_on_clone when force_merge_index is false', () => {
    formInternal.phases.cold!.actions.searchable_snapshot!.force_merge_index = false;
    formInternal.phases.cold!.actions.searchable_snapshot!.force_merge_on_clone = false;

    const result = serializer(formInternal);

    expect(result.phases.cold!.actions.searchable_snapshot!.force_merge_index).toBe(false);
    expect(result.phases.cold!.actions.searchable_snapshot!.force_merge_on_clone).toBeUndefined();
  });

  it('correctly serializes a minimal policy', () => {
    policy = cloneDeep(originalMinimalPolicy);
    const formInternalPolicy = cloneDeep(originalMinimalPolicy);
    serializer = createSerializer(policy);
    formInternal = deserializer(formInternalPolicy);

    // Simulate no action fields being configured in the UI. _Note_, we are not disabling these phases.
    // We are not setting any action field values in them so the action object will not be present.
    delete (formInternal.phases.hot as any).actions;
    delete (formInternal.phases.warm as any).actions;
    delete (formInternal.phases.cold as any).actions;
    delete (formInternal.phases.delete as any).actions;

    expect(serializer(formInternal)).toEqual({
      name: 'minimalPolicy',
      phases: {
        // Age is a required value for warm, cold and delete.
        hot: { min_age: '0ms', actions: {} },
        warm: { min_age: '1d', actions: {} },
        cold: { min_age: '2d', actions: {} },
        delete: { min_age: '3d', actions: { delete: {} } },
      },
    });
  });

  it('preserves policies without a hot phase', () => {
    const noHotPolicy: SerializedPolicy = {
      name: 'noHotPolicy',
      phases: {
        warm: { actions: {} },
        cold: { min_age: '3h', actions: {} },
      },
    };

    const formInternalNoHot = deserializer(cloneDeep(noHotPolicy));
    serializer = createSerializer(cloneDeep(noHotPolicy));

    expect(serializer(formInternalNoHot)).toEqual(noHotPolicy);
  });

  describe('validations', () => {
    const createValidationArg = (
      fields: Record<string, { value: boolean; clearErrors: jest.Mock }>,
      formData: Record<string, unknown> = {}
    ): ValidationFuncArg<FormData, unknown> =>
      ({
        path: '_meta.hot.enabled',
        value: undefined,
        formData,
        errors: [],
        customData: {
          provider: async () => undefined,
          value: undefined,
        },
        form: {
          getFormData: () => formData,
          getFields: () => fields,
        },
      } as unknown as ValidationFuncArg<FormData, unknown>);

    it('requires at least one data phase enabled', () => {
      const hotEnabledField = { value: false, clearErrors: jest.fn() };
      const warmEnabledField = { value: false, clearErrors: jest.fn() };
      const coldEnabledField = { value: false, clearErrors: jest.fn() };
      const frozenEnabledField = { value: false, clearErrors: jest.fn() };

      const arg = createValidationArg({
        '_meta.hot.enabled': hotEnabledField,
        '_meta.warm.enabled': warmEnabledField,
        '_meta.cold.enabled': coldEnabledField,
        '_meta.frozen.enabled': frozenEnabledField,
      });

      expect(atLeastOneDataPhaseEnabled(arg)).toEqual({
        code: DATA_PHASE_REQUIRED_VALIDATION_CODE,
        message: 'At least one data phase must be enabled.',
      });

      expect(hotEnabledField.clearErrors).not.toHaveBeenCalled();
      expect(warmEnabledField.clearErrors).not.toHaveBeenCalled();
      expect(coldEnabledField.clearErrors).not.toHaveBeenCalled();
      expect(frozenEnabledField.clearErrors).not.toHaveBeenCalled();
    });

    it('clears validation error when any data phase is enabled', () => {
      const hotEnabledField = { value: true, clearErrors: jest.fn() };
      const warmEnabledField = { value: false, clearErrors: jest.fn() };
      const coldEnabledField = { value: false, clearErrors: jest.fn() };
      const frozenEnabledField = { value: false, clearErrors: jest.fn() };

      const arg = createValidationArg({
        '_meta.hot.enabled': hotEnabledField,
        '_meta.warm.enabled': warmEnabledField,
        '_meta.cold.enabled': coldEnabledField,
        '_meta.frozen.enabled': frozenEnabledField,
      });

      expect(atLeastOneDataPhaseEnabled(arg)).toBeUndefined();

      expect(hotEnabledField.clearErrors).toHaveBeenCalledWith(DATA_PHASE_REQUIRED_VALIDATION_CODE);
      expect(warmEnabledField.clearErrors).toHaveBeenCalledWith(
        DATA_PHASE_REQUIRED_VALIDATION_CODE
      );
      expect(coldEnabledField.clearErrors).toHaveBeenCalledWith(
        DATA_PHASE_REQUIRED_VALIDATION_CODE
      );
      expect(frozenEnabledField.clearErrors).toHaveBeenCalledWith(
        DATA_PHASE_REQUIRED_VALIDATION_CODE
      );
    });

    it('does not error when hot is implicitly enabled but not registered', () => {
      const warmEnabledField = { value: false, clearErrors: jest.fn() };
      const coldEnabledField = { value: false, clearErrors: jest.fn() };
      const frozenEnabledField = { value: false, clearErrors: jest.fn() };

      const arg = createValidationArg({
        '_meta.warm.enabled': warmEnabledField,
        '_meta.cold.enabled': coldEnabledField,
        '_meta.frozen.enabled': frozenEnabledField,
      });

      expect(atLeastOneDataPhaseEnabled(arg)).toBeUndefined();
    });

    it('still errors if hot is missing but explicitly disabled in form data', () => {
      const warmEnabledField = { value: false, clearErrors: jest.fn() };
      const coldEnabledField = { value: false, clearErrors: jest.fn() };
      const frozenEnabledField = { value: false, clearErrors: jest.fn() };

      const arg = createValidationArg(
        {
          '_meta.warm.enabled': warmEnabledField,
          '_meta.cold.enabled': coldEnabledField,
          '_meta.frozen.enabled': frozenEnabledField,
        },
        { _meta: { hot: { enabled: false } } }
      );

      expect(atLeastOneDataPhaseEnabled(arg)).toEqual({
        code: DATA_PHASE_REQUIRED_VALIDATION_CODE,
        message: 'At least one data phase must be enabled.',
      });
    });
  });

  it('sets all known allocate options correctly', () => {
    formInternal.phases.warm!.actions.allocate!.number_of_replicas = 0;
    formInternal._meta.warm.dataTierAllocationType = 'node_attrs';
    formInternal._meta.warm.allocationNodeAttribute = 'some:value';

    expect(serializer(formInternal).phases.warm!.actions.allocate).toEqual({
      number_of_replicas: 0,
      require: {
        some: 'value',
      },
      include: {
        some: 'value',
      },
      exclude: {
        some: 'value',
      },
    });
  });

  it('sets allocate and migrate actions when defined together', () => {
    formInternal.phases.warm!.actions.allocate!.number_of_replicas = 0;
    formInternal._meta.warm.dataTierAllocationType = 'none';
    // This should not be set...
    formInternal._meta.warm.allocationNodeAttribute = 'some:value';

    const result = serializer(formInternal);

    expect(result.phases.warm!.actions.allocate).toEqual({
      number_of_replicas: 0,
    });

    expect(result.phases.warm!.actions.migrate).toEqual({
      enabled: false,
    });
  });

  it('removes shrink from hot and warm when unset', () => {
    delete formInternal.phases.hot!.actions!.shrink;
    delete formInternal.phases.warm!.actions!.shrink;

    const result = serializer(formInternal);

    expect(result.phases.hot!.actions.shrink).toBeUndefined();
    expect(result.phases.warm!.actions.shrink).toBeUndefined();
  });

  it('removes rollover action fields', () => {
    formInternal.phases.hot!.actions.rollover!.max_size = '';
    formInternal.phases.hot!.actions.rollover!.max_age = '';
    formInternal.phases.hot!.actions.rollover!.max_docs = '' as any;
    formInternal.phases.hot!.actions.rollover!.max_primary_shard_size = '';
    formInternal.phases.hot!.actions.rollover!.max_primary_shard_docs = '' as any;

    const result = serializer(formInternal);

    expect(result.phases.hot!.actions.rollover!.max_size).toBeUndefined();
    expect(result.phases.hot!.actions.rollover!.max_age).toBeUndefined();
    expect(result.phases.hot!.actions.rollover!.max_docs).toBeUndefined();
    expect(result.phases.hot!.actions.rollover!.max_primary_shard_size).toBeUndefined();
    expect(result.phases.hot!.actions.rollover!.max_primary_shard_docs).toBeUndefined();
  });
});
