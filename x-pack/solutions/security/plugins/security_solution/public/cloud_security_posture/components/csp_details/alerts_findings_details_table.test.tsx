/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import { AlertsDetailsTable } from './alerts_findings_details_table';
import { TestProviders } from '../../../common/mock/test_providers';
import { EntityIdentifierFields } from '../../../../common/entity_analytics/types';

jest.mock('@kbn/cloud-security-posture-common/utils/ui_metrics', () => ({
  uiMetricService: { trackUiMetric: jest.fn() },
  ENTITY_FLYOUT_EXPAND_MISCONFIGURATION_VIEW_VISITS: 'visit',
}));

jest.mock('@kbn/entity-store/public', () => ({
  ...jest.requireActual('@kbn/entity-store/public'),
  useEntityStoreEuidApi: jest.fn().mockReturnValue({ euid: null }),
}));

jest.mock('../../../common/lib/kibana', () => ({
  useUiSetting: jest.fn().mockReturnValue(false),
  useKibana: jest.fn().mockReturnValue({ services: {} }),
}));

jest.mock('../../../common/containers/use_global_time', () => ({
  useGlobalTime: jest.fn().mockReturnValue({ to: '2023-01-01', from: '2022-01-01' }),
}));

jest.mock('../../../detections/containers/detection_engine/alerts/use_query', () => ({
  useQueryAlerts: jest.fn().mockReturnValue({
    loading: false,
    data: {
      hits: {
        hits: [
          {
            fields: {
              _id: ['alert-1'],
              _index: ['index-1'],
              'kibana.alert.rule.name': ['Rule'],
              'kibana.alert.severity': ['high'],
              'kibana.alert.workflow_status': ['open'],
            },
          },
        ],
      },
    },
    setQuery: jest.fn(),
    response: '',
    request: '',
    refetch: jest.fn(),
  }),
}));

jest.mock('../../../detections/containers/detection_engine/alerts/use_signal_index', () => ({
  useSignalIndex: jest
    .fn()
    .mockReturnValue({ loading: false, signalIndexName: '.alerts-security' }),
}));

jest.mock('../../../flyout/entity_details/shared/hooks/use_entity_from_store', () => ({
  useEntityFromStore: jest.fn().mockReturnValue({ entityRecord: null, isLoading: false }),
}));

jest.mock('../../hooks/use_non_closed_alerts', () => ({
  useNonClosedAlerts: jest
    .fn()
    .mockReturnValue({ hasNonClosedAlerts: false, filteredAlertsData: null }),
}));

jest.mock('../../../common/hooks/use_navigate_to_alerts_page_with_filters', () => ({
  useNavigateToAlertsPageWithFilters: jest.fn().mockReturnValue(jest.fn()),
}));

const renderTable = (onShowAlert: (eventId: string, indexName: string) => void) =>
  render(
    <TestProviders>
      <AlertsDetailsTable
        field={EntityIdentifierFields.hostName}
        value="my-host"
        onShowAlert={onShowAlert}
      />
    </TestProviders>
  );

const clickRowAction = () => {
  // The row action is an icon-only button rendered with the `expand` EuiIcon.
  const expandIcon = document.querySelector('[data-euiicon-type="expand"]');
  fireEvent.click(expandIcon?.closest('button') as HTMLElement);
};

describe('AlertsDetailsTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('invokes onShowAlert with the row identifiers when a row action is clicked', () => {
    const onShowAlert = jest.fn();
    renderTable(onShowAlert);

    clickRowAction();

    expect(onShowAlert).toHaveBeenCalledWith('alert-1', 'index-1');
  });
});
