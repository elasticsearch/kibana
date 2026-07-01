/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { handleActions } from 'redux-actions';
import { coreServices } from '../../services/kibana_services';
import { getDefaultWorkpad } from '../defaults';

import { APP_ROUTE_WORKPAD } from '../../../common/lib/constants';

export const workpadReducer = handleActions(
  {
    ['setWorkpad']: (workpadState, { payload }) => {
      coreServices.chrome.recentlyAccessed.add(
        `${APP_ROUTE_WORKPAD}/${payload.id}`,
        payload.name,
        payload.id
      );
      return payload;
    },

    ['sizeWorkpad']: (workpadState, { payload }) => {
      return { ...workpadState, ...payload };
    },

    ['setColors']: (workpadState, { payload }) => {
      return { ...workpadState, colors: payload };
    },

    ['setName']: (workpadState, { payload }) => {
      coreServices.chrome.recentlyAccessed.add(
        `${APP_ROUTE_WORKPAD}/${workpadState.id}`,
        payload,
        workpadState.id
      );
      return { ...workpadState, name: payload };
    },

    ['setWriteable']: (workpadState, { payload }) => {
      return { ...workpadState, isWriteable: Boolean(payload) };
    },

    ['setWorkpadCSS']: (workpadState, { payload }) => {
      return { ...workpadState, css: payload };
    },

    ['setWorkpadVariables']: (workpadState, { payload }) => {
      return { ...workpadState, variables: payload };
    },

    // Syncs the server-stamped modified time into state after a save. Kept separate
    // from the edit reducers (which never touch `@timestamp`) so a changed
    // `@timestamp` reliably signals a server (re)load rather than a local edit.
    ['setWorkpadTimestamp']: (workpadState, { payload }) => {
      return { ...workpadState, '@timestamp': payload };
    },

    ['resetWorkpad']: () => ({ ...getDefaultWorkpad() }),
  },
  {}
);
