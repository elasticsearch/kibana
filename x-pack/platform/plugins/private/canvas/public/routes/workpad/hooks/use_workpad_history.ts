/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { isEqual, omit } from 'lodash';
import { createPath } from 'history';
import { encode, decode } from '../route_state';
import type { State } from '../../../../types';

// `@timestamp` is server metadata: it's re-stamped on every save and synced back
// into state afterwards. It is not user-editable content, so a change to it alone
// must not create an undo/redo (browser history) entry — otherwise every edit
// would need two undos: one for the timestamp sync and one for the edit itself.
const withoutTimestamp = (persistentState: State['persistent']) =>
  persistentState?.workpad
    ? { ...persistentState, workpad: omit(persistentState.workpad, '@timestamp') }
    : persistentState;

export const useWorkpadHistory = () => {
  const history = useHistory<string>();
  const historyState = useSelector((state: State) => state.persistent);
  const hasRun = useRef<boolean>(false);

  useEffect(() => {
    const isInitialRun = !hasRun.current;
    const locationState = history.location.state;
    const decodedState = locationState ? decode(locationState) : {};
    const doesStateMatchLocationState = isEqual(
      withoutTimestamp(historyState),
      withoutTimestamp(decodedState)
    );
    const fullPath = createPath(history.location);

    hasRun.current = true;

    // If there is no location state, then let's replace the curent route with the location state
    // This will happen when navigating directly to a url (there will be no state on that link click)
    if (locationState === undefined) {
      history.replace(fullPath, encode(historyState));
    } else if (!isInitialRun && !doesStateMatchLocationState) {
      // There was a state change here
      // If the state of the route that we are on does not match this new state, then we are going to push
      history.push(fullPath, encode(historyState));
    }
  }, [history, historyState, history.location.search]);
};
