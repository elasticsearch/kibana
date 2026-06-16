/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import type { DataTableRecord } from '@kbn/discover-utils';
import type { EcsSecurityExtension as Ecs } from '@kbn/securitysolution-ecs';
import { useEventDetails } from '../../../../flyout/document_details/shared/hooks/use_event_details';
import { TakeActionButton } from './take_action_button';
import { TakeAction } from './take_action';
import { FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID } from './test_ids';

jest.mock('../../../../flyout/document_details/shared/hooks/use_event_details');
jest.mock('./take_action_button', () => ({
  TakeActionButton: jest.fn(() => <div data-test-subj="take-action-button-mock" />),
}));

const mockUseEventDetails = useEventDetails as jest.Mock;
const mockTakeActionButton = TakeActionButton as unknown as jest.Mock;

const createMockHit = (
  raw: Partial<DataTableRecord['raw']> = {},
  flattened: DataTableRecord['flattened'] = { 'host.name': 'test-host', 'user.name': null }
): DataTableRecord =>
  ({
    id: 'test-id',
    raw: { _id: 'test-event-id', _index: 'test-index', ...raw },
    flattened,
    isAnchor: false,
  } as DataTableRecord);

const mockEcsData: Ecs = { _id: 'test-event-id', _index: 'test-index' };
const mockRefetchFlyoutData = jest.fn().mockResolvedValue(undefined);
const mockOnAlertUpdated = jest.fn();
const mockOnShowNotes = jest.fn();

describe('<TakeAction />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseEventDetails.mockReturnValue({
      loading: false,
      dataAsNestedObject: mockEcsData,
      refetchFlyoutData: mockRefetchFlyoutData,
    });
  });

  it('should render a loading button while data is loading', () => {
    mockUseEventDetails.mockReturnValue({
      loading: true,
      dataAsNestedObject: null,
      dataFormattedForFieldBrowser: null,
      refetchFlyoutData: mockRefetchFlyoutData,
    });

    const { getByTestId, queryByTestId } = render(
      <TakeAction
        hit={createMockHit()}
        onAlertUpdated={mockOnAlertUpdated}
        onShowNotes={mockOnShowNotes}
      />
    );
    const button = getByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID);

    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Loading...');
    expect(queryByTestId('take-action-button-mock')).not.toBeInTheDocument();
  });

  it('should render a disabled Take action button when dataAsNestedObject is null', () => {
    mockUseEventDetails.mockReturnValue({
      loading: false,
      dataAsNestedObject: null,
      refetchFlyoutData: mockRefetchFlyoutData,
    });

    const { getByTestId, queryByTestId } = render(
      <TakeAction
        hit={createMockHit()}
        onAlertUpdated={mockOnAlertUpdated}
        onShowNotes={mockOnShowNotes}
      />
    );

    expect(getByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID)).toBeDisabled();
    expect(getByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID)).toHaveTextContent('Take action');
    expect(queryByTestId('take-action-button-mock')).not.toBeInTheDocument();
  });

  it('should render TakeActionButton when dataFormattedForFieldBrowser is null', () => {
    mockUseEventDetails.mockReturnValue({
      loading: false,
      dataAsNestedObject: mockEcsData,
      dataFormattedForFieldBrowser: null,
      refetchFlyoutData: mockRefetchFlyoutData,
    });

    const { getByTestId, queryByTestId } = render(
      <TakeAction
        hit={createMockHit()}
        onAlertUpdated={mockOnAlertUpdated}
        onShowNotes={mockOnShowNotes}
      />
    );

    expect(getByTestId('take-action-button-mock')).toBeInTheDocument();
    expect(queryByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID)).not.toBeInTheDocument();
  });

  it('should render TakeActionButton when data is available', () => {
    const { getByTestId, queryByTestId } = render(
      <TakeAction
        hit={createMockHit()}
        onAlertUpdated={mockOnAlertUpdated}
        onShowNotes={mockOnShowNotes}
      />
    );

    expect(getByTestId('take-action-button-mock')).toBeInTheDocument();
    expect(queryByTestId(FLYOUT_FOOTER_DROPDOWN_BUTTON_TEST_ID)).not.toBeInTheDocument();
  });

  it('should call useEventDetails with eventId and indexName from hit', () => {
    render(
      <TakeAction
        hit={createMockHit()}
        onAlertUpdated={mockOnAlertUpdated}
        onShowNotes={mockOnShowNotes}
      />
    );

    expect(mockUseEventDetails).toHaveBeenCalledWith({
      eventId: 'test-event-id',
      indexName: 'test-index',
    });
  });

  it('should pass hit, ecsData, refetchFlyoutData, onAlertUpdated and onShowNotes from useEventDetails to TakeActionButton', () => {
    const hit = createMockHit();
    const onAlertUpdated = jest.fn();
    render(<TakeAction hit={hit} onAlertUpdated={onAlertUpdated} onShowNotes={mockOnShowNotes} />);

    expect(mockTakeActionButton).toHaveBeenCalledWith(
      expect.objectContaining({
        hit,
        ecsData: mockEcsData,
        refetchFlyoutData: mockRefetchFlyoutData,
        onAlertUpdated,
        onShowNotes: mockOnShowNotes,
      }),
      expect.anything()
    );
  });
});
