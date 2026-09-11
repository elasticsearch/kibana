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
import { Provider } from 'react-redux-v7';
import { createStore } from 'redux-v4';
import { INVESTIGATION_SECTION_TEST_ID, InvestigationSection } from './investigation_section';
import { INVESTIGATION_SECTION_TITLE } from '../../../shared/constants/flyout_titles';
import { useExpandSection } from '../../../shared/hooks/use_expand_section';
import { useKibana } from '../../../../common/lib/kibana';
import { useIsInSecurityApp } from '../../../../common/hooks/is_in_security_app';
import { HighlightedFields } from './highlighted_fields';
import { HIGHLIGHTED_FIELDS_LINKED_CELL_TEST_ID } from './test_ids';
import { EVENT_SOURCE_FIELD_DESCRIPTOR } from '../../../../common/components/event_details/translations';
import { DOC_VIEWER_FLYOUT_HISTORY_KEY } from '@kbn/unified-doc-viewer';
import { documentFlyoutHistoryKey } from '../../../shared/constants/flyout_history';
import {
  HOST_NAME_FIELD_NAME,
  SIGNAL_RULE_NAME_FIELD_NAME,
} from '../../../../timelines/components/timeline/body/renderers/constants';
import { createFlyoutApiMock } from '../../../use_flyout_api.mock';
import * as useFlyoutApiModule from '../../../use_flyout_api';

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

const createMockHit = (
  flattened: DataTableRecord['flattened'],
  rawIndex?: string,
  source?: Record<string, unknown>
): DataTableRecord =>
  ({
    id: '1',
    // Only set raw._index when a test asks for it: the component prefers raw._index over the
    // flattened `_index` field, so a default here would shadow hits that rely on the fallback.
    // `_source` carries the nested `ancestors` objects that the Source-event link resolves against.
    raw: {
      ...(rawIndex ? { _index: rawIndex } : {}),
      ...(source ? { _source: source } : {}),
    },
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
    mockOpenSystemFlyout.mockReturnValue({ onClose: Promise.resolve(), close: jest.fn() });
    mockUseKibana.mockReturnValue({
      services: {
        overlays: {
          openSystemFlyout: mockOpenSystemFlyout,
        },
        storage: { get: jest.fn(), set: jest.fn(), remove: jest.fn() },
        telemetry: { reportEvent: jest.fn() },
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

  it('renders a rule link keyed by the rule UUID', () => {
    mockUseExpandSection.mockReturnValue(true);
    const ruleUuid = '28f4bc3f-5795-46e3-b5ca-d73cd4ab3e5c';
    const ruleHit = createMockHit({
      'event.kind': 'signal',
      'kibana.alert.rule.uuid': ruleUuid,
    });

    render(
      <IntlProvider locale="en">
        <Provider store={store}>
          <Router history={history}>
            <InvestigationSection hit={ruleHit} renderCellActions={mockRenderCellActions} />
          </Router>
        </Provider>
      </IntlProvider>
    );

    const renderFlyoutLink = mockHighlightedFields.mock.calls[0][0].renderFlyoutLink;
    const element = renderFlyoutLink!({
      field: SIGNAL_RULE_NAME_FIELD_NAME,
      value: 'Match All',
      children: <span />,
    }) as React.ReactElement;

    // The link target is the UUID (not the displayed name).
    expect(element.props.value).toBe(ruleUuid);
    expect(element.props.asParent).toBeUndefined();
  });

  it('falls back to plain children for a rule field when the rule UUID is unavailable', () => {
    mockUseExpandSection.mockReturnValue(true);

    render(
      <IntlProvider locale="en">
        <Provider store={store}>
          <Router history={history}>
            <InvestigationSection hit={mockHit} renderCellActions={mockRenderCellActions} />
          </Router>
        </Provider>
      </IntlProvider>
    );

    const renderFlyoutLink = mockHighlightedFields.mock.calls[0][0].renderFlyoutLink;
    const element = renderFlyoutLink!({
      field: SIGNAL_RULE_NAME_FIELD_NAME,
      value: 'Match All',
      children: <span data-test-subj="ruleChild" />,
    }) as React.ReactElement;

    // No UUID on the hit → no OpenFlyoutLink, just the passthrough children.
    expect(element.props.value).toBeUndefined();
    expect(element.props.children).toBeDefined();
  });

  it('renders a Source event link that opens the ancestor document in a new flyout', () => {
    mockUseExpandSection.mockReturnValue(true);
    const sourceEventHit = createMockHit(
      {
        'event.kind': 'signal',
        'signal.ancestors.index': '.internal.alerts-security.alerts-default',
      },
      undefined,
      {
        'signal.ancestors': [
          { id: 'ancestor-id-1', index: '.internal.alerts-security.alerts-default' },
        ],
      }
    );

    render(
      <IntlProvider locale="en">
        <Provider store={store}>
          <Router history={history}>
            <InvestigationSection hit={sourceEventHit} renderCellActions={mockRenderCellActions} />
          </Router>
        </Provider>
      </IntlProvider>
    );

    const renderFlyoutLink = mockHighlightedFields.mock.calls[0][0].renderFlyoutLink;
    const element = renderFlyoutLink!({
      field: EVENT_SOURCE_FIELD_DESCRIPTOR,
      value: 'ancestor-id-1',
      children: <span data-test-subj="sourceEventChild" />,
    }) as React.ReactElement;

    const { getByTestId } = render(
      <IntlProvider locale="en">
        <Provider store={store}>
          <Router history={history}>{element}</Router>
        </Provider>
      </IntlProvider>
    );

    act(() => getByTestId(HIGHLIGHTED_FIELDS_LINKED_CELL_TEST_ID).click());

    // The Source event opens the ancestor document as a new top-level flyout (session start),
    // consistent with the sibling host/user/rule links in the same table.
    expect(mockOpenSystemFlyout).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ session: 'start' })
    );
  });

  it('falls back to plain children for a Source event when the ancestors index is unavailable', () => {
    mockUseExpandSection.mockReturnValue(true);

    render(
      <IntlProvider locale="en">
        <Provider store={store}>
          <Router history={history}>
            <InvestigationSection hit={mockHit} renderCellActions={mockRenderCellActions} />
          </Router>
        </Provider>
      </IntlProvider>
    );

    const renderFlyoutLink = mockHighlightedFields.mock.calls[0][0].renderFlyoutLink;
    const element = renderFlyoutLink!({
      field: EVENT_SOURCE_FIELD_DESCRIPTOR,
      value: 'ancestor-id-1',
      children: <span data-test-subj="sourceEventChild" />,
    }) as React.ReactElement;

    // mockHit has no signal.ancestors.index → passthrough children, no link.
    expect(element.type).toBe(React.Fragment);

    const { queryByTestId } = render(
      <IntlProvider locale="en">
        <Provider store={store}>
          <Router history={history}>{element}</Router>
        </Provider>
      </IntlProvider>
    );

    expect(queryByTestId(HIGHLIGHTED_FIELDS_LINKED_CELL_TEST_ID)).not.toBeInTheDocument();
    expect(queryByTestId('sourceEventChild')).toBeInTheDocument();
  });

  it('keeps non-rule entity fields (host) as direct flyout links', () => {
    mockUseExpandSection.mockReturnValue(true);

    render(
      <IntlProvider locale="en">
        <Provider store={store}>
          <Router history={history}>
            <InvestigationSection hit={mockHit} renderCellActions={mockRenderCellActions} />
          </Router>
        </Provider>
      </IntlProvider>
    );

    const renderFlyoutLink = mockHighlightedFields.mock.calls[0][0].renderFlyoutLink;
    const element = renderFlyoutLink!({
      field: HOST_NAME_FIELD_NAME,
      value: 'host-1',
      children: <span />,
    }) as React.ReactElement;

    expect(element.props.value).toBe('host-1');
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

describe('InvestigationSection Source event link under CPS', () => {
  const mockHighlightedFields = jest.mocked(HighlightedFields);
  const flyoutApiMock = createFlyoutApiMock();
  let useFlyoutApiSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useExpandSection).mockReturnValue(true);
    // Stub the flyout API for this block only. The tests above intentionally exercise the real
    // useFlyoutApi chain (down to overlays.openSystemFlyout), so a file-wide jest.mock is not an
    // option; a scoped spy lets these tests assert on openDocumentFlyoutFromPattern directly.
    useFlyoutApiSpy = jest.spyOn(useFlyoutApiModule, 'useFlyoutApi').mockReturnValue(flyoutApiMock);
  });

  afterEach(() => {
    // Put the real implementation back so the spy cannot leak into other describe blocks.
    useFlyoutApiSpy.mockRestore();
  });

  const clickSourceEventLink = (hit: DataTableRecord) => {
    render(
      <IntlProvider locale="en">
        <InvestigationSection hit={hit} renderCellActions={mockRenderCellActions} />
      </IntlProvider>
    );

    const renderFlyoutLink = mockHighlightedFields.mock.calls[0][0].renderFlyoutLink;
    const element = renderFlyoutLink!({
      field: EVENT_SOURCE_FIELD_DESCRIPTOR,
      value: 'ancestor-id-1',
      children: <span data-test-subj="sourceEventChild" />,
    }) as React.ReactElement;

    const { getByTestId } = render(<IntlProvider locale="en">{element}</IntlProvider>);
    act(() => getByTestId(HIGHLIGHTED_FIELDS_LINKED_CELL_TEST_ID).click());
  };

  it('qualifies the ancestor index with the alert project alias for a linked-project alert', () => {
    clickSourceEventLink(
      createMockHit(
        {
          'event.kind': 'signal',
          'signal.ancestors.index': 'logs-endpoint.alerts.caf6b705.2026.08.13',
        },
        'linked_local_project:.ds-.alerts-security.alerts-default-2026.08.13-000001',
        {
          'signal.ancestors': [
            { id: 'ancestor-id-1', index: 'logs-endpoint.alerts.caf6b705.2026.08.13' },
          ],
        }
      )
    );

    expect(flyoutApiMock.openDocumentFlyoutFromPattern).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'ancestor-id-1',
        indexName: 'linked_local_project:logs-endpoint.alerts.caf6b705.2026.08.13',
      })
    );
  });

  it('leaves the ancestor index untouched for an origin alert', () => {
    clickSourceEventLink(
      createMockHit(
        {
          'event.kind': 'signal',
          'signal.ancestors.index': 'logs-endpoint.alerts.caf6b705.2026.08.13',
        },
        '.ds-.alerts-security.alerts-default-2026.08.13-000001',
        {
          'signal.ancestors': [
            { id: 'ancestor-id-1', index: 'logs-endpoint.alerts.caf6b705.2026.08.13' },
          ],
        }
      )
    );

    expect(flyoutApiMock.openDocumentFlyoutFromPattern).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'ancestor-id-1',
        indexName: 'logs-endpoint.alerts.caf6b705.2026.08.13',
      })
    );
  });
});
