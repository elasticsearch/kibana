/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { z } from '@kbn/zod';
import type { DocView } from '../../types';
import {
  DOC_VIEWER_SHAREABLE_STATE_MAX_LENGTH,
  capShareableState,
  mergeShareableStateIntoRestorable,
  projectShareableTabsState,
} from './shareable_state';

const createDocView = (
  id: string,
  shareableStateSchema?: DocView['shareableStateSchema']
): DocView => ({
  id,
  order: 0,
  title: id,
  shareableStateSchema,
  render: () => React.createElement(React.Fragment),
});

describe('projectShareableTabsState', () => {
  const withSchema = createDocView(
    'doc_view_with_schema',
    z.object({ selectedSubTab: z.string().max(100) })
  );
  const withoutSchema = createDocView('doc_view_without_schema');

  it('returns undefined when there is no restorable tabs state', () => {
    expect(projectShareableTabsState([withSchema], undefined)).toBeUndefined();
  });

  it('keeps only the fields allowed by each tab schema', () => {
    const result = projectShareableTabsState([withSchema], {
      doc_view_with_schema: { selectedSubTab: 'overview', scrollTop: 500 },
    });

    expect(result).toEqual({ doc_view_with_schema: { selectedSubTab: 'overview' } });
  });

  it('omits tabs that do not declare a schema', () => {
    expect(
      projectShareableTabsState([withoutSchema], { doc_view_without_schema: { foo: 'bar' } })
    ).toBeUndefined();
  });

  it('omits slices that fail validation', () => {
    expect(
      projectShareableTabsState([withSchema], { doc_view_with_schema: { selectedSubTab: 42 } })
    ).toBeUndefined();
  });
});

describe('capShareableState', () => {
  it('returns the state unchanged when within the size budget', () => {
    const state = { selectedTabId: 'doc_view_table', tabsState: { a: { b: 'c' } } };

    expect(capShareableState(state)).toBe(state);
  });

  it('drops tabsState but keeps the selected tab id when over budget', () => {
    const tabsState = {
      doc_view_with_schema: {
        selectedSubTab: 'x'.repeat(DOC_VIEWER_SHAREABLE_STATE_MAX_LENGTH),
      },
    };

    expect(capShareableState({ selectedTabId: 'doc_view_table', tabsState })).toEqual({
      selectedTabId: 'doc_view_table',
    });
  });
});

describe('mergeShareableStateIntoRestorable', () => {
  it('returns the initial state when there is nothing to restore', () => {
    const initialState = { docViewerTabsState: { a: { local: true } } };

    expect(mergeShareableStateIntoRestorable(initialState, undefined)).toBe(initialState);
  });

  it('lets restored slices take precedence over local ones per tab', () => {
    const result = mergeShareableStateIntoRestorable(
      { docViewerTabsState: { a: { from: 'local' }, b: { local: true } } },
      { tabsState: { a: { from: 'url' } } }
    );

    expect(result).toEqual({
      docViewerTabsState: { a: { from: 'url' }, b: { local: true } },
    });
  });
});
