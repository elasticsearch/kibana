/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataView } from '@kbn/data-views-plugin/common';
import type { DiscoverTabType } from '@kbn/discover-session-constants';
import type { DiscoverServices } from '../../../../../build_services';
import { DEFAULT_TAB_STATE } from '../constants';
import type { DiscoverAppState, RecentlyClosedTabState, TabState } from '../types';
import { fromTabStateToSavedObjectTab } from '../tab_mapping_utils';
import { getInitialAppState } from '../../utils/get_initial_app_state';

export const getTabStateMock = (
  partial: Partial<Omit<TabState, 'attributes'>> & {
    id: TabState['id'];
    attributes?: Partial<TabState['attributes']>;
  }
): TabState => ({
  ...DEFAULT_TAB_STATE,
  label: 'Untitled',
  ...partial,
  attributes: {
    ...DEFAULT_TAB_STATE.attributes,
    ...partial.attributes,
  },
});

export const getRecentlyClosedTabStateMock = (
  partial: Partial<Omit<RecentlyClosedTabState, 'attributes'>> & {
    id: RecentlyClosedTabState['id'];
    closedAt: RecentlyClosedTabState['closedAt'];
    attributes?: Partial<TabState['attributes']>;
  }
): RecentlyClosedTabState => ({ ...getTabStateMock(partial), closedAt: partial.closedAt });

export const getPersistedTabMock = ({
  tabId = 'test-tab',
  dataView,
  attributesOverrides,
  appStateOverrides = {},
  globalStateOverrides = {},
  initialInternalStateOverrides = {},
  overridenTimeRestore,
  services,
  tabType,
  profileState,
}: {
  tabId?: string;
  dataView: DataView;
  attributesOverrides?: Partial<TabState['attributes']>;
  appStateOverrides?: Partial<DiscoverAppState>;
  globalStateOverrides?: Partial<TabState['globalState']>;
  initialInternalStateOverrides?: Partial<TabState['initialInternalState']>;
  overridenTimeRestore?: boolean;
  services: DiscoverServices;
  tabType?: DiscoverTabType;
  profileState?: TabState['profileState'];
}) => {
  const appState = {
    ...getInitialAppState({
      initialUrlState: undefined,
      hasGlobalState: false,
      persistedTab: undefined,
      dataView,
      services,
    }),
    ...appStateOverrides,
  };
  return fromTabStateToSavedObjectTab({
    tab: getTabStateMock({
      id: tabId,
      initialInternalState: {
        serializedSearchSource: {
          index: dataView.id,
          query: appState.query,
        },
        ...initialInternalStateOverrides,
      },
      appState,
      globalState: globalStateOverrides,
      attributes: {
        ...DEFAULT_TAB_STATE.attributes,
        ...attributesOverrides,
      },
      ...(profileState ? { profileState } : {}),
    }),
    overridenTimeRestore,
    services,
    currentDataView: dataView,
    tabType,
  });
};
