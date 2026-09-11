/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { APP_STATE_URL_KEY, GLOBAL_STATE_URL_KEY } from '@kbn/discover-plugin/common';
import type { CustomizationCallback } from '@kbn/discover-plugin/public/customizations/types';
import type { DiscoverContainerProps } from '@kbn/discover-plugin/public';
import type { DiscoverAppState } from '@kbn/discover-plugin/public/application/main/state_management/redux';
import { TestProviders } from '../../../../../common/mock';
import { createStartServicesMock } from '../../../../../common/lib/kibana/kibana_react.mock';
import type { DiscoverInTimelineContextType } from '../../../../../common/components/discover_in_timeline/context';
import { DiscoverInTimelineContext } from '../../../../../common/components/discover_in_timeline/context';
import { defaultDiscoverTimeRange } from '../../../../../common/components/discover_in_timeline/use_discover_in_timeline_actions';
import DiscoverTabContent from '.';
import { TimelineId } from '../../../../../../common/types';
import {
  createTimelineDiscoverTestState,
  setCurrentTabAppState,
} from './mocks/discover_test_state';

/** The state of the timeline the user is looking at, as Discover left it before the remount. */
const IN_SESSION_APP_STATE: DiscoverAppState = {
  query: { esql: 'from auditbeat-* | where ecs.version == "8.0.0"' },
  columns: ['event.category'],
};
const IN_SESSION_TIME_RANGE = {
  from: '2021-01-18T20:33:29.186Z',
  to: '2024-01-19T20:33:29.186Z',
  mode: 'absolute' as const,
};

const DEFAULT_APP_STATE: DiscoverAppState = { query: { esql: '' }, columns: [] };

const renderEsqlTab = async ({
  timelineRestorePending,
  urlAppState = IN_SESSION_APP_STATE,
  currentTabAppState = IN_SESSION_APP_STATE,
}: {
  timelineRestorePending: boolean;
  urlAppState?: DiscoverAppState;
  currentTabAppState?: DiscoverAppState;
}) => {
  const discoverState = await createTimelineDiscoverTestState({
    urlAppState,
    urlTimeRange: IN_SESSION_TIME_RANGE,
  });
  setCurrentTabAppState(discoverState.stateContainer, currentTabAppState);

  const startServices = createStartServicesMock();
  const DiscoverContainer = jest.fn<React.ReactElement, [DiscoverContainerProps]>(() => (
    <div data-test-subj="discover-container" />
  ));
  startServices.discover = { ...startServices.discover, DiscoverContainer };
  // The range the ES|QL search actually runs against, which is what the user is looking at.
  startServices.customDataService.query.timefilter.timefilter.getTime = jest
    .fn()
    .mockReturnValue(IN_SESSION_TIME_RANGE);

  const restorePendingRef = { current: timelineRestorePending };
  const contextValue = {
    discoverStateContainer: { current: undefined },
    setDiscoverStateContainer: jest.fn(),
    resetDiscoverAppState: jest.fn(),
    updateSavedSearch: jest.fn(),
    initializeLocalSavedSearch: jest.fn(),
    getAppStateFromSavedSearch: jest.fn(),
    defaultDiscoverAppState: DEFAULT_APP_STATE,
    timelineRestorePending: restorePendingRef,
  } as unknown as DiscoverInTimelineContextType;

  render(
    <TestProviders startServices={startServices}>
      <DiscoverInTimelineContext.Provider value={contextValue}>
        <DiscoverTabContent timelineId={TimelineId.test} />
      </DiscoverInTimelineContext.Provider>
    </TestProviders>
  );

  await waitFor(() => expect(DiscoverContainer).toHaveBeenCalled());

  const { customizationCallbacks } = DiscoverContainer.mock.calls[0][0];

  await act(async () => {
    await customizationCallbacks[0]({
      stateContainer: discoverState.stateContainer,
    } as unknown as Parameters<CustomizationCallback>[0]);
  });

  return { ...discoverState, restorePendingRef };
};

describe('Discover Tab Content', () => {
  it('should render', async () => {
    render(
      <TestProviders>
        <DiscoverTabContent timelineId={TimelineId.test} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId('timeline-embedded-discover')).toBeInTheDocument();
    });
  });

  // The tab unmounts whenever the user leaves it, so mounting is not on its own a signal that a
  // timeline is being opened. Treating it as one turns every Query → ES|QL round trip into a
  // restore, throwing away unsaved queries and moving the time range back to `now-15m`.
  describe('remounting for the timeline already on screen', () => {
    it('leaves the state Discover holds alone', async () => {
      const { stateStorageContainer } = await renderEsqlTab({ timelineRestorePending: false });

      expect(stateStorageContainer.get(APP_STATE_URL_KEY)).toEqual(IN_SESSION_APP_STATE);
      expect(stateStorageContainer.get(GLOBAL_STATE_URL_KEY)).toEqual(
        expect.objectContaining({ time: IN_SESSION_TIME_RANGE })
      );
    });

    it('keeps the time range the ES|QL search runs against when it has to seed the tab', async () => {
      const { stateStorageContainer } = await renderEsqlTab({
        timelineRestorePending: false,
        // Nothing of this timeline's own session is in the URL, so seeding it cannot lose work —
        // but the range the user is looking at still has to survive.
        urlAppState: { columns: ['stale'] },
        currentTabAppState: { columns: ['stale'] },
      });

      expect(stateStorageContainer.get(GLOBAL_STATE_URL_KEY)).toEqual(
        expect.objectContaining({ time: IN_SESSION_TIME_RANGE })
      );
    });
  });

  describe('mounting after a different timeline was opened', () => {
    it('replaces the state the previous timeline left behind', async () => {
      const { stateStorageContainer, restorePendingRef } = await renderEsqlTab({
        timelineRestorePending: true,
      });

      expect(stateStorageContainer.get(APP_STATE_URL_KEY)).toEqual(
        expect.not.objectContaining({ query: IN_SESSION_APP_STATE.query })
      );
      expect(stateStorageContainer.get(GLOBAL_STATE_URL_KEY)).toEqual(
        expect.objectContaining({ time: defaultDiscoverTimeRange })
      );
      // Consumed, so the next remount of this timeline is not treated as a restore.
      expect(restorePendingRef.current).toBe(false);
    });
  });

  // `DiscoverContainer` is mocked here (see `discoverPluginMock`), so these tests drive the
  // customization callback by hand. Whether the state it writes survives Discover's own tab
  // initialization — which prefers the range already in the URL — is covered in
  // `apply_timeline_state_to_discover.test.ts`.
  //
  // Still uncovered, tracked by https://github.com/elastic/kibana/issues/165913:
  it.skip('should update saved search if timeline title and description are updated', () => {});
  it.skip('should should not update saved search if the fetched saved search is same as discover updated saved search', () => {});
});
