/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { DiscoverTabType } from '@kbn/discover-session-constants';
import { DataSourceCategory } from '../../../../context_awareness/profiles';
import { createContextAwarenessMocks } from '../../../../context_awareness/__mocks__/context_awareness';
import { createDiscoverServicesMock } from '../../../../__mocks__/services';
import { getDiscoverInternalStateMock } from '../../../../__mocks__/discover_state.mock';
import { getTabStateMock } from './__mocks__/internal_state.mocks';
import { selectCurrentTabType, selectTabTypeForPersistence } from './runtime_state';

const TAB_ID = 'tab-1';

const setup = async ({
  resolvedProfile,
  inheritedTabType,
}: {
  resolvedProfile?: 'metrics' | 'logs';
  inheritedTabType?: DiscoverTabType;
} = {}) => {
  const services = createDiscoverServicesMock();
  const { profilesManagerMock, dataSourceProfileProviderMock } = createContextAwarenessMocks();

  services.profilesManager = profilesManagerMock;

  if (resolvedProfile) {
    jest.mocked(dataSourceProfileProviderMock.resolve).mockReturnValue(
      resolvedProfile === 'metrics'
        ? {
            isMatch: true,
            context: { category: DataSourceCategory.Metrics, tabType: DiscoverTabType.Metrics },
          }
        : {
            isMatch: true,
            context: { category: DataSourceCategory.Logs },
          }
    );
  }

  const toolkit = getDiscoverInternalStateMock({ services });

  await toolkit.initializeTabs();
  await toolkit.addNewTab({
    tab: getTabStateMock({ id: TAB_ID, initialInternalState: { tabType: inheritedTabType } }),
  });

  if (resolvedProfile) {
    await toolkit.initializeSingleTab({ tabId: TAB_ID });
  }

  return {
    runtimeStateManager: toolkit.runtimeStateManager,
    tabState: toolkit.getCurrentTab(),
  };
};

describe('selectCurrentTabType', () => {
  it('returns undefined before the data source profile has resolved', async () => {
    const { runtimeStateManager } = await setup();

    expect(selectCurrentTabType(runtimeStateManager, TAB_ID)).toBeUndefined();
  });

  it('returns the resolved tab type once the data source profile has resolved', async () => {
    const { runtimeStateManager } = await setup({ resolvedProfile: 'metrics' });

    expect(selectCurrentTabType(runtimeStateManager, TAB_ID)).toBe(DiscoverTabType.Metrics);
  });
});

describe('selectTabTypeForPersistence', () => {
  it('falls back to the inherited tab type when the tab has never resolved a profile', async () => {
    const { runtimeStateManager, tabState } = await setup({
      inheritedTabType: DiscoverTabType.Metrics,
    });

    expect(selectTabTypeForPersistence({ runtimeStateManager, tabState })).toBe(
      DiscoverTabType.Metrics
    );
  });

  it('prefers the resolved tab type over the inherited one once resolved -- gaining a type', async () => {
    const { runtimeStateManager, tabState } = await setup({ resolvedProfile: 'metrics' });

    expect(selectTabTypeForPersistence({ runtimeStateManager, tabState })).toBe(
      DiscoverTabType.Metrics
    );
  });

  it('drops the inherited tab type once resolved to a profile with none -- losing a type', async () => {
    const { runtimeStateManager, tabState } = await setup({
      resolvedProfile: 'logs',
      inheritedTabType: DiscoverTabType.Metrics,
    });

    expect(selectTabTypeForPersistence({ runtimeStateManager, tabState })).toBeUndefined();
  });
});
