/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import {
  HIGHLIGHTED_FIELDS_AGENT_STATUS_CELL_TEST_ID,
  HIGHLIGHTED_FIELDS_BASIC_CELL_TEST_ID,
  HIGHLIGHTED_FIELDS_CELL_TEST_ID,
  HIGHLIGHTED_FIELDS_LINKED_CELL_TEST_ID,
} from './test_ids';
import { HighlightedFieldsCell } from './highlighted_fields_cell';
import { TestProviders } from '../../../../common/mock';
import { useGetAgentStatus } from '../../../../management/hooks/agents/use_get_agent_status';
import { mockFlyoutApi } from '../../../../flyout/document_details/shared/mocks/mock_flyout_context';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import { HostPreviewPanelKey } from '../../../../flyout/entity_details/host_right';
import { HOST_PREVIEW_BANNER } from './host_entity_overview';
import { UserPreviewPanelKey } from '../../../../flyout/entity_details/user_right';
import { USER_PREVIEW_BANNER } from './user_entity_overview';
import { createTelemetryServiceMock } from '../../../../common/lib/telemetry/telemetry_service.mock';
import { OpenFlyoutLink } from '../../../shared/components/open_flyout_link';

jest.mock('../../../../management/hooks');
jest.mock('../../../../management/hooks/agents/use_get_agent_status');

jest.mock('@kbn/expandable-flyout');

const mockedTelemetry = createTelemetryServiceMock();
const mockOpenSystemFlyout = jest.fn();
jest.mock('../../../../common/lib/kibana', () => {
  const kibanaActual = jest.requireActual('../../../../common/lib/kibana');
  return {
    ...kibanaActual,
    useKibana: () => ({
      ...kibanaActual.useKibana(),
      services: {
        ...kibanaActual.useKibana().services,
        telemetry: mockedTelemetry,
        overlays: {
          ...kibanaActual.useKibana().services.overlays,
          openSystemFlyout: mockOpenSystemFlyout,
        },
      },
    }),
    useUiSetting: jest.fn().mockReturnValue(false),
  };
});

const useGetAgentStatusMock = useGetAgentStatus as jest.Mock;

const SCOPE_ID = 'scopeId';

const renderHighlightedFieldsCell = (values: string[], field: string, showPreview = false) =>
  render(
    <TestProviders>
      <HighlightedFieldsCell
        values={values}
        field={field}
        scopeId={SCOPE_ID}
        showPreview={showPreview}
      />
    </TestProviders>
  );

describe('<HighlightedFieldsCell />', () => {
  beforeAll(() => {
    jest.mocked(useExpandableFlyoutApi).mockReturnValue(mockFlyoutApi);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render a basic cell', () => {
    const { getByTestId } = renderHighlightedFieldsCell(['value'], 'field', true);

    expect(getByTestId(HIGHLIGHTED_FIELDS_BASIC_CELL_TEST_ID)).toBeInTheDocument();
  });

  it('should open host preview when click on host', () => {
    const { getByTestId } = renderHighlightedFieldsCell(['test host'], 'host.name', true);
    expect(getByTestId(HIGHLIGHTED_FIELDS_LINKED_CELL_TEST_ID)).toBeInTheDocument();

    getByTestId(HIGHLIGHTED_FIELDS_LINKED_CELL_TEST_ID).click();
    expect(mockFlyoutApi.openPreviewPanel).toHaveBeenCalledWith({
      id: HostPreviewPanelKey,
      params: {
        contextID: SCOPE_ID,
        hostName: 'test host',
        scopeId: SCOPE_ID,
        banner: HOST_PREVIEW_BANNER,
        entityId: undefined,
      },
    });
  });

  it('should pass entityId to host preview when provided (document identity / entity resolution)', () => {
    const { getByTestId } = render(
      <TestProviders>
        <HighlightedFieldsCell
          values={['test host']}
          field="host.name"
          scopeId={SCOPE_ID}
          showPreview
          entityId="euid-from-highlighted-fields"
        />
      </TestProviders>
    );
    getByTestId(HIGHLIGHTED_FIELDS_LINKED_CELL_TEST_ID).click();
    expect(mockFlyoutApi.openPreviewPanel).toHaveBeenCalledWith({
      id: HostPreviewPanelKey,
      params: {
        contextID: SCOPE_ID,
        hostName: 'test host',
        scopeId: SCOPE_ID,
        banner: HOST_PREVIEW_BANNER,
        entityId: 'euid-from-highlighted-fields',
      },
    });
  });

  it('should open user preview when click on user', () => {
    const { getByTestId } = renderHighlightedFieldsCell(['test user'], 'user.name', true);
    expect(getByTestId(HIGHLIGHTED_FIELDS_LINKED_CELL_TEST_ID)).toBeInTheDocument();

    getByTestId(HIGHLIGHTED_FIELDS_LINKED_CELL_TEST_ID).click();
    expect(mockFlyoutApi.openPreviewPanel).toHaveBeenCalledWith({
      id: UserPreviewPanelKey,
      params: {
        contextID: SCOPE_ID,
        userName: 'test user',
        scopeId: SCOPE_ID,
        banner: USER_PREVIEW_BANNER,
        entityId: undefined,
      },
    });
  });

  it('should open network details flyout when click on ip with renderFlyoutLink', () => {
    const { getByTestId } = render(
      <TestProviders>
        <HighlightedFieldsCell
          values={['100:XXX:XXX']}
          field="source.ip"
          scopeId={SCOPE_ID}
          renderFlyoutLink={OpenFlyoutLink}
        />
      </TestProviders>
    );

    getByTestId('securitySolutionFlyoutOpenFlyoutLink').click();
    expect(mockOpenSystemFlyout).toHaveBeenCalled();
  });

  it('should render agent status cell if field is `agent.status`', () => {
    useGetAgentStatusMock.mockReturnValue({
      isFetched: true,
      isLoading: false,
    });
    const { getByTestId } = render(
      <TestProviders>
        <HighlightedFieldsCell values={['value']} field={'agent.status'} scopeId={SCOPE_ID} />
      </TestProviders>
    );

    expect(getByTestId(HIGHLIGHTED_FIELDS_AGENT_STATUS_CELL_TEST_ID)).toBeInTheDocument();
  });

  it('should render SentinelOne agent status cell if field is agent.status and `originalField` is `observer.serial_number`', () => {
    useGetAgentStatusMock.mockReturnValue({
      isFetched: true,
      isLoading: false,
    });

    const { getByTestId } = render(
      <TestProviders>
        <HighlightedFieldsCell
          values={['value']}
          field={'agent.status'}
          originalField="observer.serial_number"
          scopeId={SCOPE_ID}
        />
      </TestProviders>
    );

    expect(getByTestId(HIGHLIGHTED_FIELDS_AGENT_STATUS_CELL_TEST_ID)).toBeInTheDocument();
  });

  it('should render Crowdstrike agent status cell if field is agent.status and `originalField` is `crowdstrike.event.DeviceId`', () => {
    useGetAgentStatusMock.mockReturnValue({
      isFetched: true,
      isLoading: false,
    });

    const { getByTestId } = render(
      <TestProviders>
        <HighlightedFieldsCell
          values={['value']}
          field={'agent.status'}
          originalField="crowdstrike.event.DeviceId"
          scopeId={SCOPE_ID}
        />
      </TestProviders>
    );

    expect(getByTestId(HIGHLIGHTED_FIELDS_AGENT_STATUS_CELL_TEST_ID)).toBeInTheDocument();
  });

  it('should not render if values is null', () => {
    const { container } = render(
      <TestProviders>
        <HighlightedFieldsCell values={null} field={'field'} scopeId={SCOPE_ID} />
      </TestProviders>
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('should truncate content if too large', () => {
    const values = new Array(5).fill(null).map((_, i) => i.toString());
    const { container } = render(
      <TestProviders>
        <HighlightedFieldsCell values={values} field={'field'} scopeId={SCOPE_ID} />
      </TestProviders>
    );

    function getDisplayedValues() {
      return container.querySelectorAll(`[data-test-subj$=${HIGHLIGHTED_FIELDS_CELL_TEST_ID}]`);
    }

    function getToggleButton() {
      return container.querySelector('[data-test-subj="toggle-show-more-button"]');
    }

    //  Only the first 2 values should be displayed by default
    expect(getDisplayedValues().length).toBe(2);

    //  The toggle button to see all the values should be visible
    expect(getToggleButton()).toBeVisible();

    //  Click the toggle button and check that the rest of the elements are visible
    fireEvent.click(getToggleButton()!);
    expect(getDisplayedValues().length).toBe(values.length);

    //  Click the toggle button again and check that the rest of the elements has been hidden
    fireEvent.click(getToggleButton()!);
    expect(getDisplayedValues().length).toBe(2);
  });
});
