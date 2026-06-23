/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, render } from '@testing-library/react';
import type { DataTableRecord } from '@kbn/discover-utils';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { Router } from '@kbn/shared-ux-router';
import { createMemoryHistory } from 'history';
import { Provider } from 'react-redux';
import { createStore } from 'redux';
import {
  INVESTIGATION_SECTION_TEST_ID,
  INVESTIGATION_SECTION_TITLE,
  InvestigationSection,
} from './investigation_section';
import { useExpandSection } from '../../../shared/hooks/use_expand_section';
import { useKibana } from '../../../../common/lib/kibana';
import { useIsInSecurityApp } from '../../../../common/hooks/is_in_security_app';
import { HighlightedFields } from './highlighted_fields';
import { DOC_VIEWER_FLYOUT_HISTORY_KEY } from '@kbn/unified-doc-viewer';
import { documentFlyoutHistoryKey } from '../../../shared/constants/flyout_history';

jest.mock('../../../shared/hooks/use_expand_section', () => ({
  useExpandSection: jest.fn(),
}));

jest.mock('../../../../common/lib/kibana', () => ({
  useKibana: jest.fn(),
}));
jest.mock('../../../shared/components/flyout_provider', () => ({
  flyoutProviders: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
jest.mock('../../../../common/hooks/is_in_security_app', () => ({
  useIsInSecurityApp: jest.fn(),
}));

jest.mock('./investigation_guide', () => ({
  InvestigationGuide: ({ onShowInvestigationGuide }: { onShowInvestigationGuide: () => void }) => (
    <button
      type="button"
      data-test-subj="investigationGuideMock"
      onClick={onShowInvestigationGuide}
    >
      {'InvestigationGuide'}
    </button>
  ),
}));

jest.mock('./highlighted_fields', () => ({
  HighlightedFields: jest.fn(() => <div data-test-subj="highlightedFieldsMock" />),
}));

jest.mock('../../../../detection_engine/rule_management/logic/use_rule_with_fallback', () => ({
  useRuleWithFallback: jest.fn().mockReturnValue({ rule: null, loading: false, error: null }),
}));

const createMockHit = (flattened: DataTableRecord['flattened']): DataTableRecord =>
  ({
    id: '1',
    raw: {},
    flattened,
    isAnchor: false,
  } as DataTableRecord);

const mockHit = createMockHit({
  'event.kind': 'signal',
});

const nonSignalMockHit = createMockHit({
  'event.kind': 'event',
});

const remoteAlertMockHit = createMockHit({
  'event.kind': 'signal',
  _index: 'remote-cluster:index-name',
});

const mockRenderCellActions = jest.fn(({ children }: { children: React.ReactNode }) => (
  <>{children}</>
));

describe('InvestigationSection', () => {
  const mockUseExpandSection = jest.mocked(useExpandSection);
  const mockUseKibana = jest.mocked(useKibana);
  const mockUseIsInSecurityApp = jest.mocked(useIsInSecurityApp);
  const mockHighlightedFields = jest.mocked(HighlightedFields);
  const mockOpenSystemFlyout = jest.fn();
  const store = createStore(() => ({}));
  const history = createMemoryHistory();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseKibana.mockReturnValue({
      services: {
        overlays: {
          openSystemFlyout: mockOpenSystemFlyout,
        },
      },
    } as unknown as ReturnType<typeof useKibana>);
    mockUseIsInSecurityApp.mockReturnValue(true);
    mockHighlightedFields.mockReturnValue(<div data-test-subj="highlightedFieldsMock" />);
  });

  it('renders the Investigation expandable section', () => {
    mockUseExpandSection.mockReturnValue(true);

    const { getByTestId } = render(
      <IntlProvider locale="en">
        <Provider store={store}>
          <Router history={history}>
            <InvestigationSection hit={mockHit} renderCellActions={mockRenderCellActions} />
          </Router>
        </Provider>
      </IntlProvider>
    );

    expect(getByTestId(`${INVESTIGATION_SECTION_TEST_ID}Header`)).toHaveTextContent(
      INVESTIGATION_SECTION_TITLE
    );
  });

  it('renders the component collapsed if value is false in local storage', () => {
    mockUseExpandSection.mockReturnValue(false);

    const { getByTestId } = render(
      <IntlProvider locale="en">
        <Provider store={store}>
          <Router history={history}>
            <InvestigationSection hit={mockHit} renderCellActions={mockRenderCellActions} />
          </Router>
        </Provider>
      </IntlProvider>
    );

    expect(getByTestId(`${INVESTIGATION_SECTION_TEST_ID}Content`)).not.toBeVisible();
  });

  it('renders the component expanded if value is true in local storage', () => {
    mockUseExpandSection.mockReturnValue(true);

    const { getByTestId } = render(
      <IntlProvider locale="en">
        <Provider store={store}>
          <Router history={history}>
            <InvestigationSection hit={mockHit} renderCellActions={mockRenderCellActions} />
          </Router>
        </Provider>
      </IntlProvider>
    );

    expect(getByTestId(`${INVESTIGATION_SECTION_TEST_ID}Content`)).toBeVisible();
  });

  it('renders investigation guide when document is signal', () => {
    mockUseExpandSection.mockReturnValue(true);

    const { getByTestId } = render(
      <IntlProvider locale="en">
        <Provider store={store}>
          <Router history={history}>
            <InvestigationSection hit={mockHit} renderCellActions={mockRenderCellActions} />
          </Router>
        </Provider>
      </IntlProvider>
    );

    expect(getByTestId('investigationGuideMock')).toBeInTheDocument();
  });

  it('does not render investigation guide when document is not signal', () => {
    mockUseExpandSection.mockReturnValue(true);

    const { queryByTestId } = render(
      <IntlProvider locale="en">
        <Provider store={store}>
          <Router history={history}>
            <InvestigationSection
              hit={nonSignalMockHit}
              renderCellActions={mockRenderCellActions}
            />
          </Router>
        </Provider>
      </IntlProvider>
    );

    expect(queryByTestId('investigationGuideMock')).not.toBeInTheDocument();
  });

  it('does not render investigation guide for a remote alert', () => {
    mockUseExpandSection.mockReturnValue(true);

    const { queryByTestId } = render(
      <IntlProvider locale="en">
        <Provider store={store}>
          <Router history={history}>
            <InvestigationSection
              hit={remoteAlertMockHit}
              renderCellActions={mockRenderCellActions}
            />
          </Router>
        </Provider>
      </IntlProvider>
    );

    expect(queryByTestId('investigationGuideMock')).not.toBeInTheDocument();
  });

  it('passes renderCellActions to HighlightedFields', () => {
    mockUseExpandSection.mockReturnValue(true);
    const localMockRenderCellActions = jest.fn(({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ));

    render(
      <IntlProvider locale="en">
        <Provider store={store}>
          <Router history={history}>
            <InvestigationSection hit={mockHit} renderCellActions={localMockRenderCellActions} />
          </Router>
        </Provider>
      </IntlProvider>
    );

    expect(mockHighlightedFields).toHaveBeenCalledWith(
      expect.objectContaining({ renderCellActions: localMockRenderCellActions }),
      expect.anything()
    );
  });

  it('uses Security history key when opening flyout inside Security app', () => {
    mockUseExpandSection.mockReturnValue(true);
    mockUseIsInSecurityApp.mockReturnValue(true);

    const { getByTestId } = render(
      <IntlProvider locale="en">
        <Provider store={store}>
          <Router history={history}>
            <InvestigationSection hit={mockHit} renderCellActions={mockRenderCellActions} />
          </Router>
        </Provider>
      </IntlProvider>
    );

    act(() => getByTestId('investigationGuideMock').click());

    expect(mockOpenSystemFlyout).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        historyKey: documentFlyoutHistoryKey,
        session: 'start',
      })
    );
  });

  it('uses Discover history key when opening flyout outside Security app', () => {
    mockUseExpandSection.mockReturnValue(true);
    mockUseIsInSecurityApp.mockReturnValue(false);

    const { getByTestId } = render(
      <IntlProvider locale="en">
        <Provider store={store}>
          <Router history={history}>
            <InvestigationSection hit={mockHit} renderCellActions={mockRenderCellActions} />
          </Router>
        </Provider>
      </IntlProvider>
    );

    act(() => getByTestId('investigationGuideMock').click());

    expect(mockOpenSystemFlyout).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        historyKey: DOC_VIEWER_FLYOUT_HISTORY_KEY,
        session: 'start',
      })
    );
  });
});
