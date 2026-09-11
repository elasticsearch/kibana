/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { GlobalQueryStateFromUrl } from '@kbn/data-plugin/public';
import { GLOBAL_STATE_URL_KEY } from '@kbn/discover-plugin/common';
import type { ExtendedDiscoverStateContainer } from '@kbn/discover-plugin/public';
import type { DiscoverAppState } from '@kbn/discover-plugin/public/application/main/state_management/redux';
import type { TimeRange } from '@kbn/es-query';

/**
 * Applies the state of the timeline being opened to its ES|QL tab, in both Redux and the URL.
 *
 * Discover initializes a tab immediately after the customization callbacks resolve
 * (`single_tab_view.tsx` awaits them, then dispatches `initializeSingleTab`), and that
 * initialization gives the `_g` time already present in the URL precedence over every other
 * source. The security URL still carries the `_a`/`_g` written while the previously opened
 * timeline was on screen, so seeding Redux alone is not enough — the timeline's state has to be
 * in the URL before Discover reads it. Writing both keeps the ES|QL tab derived from the
 * timeline rather than from whatever the previous timeline left behind.
 */
export const applyTimelineStateToDiscover = async ({
  stateContainer,
  appState,
  timeRange,
}: {
  stateContainer: ExtendedDiscoverStateContainer;
  appState: DiscoverAppState;
  timeRange: TimeRange;
}): Promise<void> => {
  const { internalState, injectCurrentTab, internalActions, stateStorage } = stateContainer;

  internalState.dispatch(
    injectCurrentTab(internalActions.updateGlobalState)({ globalState: { timeRange } })
  );
  internalState.dispatch(injectCurrentTab(internalActions.setAppState)({ appState }));
  // Replaces `_a` with the app state set above, dropping any keys the previous timeline left there.
  await internalState.dispatch(
    injectCurrentTab(internalActions.updateAppStateAndReplaceUrl)({ appState })
  );

  // `updateGlobalState` only writes Redux's copy of the range, and no Discover action exposed to
  // consumers writes the URL copy. Without this the restored range is discarded the moment
  // `initializeSingleTab` reads `_g` back.
  const globalUrlState = stateStorage.get<GlobalQueryStateFromUrl>(GLOBAL_STATE_URL_KEY);
  await stateStorage.set(
    GLOBAL_STATE_URL_KEY,
    { ...globalUrlState, time: timeRange },
    { replace: true }
  );
};
