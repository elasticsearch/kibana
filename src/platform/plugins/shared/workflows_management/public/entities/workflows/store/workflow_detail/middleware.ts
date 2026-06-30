/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { AnyAction, Dispatch, Middleware, MiddlewareAPI } from '@reduxjs/toolkit';
import { debounce } from 'lodash';
import type { WorkflowYaml } from '@kbn/workflows';
import { _clearComputedData, _setComputedDataInternal, setYamlString } from './slice';
import { performComputation } from './utils/computation';
import type { RootState } from '../types';

const COMPUTATION_DEBOUNCE_MS = 500;

const compute = (
  yamlString: string,
  store: MiddlewareAPI<Dispatch<AnyAction>, RootState>,
  loadedDefinition?: WorkflowYaml
) => {
  try {
    const computed = performComputation(yamlString, loadedDefinition);
    store.dispatch(_setComputedDataInternal(computed));
  } catch (e) {
    store.dispatch(_clearComputedData());
  }
};

// Intentionally does not accept `loadedDefinition`: once the user starts
// editing, their in-progress YAML is the source of truth. The initial compute
// (below, with `loadedDefinition`) is a one-time bootstrap so the graph can
// render the server-parsed definition even when the client parser is stricter.
// If the client parse later fails on a user edit, the stateful layer's
// `lastValidRef` keeps the canvas showing the last successfully-parsed graph.
const debouncedCompute = debounce(
  (yamlString: string, store: MiddlewareAPI<Dispatch<AnyAction>, RootState>) =>
    compute(yamlString, store),
  COMPUTATION_DEBOUNCE_MS
);

// Side effects middleware - computes derived data when yamlString changes (debounced)
const workflowComputationMiddleware: Middleware =
  (store: MiddlewareAPI<Dispatch<AnyAction>, RootState>) => (next) => (action) => {
    const result = next(action);

    // Only react to yamlString changes
    if (setYamlString.match(action)) {
      debouncedCompute.cancel();

      const yamlString = action.payload;
      const { computed } = store.getState().detail;

      // If yamlString is empty/undefined, clear computed data and return
      if (!yamlString) {
        store.dispatch(_clearComputedData());
        return;
      }

      // Do computation immediately if not initialized yet, (computed is only undefined when never set)
      if (!computed) {
        // On initial load pass the server-parsed definition so the graph renders
        // even when the client-side YAML parser can't handle the workflow's syntax.
        const loadedDefinition = store.getState().detail.workflow?.definition ?? undefined;
        compute(yamlString, store, loadedDefinition);
      } else {
        debouncedCompute(yamlString, store);
      }
    }

    return result;
  };

export const workflowDetailMiddleware: Middleware[] = [workflowComputationMiddleware];
