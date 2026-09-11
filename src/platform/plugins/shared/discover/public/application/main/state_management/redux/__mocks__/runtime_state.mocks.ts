/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { BehaviorSubject } from 'rxjs';
import type { DataView } from '@kbn/data-views-plugin/common';
import type { DataSource } from '@kbn/data-source';
import type { ScopedDiscoverEBTManager } from '../../../../../ebt_manager';
import type { ConnectedCustomizationService } from '../../../../../customizations';
import type { ScopedProfilesManager } from '../../../../../context_awareness';
import type { DiscoverDataStateContainer } from '../../discover_data_state_container';
import {
  createRuntimeStateManager,
  type ReactiveTabRuntimeState,
  type RuntimeStateManager,
} from '../runtime_state';
import type { CascadedDocumentsFetcher } from '../../../data_fetching/cascaded_documents_fetcher';

export function getTabRuntimeStateMock(
  attrs: Partial<ReactiveTabRuntimeState> = {}
): ReactiveTabRuntimeState {
  return {
    dataStateContainer$: new BehaviorSubject<DiscoverDataStateContainer | undefined>(undefined),
    customizationService$: new BehaviorSubject<ConnectedCustomizationService | undefined>(
      undefined
    ),
    unifiedHistogramConfig$: new BehaviorSubject({ layoutPropsMap: {} }),
    scopedProfilesManager$: new BehaviorSubject({} as ScopedProfilesManager),
    scopedEbtManager$: new BehaviorSubject({} as ScopedDiscoverEBTManager),
    cascadedDocumentsFetcher$: new BehaviorSubject<CascadedDocumentsFetcher>(
      {} as CascadedDocumentsFetcher
    ),
    currentDataView$: new BehaviorSubject<DataView | undefined>(undefined),
    currentDataSource$: new BehaviorSubject<DataSource | undefined>(undefined),
    unsubscribeFn$: new BehaviorSubject<(() => void) | undefined>(undefined),
    ...attrs,
  };
}

export function getRuntimeStateManagerMock(
  attrs: Partial<RuntimeStateManager> = {}
): RuntimeStateManager {
  const runtimeStateManager = createRuntimeStateManager();

  return {
    ...runtimeStateManager,
    ...attrs,
  };
}
