/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { SerializedPolicy } from '../../../../common/types';
import type { RolloverRestrictionField, RolloverTriggerField } from './constants';

export type DataTierAllocationType = 'node_roles' | 'node_attrs' | 'none';

export interface DataAllocationMetaFields {
  dataTierAllocationType: DataTierAllocationType;
  allocationNodeAttribute?: string;
}

export interface MinAgeField {
  minAgeUnit?: string;
  minAgeToMilliSeconds: number;
}

export interface ForcemergeFields {
  bestCompression: boolean;
}

interface ShrinkFields {
  shrink: {
    isUsingShardSize: boolean;
    maxPrimaryShardSizeUnits?: string;
  };
}

export interface DownsampleFields {
  downsample: {
    enabled: boolean;
    fixedIntervalSize?: string;
    fixedIntervalUnits?: string;
  };
}

interface HotPhaseMetaFields extends ForcemergeFields, ShrinkFields, DownsampleFields {
  /**
   * Hot phase can be optional when editing policies that don't include it.
   * For new policies (or policies that already contain hot), this remains enabled.
   */
  enabled?: boolean;
  readonlyEnabled: boolean;

  /**
   * Rollover settings controlled by the policy form.
   */
  customRollover: {
    enabled: boolean;
    triggerFields: RolloverTriggerField[];
    restrictionFields: RolloverRestrictionField[];
    maxPrimaryShardSizeUnit?: string;
    maxAgeUnit?: string;
    minPrimaryShardSizeUnit?: string;
    minAgeUnit?: string;

    /**
     * @deprecated This is the byte size unit for the max_size field which will by removed in version 8+ of the stack.
     */
    maxStorageSizeUnit?: string;
    /**
     * @deprecated This is the byte size unit for the min_size field which will be removed with max_size.
     */
    minStorageSizeUnit?: string;
  };
}

interface WarmPhaseMetaFields
  extends DataAllocationMetaFields,
    MinAgeField,
    ForcemergeFields,
    ShrinkFields,
    DownsampleFields {
  enabled: boolean;
  warmPhaseOnRollover: boolean;
  readonlyEnabled: boolean;
}

interface ColdPhaseMetaFields extends DataAllocationMetaFields, MinAgeField, DownsampleFields {
  enabled: boolean;
  readonlyEnabled: boolean;
}

interface FrozenPhaseMetaFields extends MinAgeField {
  enabled: boolean;
}

interface DeletePhaseMetaFields extends MinAgeField {
  enabled: boolean;
}

/**
 * Describes the shape of data after deserialization.
 */
export interface FormInternal extends SerializedPolicy {
  /**
   * This is a special internal-only field that is used to display or hide
   * certain form fields which affects what is ultimately serialized.
   */
  _meta: {
    hot: HotPhaseMetaFields;
    warm: WarmPhaseMetaFields;
    cold: ColdPhaseMetaFields;
    frozen: FrozenPhaseMetaFields;
    delete: DeletePhaseMetaFields;
    searchableSnapshot: {
      repository: string;
    };
  };
}
