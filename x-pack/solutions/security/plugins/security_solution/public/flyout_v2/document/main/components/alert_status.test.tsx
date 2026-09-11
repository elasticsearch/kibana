/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { DataTableRecord } from '@kbn/discover-utils';
import { render } from '@testing-library/react';
import { AlertStatus } from './alert_status';
import { WORKFLOW_STATUS_DETAILS_TEST_ID, WORKFLOW_STATUS_TITLE_TEST_ID } from './test_ids';
import { TestProviders } from '../../../../common/mock';
import { useBulkGetUserProfiles } from '../../../../common/components/user_profiles/use_bulk_get_user_profiles';

jest.mock('../../../../common/components/user_profiles/use_bulk_get_user_profiles');

const createMockHit = (flattened: DataTableRecord['flattened']): DataTableRecord =>
  ({
    id: '1',
    raw: {},
    flattened,
    isAnchor: false,
  } as DataTableRecord);

const alertHitWithStatus = createMockHit({
  'event.kind': 'signal',
  'kibana.alert.workflow_user': 'user-id-1',
  'kibana.alert.workflow_status_updated_at': ['2023-11-01T22:33:26.893Z'],
});

const alertHitWithoutWorkflowUser = createMockHit({
  'event.kind': 'signal',
  'kibana.alert.workflow_status_updated_at': '2023-11-01T22:33:26.893Z',
});

const alertHitWithNullWorkflowUser = createMockHit({
  'event.kind': 'signal',
  'kibana.alert.workflow_user': null,
  'kibana.alert.workflow_status_updated_at': '2023-11-01T22:33:26.893Z',
});

const renderAlertStatus = (hit: DataTableRecord) =>
  render(
    <TestProviders>
      <AlertStatus hit={hit} />
    </TestProviders>
  );

const mockUserProfiles = [
  { uid: 'user-id-1', enabled: true, user: { username: 'user1', full_name: 'User 1' }, data: {} },
];

describe('<AlertStatus />', () => {
  const mockUseBulkGetUserProfiles = useBulkGetUserProfiles as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseBulkGetUserProfiles.mockReturnValue({
      data: mockUserProfiles,
    });
  });

  it('should render alert status history information', () => {
    const { getByTestId } = renderAlertStatus(alertHitWithStatus);

    const details = getByTestId(WORKFLOW_STATUS_DETAILS_TEST_ID);
    expect(getByTestId(WORKFLOW_STATUS_TITLE_TEST_ID)).toBeInTheDocument();
    expect(details).toBeInTheDocument();
    expect(details).toHaveTextContent('Alert status updated by');
    expect(details).toHaveTextContent('User 1');
    expect(mockUseBulkGetUserProfiles).toHaveBeenCalledWith({ uids: new Set(['user-id-1']) });
  });

  it('should render empty component if missing workflow_user value', async () => {
    const { container } = renderAlertStatus(alertHitWithoutWorkflowUser);

    expect(container).toBeEmptyDOMElement();
    expect(mockUseBulkGetUserProfiles).toHaveBeenCalledWith({ uids: new Set() });
  });

  it('should render empty component and not request profile for null workflow_user', async () => {
    const { container } = renderAlertStatus(alertHitWithNullWorkflowUser);

    expect(container).toBeEmptyDOMElement();
    expect(mockUseBulkGetUserProfiles).toHaveBeenCalledWith({ uids: new Set() });
  });
});
