/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SerializableRecord } from '@kbn/utility-types';
import type { DocView, DocViewerRestorableState, DocViewerShareableState } from '../../types';

/**
 * Maximum serialized length of the shareable doc-viewer state written to the URL.
 * Acts as a limit that keeps the payload bounded even if an individual
 * tab's `shareableStateSchema` forgets to bound a field.
 */
export const DOC_VIEWER_SHAREABLE_STATE_MAX_LENGTH = 4096;

/**
 * Projects the doc viewer's restorable per-tab state into its URL-shareable subset by running each
 * tab's `shareableStateSchema`. Tabs without a schema, or whose slice fails validation, are omitted.
 */
export const projectShareableTabsState = (
  docViews: DocView[],
  docViewerTabsState: DocViewerRestorableState['docViewerTabsState']
): SerializableRecord | undefined => {
  if (!docViewerTabsState) {
    return undefined;
  }

  const tabsState: SerializableRecord = {};

  for (const docView of docViews) {
    const schema = docView.shareableStateSchema;
    const slice = docViewerTabsState[docView.id];

    if (!schema || slice === undefined) {
      continue;
    }

    const result = schema.safeParse(slice);

    if (result.success) {
      tabsState[docView.id] = result.data as SerializableRecord[string];
    }
  }

  return Object.keys(tabsState).length > 0 ? tabsState : undefined;
};

/**
 * Drops the per-tab state when the whole envelope exceeds the size budget, keeping the (small)
 * selected tab id so at least the tab still restores.
 */
export const capShareableState = (state: DocViewerShareableState): DocViewerShareableState => {
  if (JSON.stringify(state).length <= DOC_VIEWER_SHAREABLE_STATE_MAX_LENGTH) {
    return state;
  }

  const { tabsState, ...rest } = state;
  return rest;
};

/**
 * Seeds the restorable state with the per-tab slices restored from a shared link, so a tab reopens
 * with its nested state. Restored (URL) slices take precedence over any local slice for the same tab.
 */
export const mergeShareableStateIntoRestorable = (
  initialState: DocViewerRestorableState | undefined,
  shareable: DocViewerShareableState | undefined
): DocViewerRestorableState | undefined => {
  if (!shareable?.tabsState) {
    return initialState;
  }

  return {
    ...initialState,
    docViewerTabsState: {
      ...initialState?.docViewerTabsState,
      ...shareable.tabsState,
    },
  };
};
