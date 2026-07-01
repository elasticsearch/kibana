/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FormInternal } from '../types';

import { getPhaseEnabled } from './get_phase_enabled';

type MetaOverrides = Partial<
  Omit<FormInternal['_meta'], 'hot' | 'warm' | 'cold' | 'frozen' | 'delete'>
> & {
  hot?: Partial<FormInternal['_meta']['hot']>;
  warm?: Partial<FormInternal['_meta']['warm']>;
  cold?: Partial<FormInternal['_meta']['cold']>;
  frozen?: Partial<FormInternal['_meta']['frozen']>;
  delete?: Partial<FormInternal['_meta']['delete']>;
  searchableSnapshot?: Partial<FormInternal['_meta']['searchableSnapshot']>;
};

const createFormData = (metaOverrides: MetaOverrides = {}): FormInternal => {
  const defaultMeta: FormInternal['_meta'] = {
    hot: {
      enabled: undefined,
      readonlyEnabled: false,
      customRollover: {
        enabled: false,
        triggerFields: [],
        restrictionFields: [],
      },
      bestCompression: false,
      shrink: {
        isUsingShardSize: false,
      },
      downsample: {
        enabled: false,
      },
    },
    warm: {
      enabled: false,
      warmPhaseOnRollover: false,
      readonlyEnabled: false,
      dataTierAllocationType: 'none',
      minAgeToMilliSeconds: 0,
      bestCompression: false,
      shrink: {
        isUsingShardSize: false,
      },
      downsample: {
        enabled: false,
      },
    },
    cold: {
      enabled: false,
      readonlyEnabled: false,
      dataTierAllocationType: 'none',
      minAgeToMilliSeconds: 0,
      downsample: {
        enabled: false,
      },
    },
    frozen: {
      enabled: false,
      minAgeToMilliSeconds: 0,
    },
    delete: {
      enabled: false,
      minAgeToMilliSeconds: 0,
    },
    searchableSnapshot: {
      repository: '',
    },
  };

  return {
    name: 'test-policy',
    phases: {},
    _meta: {
      ...defaultMeta,
      ...metaOverrides,
      hot: { ...defaultMeta.hot, ...metaOverrides.hot },
      warm: { ...defaultMeta.warm, ...metaOverrides.warm },
      cold: { ...defaultMeta.cold, ...metaOverrides.cold },
      frozen: { ...defaultMeta.frozen, ...metaOverrides.frozen },
      delete: { ...defaultMeta.delete, ...metaOverrides.delete },
      searchableSnapshot: {
        ...defaultMeta.searchableSnapshot,
        ...metaOverrides.searchableSnapshot,
      },
    },
  };
};

describe('getPhaseEnabled', () => {
  it('returns true for hot phase when it is required regardless of the form enabled flag', () => {
    expect(
      getPhaseEnabled({
        phase: 'hot',
        isHotPhaseRequired: true,
        formData: createFormData({ hot: { enabled: false } }),
      })
    ).toBe(true);
  });

  it('returns the form enabled flag for hot phase when it is not required', () => {
    expect(
      getPhaseEnabled({
        phase: 'hot',
        isHotPhaseRequired: false,
        formData: createFormData({ hot: { enabled: true } }),
      })
    ).toBe(true);

    expect(
      getPhaseEnabled({
        phase: 'hot',
        isHotPhaseRequired: false,
        formData: createFormData({ hot: { enabled: false } }),
      })
    ).toBe(false);
  });

  it('returns false when hot phase is not required and the form enabled flag is unset', () => {
    expect(
      getPhaseEnabled({
        phase: 'hot',
        isHotPhaseRequired: false,
        formData: createFormData({ hot: { enabled: undefined } }),
      })
    ).toBe(false);
  });

  it('returns the form enabled flag for non-hot phases', () => {
    expect(
      getPhaseEnabled({
        phase: 'warm',
        isHotPhaseRequired: true,
        formData: createFormData({ warm: { enabled: true } }),
      })
    ).toBe(true);

    expect(
      getPhaseEnabled({
        phase: 'warm',
        isHotPhaseRequired: true,
        formData: createFormData({ warm: { enabled: false } }),
      })
    ).toBe(false);
  });
});
