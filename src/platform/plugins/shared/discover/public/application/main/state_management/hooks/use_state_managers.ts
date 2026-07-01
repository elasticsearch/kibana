/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useEffect, useMemo, useState } from 'react';
import type { IKbnUrlStateStorage } from '@kbn/kibana-utils-plugin/public';
import {
  createInternalStateStore,
  createRuntimeStateManager,
  internalStateActions,
  type InternalStateStore,
  type RuntimeStateManager,
} from '../redux';
import { createTabsStorageManager } from '../tabs_storage_manager';
import type { DiscoverCustomizationContext } from '../../../../customizations';
import type { DiscoverServices } from '../../../../build_services';
import { DiscoverSearchSessionManager } from '../discover_search_session';

interface UseStateManagers {
  customizationContext: DiscoverCustomizationContext;
  services: DiscoverServices;
  urlStateStorage: IKbnUrlStateStorage;
}

interface UseStateManagersReturn {
  internalState: InternalStateStore;
  runtimeStateManager: RuntimeStateManager;
  searchSessionManager: DiscoverSearchSessionManager;
}

export const useStateManagers = ({
  services,
  urlStateStorage,
  customizationContext,
}: UseStateManagers): UseStateManagersReturn => {
  const tabsEnabled = !services.embeddableEditor.isByValueEditor();

  // syncing with the _tab part URL
  const [tabsStorageManager] = useState(() =>
    createTabsStorageManager({
      urlStateStorage,
      storage: services.storage,
      profileStateRegistry: services.profileStateRegistry,
      enabled: tabsEnabled,
    })
  );

  const [runtimeStateManager] = useState(() => createRuntimeStateManager());
  const [searchSessionManager] = useState(() => {
    return new DiscoverSearchSessionManager({
      history: services.history,
      session: services.data.search.session,
    });
  });
  const [internalState] = useState(() =>
    createInternalStateStore({
      services,
      customizationContext,
      runtimeStateManager,
      urlStateStorage,
      tabsStorageManager,
      searchSessionManager,
    })
  );

  useEffect(() => {
    const stopUrlSync = tabsStorageManager.startUrlSync({
      // if `_tab` in URL changes (for example via browser history), try to restore the previous state
      onChanged: (urlState) => {
        const { tabId: restoreTabId } = urlState;
        if (restoreTabId) {
          internalState.dispatch(internalStateActions.restoreTab({ restoreTabId }));
        }
      },
    });
    return () => {
      stopUrlSync();
    };
  }, [tabsStorageManager, internalState]);

  return useMemo(
    () => ({
      internalState,
      runtimeStateManager,
      searchSessionManager,
    }),
    [internalState, runtimeStateManager, searchSessionManager]
  );
};
