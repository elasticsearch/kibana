/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ExtendedDiscoverStateContainer } from '@kbn/discover-plugin/public';
import React, { useRef, useCallback } from 'react';
import type { FC, PropsWithChildren } from 'react';
import { createDiscoverServicesMock } from '@kbn/discover-plugin/public/__mocks__/services';
import { getExtendedDiscoverStateContainer } from '@kbn/discover-plugin/public/customizations';
import { getDiscoverStateMock } from '@kbn/discover-plugin/public/__mocks__/discover_state.mock';
import { DiscoverInTimelineContext } from '../context';
import { useDiscoverInTimelineActions } from '../use_discover_in_timeline_actions';

type Props = PropsWithChildren<{}>;

jest.mock('../use_discover_in_timeline_actions');

export const createMockDiscoverStateContainer = (
  discoverServices: ReturnType<typeof createDiscoverServicesMock>
) => {
  const stateContainer = getDiscoverStateMock({ services: discoverServices });
  return getExtendedDiscoverStateContainer({
    internalState: stateContainer.internalState,
    injectCurrentTab: stateContainer.injectCurrentTab,
    getCurrentTab: stateContainer.getCurrentTab,
    runtimeStateManager: stateContainer.runtimeStateManager,
    stateStorage: stateContainer.stateStorage,
    services: discoverServices,
  });
};

export const MockDiscoverInTimelineContext: FC<Props> = ({ children }) => {
  const discoverServices = createDiscoverServicesMock();
  const discoverStateContainer = useRef<ExtendedDiscoverStateContainer | undefined>(
    createMockDiscoverStateContainer(discoverServices)
  );

  const setDiscoverStateContainer = useCallback(
    (stateContainer: ExtendedDiscoverStateContainer | undefined) => {
      discoverStateContainer.current = stateContainer;
    },
    []
  );

  const actions = useDiscoverInTimelineActions(discoverStateContainer);

  return (
    <DiscoverInTimelineContext.Provider
      value={{
        discoverStateContainer,
        setDiscoverStateContainer,
        ...actions,
      }}
    >
      {children}
    </DiscoverInTimelineContext.Provider>
  );
};
