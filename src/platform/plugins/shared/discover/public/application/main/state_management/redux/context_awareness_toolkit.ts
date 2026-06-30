/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isEqual } from 'lodash';
import { distinctUntilChanged, from, map, shareReplay } from 'rxjs';
import type { ContextAwarenessToolkit } from '../../../../context_awareness/toolkit';
import {
  createProfileStateAdapterFactory,
  type ProfileStateAdapter,
  type ProfileStateDefinition,
  type ProfileStateRegistry,
} from '../../../../context_awareness';
import type { InternalStateStore } from './internal_state';
import { internalStateActions } from '.';
import { selectTab } from './selectors';

export const createContextAwarenessToolkit = ({
  internalState,
  profileStateRegistry,
  tabId,
}: {
  internalState: InternalStateStore;
  profileStateRegistry: ProfileStateRegistry;
  tabId: string;
}): ContextAwarenessToolkit => {
  return {
    actions: {
      openInNewTab: async (params) => {
        await internalState.dispatch(internalStateActions.openInNewTabExtPointAction(params));
      },
      updateESQLQuery: (queryOrUpdater) => {
        internalState.dispatch(internalStateActions.updateESQLQuery({ tabId, queryOrUpdater }));
      },
      refreshData: () => {
        internalState.dispatch(internalStateActions.fetchData({ tabId }));
      },
      addFilter: (field, value, mode) => {
        internalState.dispatch(internalStateActions.addFilter({ tabId, field, value, mode }));
      },
      updateAdHocDataViews: async (adHocDataViews) => {
        await internalState.dispatch(internalStateActions.updateAdHocDataViews(adHocDataViews));
      },
      setExpandedDoc: (record, options) => {
        internalState.dispatch(
          internalStateActions.setExpandedDoc({
            tabId,
            expandedDoc: record,
            initialDocViewerTabId: options?.initialTabId,
          })
        );
      },
    },
    getStateAdapter: createProfileStateAdapterFactory({
      profileStateRegistry,
      createAdapter: <TState extends object>(
        definition: ProfileStateDefinition<TState>
      ): ProfileStateAdapter<TState> => {
        const getState = () => {
          const tabState = selectTab(internalState.getState(), tabId);

          return (tabState.profileState[definition.key] ?? definition.defaultState) as TState;
        };

        const state$ = from(internalState).pipe(
          map(getState),
          distinctUntilChanged(isEqual),
          shareReplay({ bufferSize: 1, refCount: true })
        );

        return {
          getState,
          getState$: () => state$,
          setState: (profileState) => {
            internalState.dispatch(
              internalStateActions.setProfileState({
                tabId,
                key: definition.key,
                profileState,
              })
            );
          },
          updateState: (stateUpdate) => {
            internalState.dispatch(
              internalStateActions.setProfileState({
                tabId,
                key: definition.key,
                profileState: { ...getState(), ...stateUpdate },
              })
            );
          },
        };
      },
    }),
  };
};
