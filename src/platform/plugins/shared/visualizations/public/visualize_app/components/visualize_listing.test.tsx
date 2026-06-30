/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { mountWithIntl, shallowWithIntl } from '@kbn/test-jest-helpers';

import { VisualizeListing } from './visualize_listing';

const mockClearEditorState = jest.fn();
const mockSetBreadcrumbs = jest.fn();
const mockDocTitleChange = jest.fn();
const mockNavigateToUrl = jest.fn();

let mockActiveTab: string | undefined;

jest.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/' }),
  useParams: () => ({ activeTab: mockActiveTab }),
}));

jest.mock('@kbn/kibana-react-plugin/public', () => ({
  useKibana: () => ({
    services: {
      application: { navigateToUrl: mockNavigateToUrl, getUrlForApp: () => '' },
      executionContext: { set: jest.fn(), get: jest.fn() },
      chrome: {
        setBreadcrumbs: mockSetBreadcrumbs,
        docTitle: { change: mockDocTitleChange },
      },
      history: { push: jest.fn() },
      stateTransferService: { clearEditorState: mockClearEditorState },
      listingViewRegistry: new Set(),
      serverless: undefined,
    },
  }),
  useExecutionContext: jest.fn(),
}));

jest.mock('./visualize_listing_provider', () => ({
  VisualizeListingProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('./visualize_content_list', () => ({
  VisualizeContentList: () => null,
}));

jest.mock('@kbn/content-management-tabbed-table-list-view', () => ({
  TabbedTableListView: () => null,
}));

describe('VisualizeListing', () => {
  beforeEach(() => {
    mockActiveTab = undefined;
    mockClearEditorState.mockClear();
    mockSetBreadcrumbs.mockClear();
    mockDocTitleChange.mockClear();
    mockNavigateToUrl.mockClear();
  });

  it('renders the TabbedTableListView with the visualize-library title', () => {
    const wrapper = shallowWithIntl(<VisualizeListing />);
    expect(wrapper.prop('title')).toBe('Visualize library');
    expect(wrapper.prop('headingId')).toBe('visualizeListingHeading');
  });

  it('seeds the visualize tab and merges registry tabs', () => {
    const wrapper = shallowWithIntl(<VisualizeListing />);
    const tabs = wrapper.prop('tabs') as Array<{ id: string; title: string }>;
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toMatchObject({ id: 'visualizations', title: 'Visualizations' });
  });

  it('resets editor state, breadcrumbs and doc title on mount', () => {
    mountWithIntl(<VisualizeListing />);
    expect(mockClearEditorState).toHaveBeenCalled();
    expect(mockSetBreadcrumbs).toHaveBeenCalledWith([{ text: 'Visualize library' }]);
    expect(mockDocTitleChange).toHaveBeenCalledWith('Visualize library');
  });

  it('navigates via the application service when the active tab changes', () => {
    const wrapper = shallowWithIntl(<VisualizeListing />);
    const changeActiveTab = wrapper.prop('changeActiveTab') as (id: string) => void;
    changeActiveTab('annotations');
    expect(mockNavigateToUrl).toHaveBeenCalledWith('#/annotations');
  });

  it('renders the create button as a header action on the visualizations tab', () => {
    const wrapper = shallowWithIntl(<VisualizeListing />);
    const rightSideItems = wrapper.prop('rightSideItems') as React.ReactElement[];
    expect(rightSideItems).toHaveLength(1);
    expect(rightSideItems[0].props['data-test-subj']).toBe('newItemButton');
  });

  it('omits the create button when a non-visualizations tab is active', () => {
    mockActiveTab = 'annotations';
    const wrapper = shallowWithIntl(<VisualizeListing />);
    expect(wrapper.prop('rightSideItems')).toBeUndefined();
  });
});
