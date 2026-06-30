/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ChangeHistoryAdapter } from '../types/change_history_adapter';
import { resolveChangeHistorySupports } from './resolve_change_history_supports';

const adapterWithRestore: ChangeHistoryAdapter = {
  listChanges: jest.fn(),
  getChange: jest.fn(),
  restoreChange: jest.fn(),
};

const adapterWithoutRestore: ChangeHistoryAdapter = {
  listChanges: jest.fn(),
  getChange: jest.fn(),
};

describe('resolveChangeHistorySupports', () => {
  it('enables restore when feature, adapter, and permissions allow it', () => {
    expect(
      resolveChangeHistorySupports(adapterWithRestore, {
        features: { restore: true },
        permissions: { canRestore: true },
      })
    ).toEqual({ restore: true });
  });

  it('disables restore when the feature flag is off', () => {
    expect(
      resolveChangeHistorySupports(adapterWithRestore, {
        features: { restore: false },
      })
    ).toEqual({ restore: false });
  });

  it('disables restore when the adapter does not implement restoreChange', () => {
    expect(
      resolveChangeHistorySupports(adapterWithoutRestore, {
        features: { restore: true },
      })
    ).toEqual({ restore: false });
  });

  it('disables restore when permissions are omitted', () => {
    expect(
      resolveChangeHistorySupports(adapterWithRestore, {
        features: { restore: true },
      })
    ).toEqual({ restore: false });
  });

  it('disables restore when permissions deny it', () => {
    expect(
      resolveChangeHistorySupports(adapterWithRestore, {
        features: { restore: true },
        permissions: { canRestore: false },
      })
    ).toEqual({ restore: false });
  });
});
