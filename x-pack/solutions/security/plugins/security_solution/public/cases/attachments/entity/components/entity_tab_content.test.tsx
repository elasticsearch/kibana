/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import type { CommonAttachmentTabViewProps } from '@kbn/cases-plugin/public';
import { SECURITY_ENTITY_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';
import { EntityTabContent } from './entity_tab_content';
import {
  ENTITY_TAB_EMPTY_TEST_ID,
  ENTITY_TAB_NO_PRIVILEGES_TEST_ID,
  ENTITY_TAB_TABLE_TEST_ID,
} from '../../../../../common/cases/attachments/entity/test_ids';
import { TestProvidersComponent } from '../../../../threat_intelligence/mocks/test_providers';
import { useEntityStoreStatus } from '../../../../entity_analytics/components/entity_store/hooks/use_entity_store';
import { useEntityStoreDataView } from '../../../../entity_analytics/components/home/use_entity_store_data_view';
import { useEntityEnginePrivileges } from '../../../../entity_analytics/components/entity_store/hooks/use_entity_engine_privileges';
import { useMissingRiskEnginePrivileges } from '../../../../entity_analytics/hooks/use_missing_risk_engine_privileges';

jest.mock('../../../../common/hooks/use_space_id', () => ({
  useSpaceId: () => 'default',
}));

jest.mock('../../../../entity_analytics/components/entity_store/hooks/use_entity_store');
jest.mock('../../../../entity_analytics/components/home/use_entity_store_data_view');
jest.mock(
  '../../../../entity_analytics/components/entity_store/hooks/use_entity_engine_privileges'
);
jest.mock('../../../../entity_analytics/hooks/use_missing_risk_engine_privileges');

jest.mock('../hooks/use_entity_local_table_state', () => ({
  useEntityLocalTableState: () => ({}),
}));

jest.mock('../../../../entity_analytics/components/home/entities_table', () => ({
  DataViewContext: { Provider: ({ children }: { children: React.ReactNode }) => <>{children}</> },
  EntitiesTableSection: () => <div data-test-subj="mockEntitiesTableSection" />,
}));

const useEntityStoreStatusMock = useEntityStoreStatus as jest.Mock;
const useEntityStoreDataViewMock = useEntityStoreDataView as jest.Mock;
const useEntityEnginePrivilegesMock = useEntityEnginePrivileges as jest.Mock;
const useMissingRiskEnginePrivilegesMock = useMissingRiskEnginePrivileges as jest.Mock;

// Full entity store privileges payload with all read access granted. The
// reused privileges callout reads `privileges.privileges.elasticsearch.index`,
// so mocks must mirror the real API shape.
const fullEntityReadPrivileges = {
  has_all_required: true,
  has_read_permissions: true,
  has_write_permissions: true,
  privileges: {
    elasticsearch: {
      index: {
        '.entities.v2.latest.security_default': { read: true },
      },
    },
  },
};

const caseDataWithEntity = {
  id: 'case-1',
  comments: [
    {
      type: SECURITY_ENTITY_ATTACHMENT_TYPE,
      attachmentId: 'entity-id-1',
      metadata: { entityName: 'alice', entityType: 'user' },
    },
  ],
} as unknown as CommonAttachmentTabViewProps['caseData'];

const renderTab = (props?: Partial<CommonAttachmentTabViewProps>) =>
  render(
    <TestProvidersComponent>
      <EntityTabContent caseData={caseDataWithEntity} {...props} />
    </TestProvidersComponent>
  );

describe('EntityTabContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useEntityStoreStatusMock.mockReturnValue({ data: { status: 'running' }, isLoading: false });
    useEntityStoreDataViewMock.mockReturnValue({ dataView: {}, isLoading: false });
    useEntityEnginePrivilegesMock.mockReturnValue({
      data: fullEntityReadPrivileges,
      isLoading: false,
      isError: false,
    });
    useMissingRiskEnginePrivilegesMock.mockReturnValue({
      isLoading: false,
      hasAllRequiredPrivileges: true,
    });
  });

  it('renders the empty prompt when no entity attachments exist', () => {
    render(
      <TestProvidersComponent>
        <EntityTabContent
          caseData={
            { id: 'case-1', comments: [] } as unknown as CommonAttachmentTabViewProps['caseData']
          }
        />
      </TestProvidersComponent>
    );

    expect(screen.getByTestId(ENTITY_TAB_EMPTY_TEST_ID)).toBeInTheDocument();
  });

  it('renders the entities table when the user has read privileges', () => {
    renderTab();

    expect(screen.getByTestId(ENTITY_TAB_TABLE_TEST_ID)).toBeInTheDocument();
    expect(screen.queryByTestId(ENTITY_TAB_NO_PRIVILEGES_TEST_ID)).not.toBeInTheDocument();
    expect(screen.queryByText('Insufficient privileges')).not.toBeInTheDocument();
  });

  it('renders the table with the privileges callout banner when only risk privileges are missing', () => {
    useMissingRiskEnginePrivilegesMock.mockReturnValue({
      isLoading: false,
      hasAllRequiredPrivileges: false,
      missingPrivileges: {
        indexPrivileges: [['risk-score.risk-score-default', ['read']]],
        clusterPrivileges: { enable: [], run: [] },
      },
    });

    renderTab();

    // Entity store is readable, so the table still renders...
    expect(screen.getByTestId(ENTITY_TAB_TABLE_TEST_ID)).toBeInTheDocument();
    // ...with the shared callout shown as a banner above it (matching the home page).
    expect(screen.getByText('Insufficient privileges')).toBeInTheDocument();
    expect(screen.queryByTestId(ENTITY_TAB_NO_PRIVILEGES_TEST_ID)).not.toBeInTheDocument();
  });

  it('renders the no-privileges callout when the user lacks entity store read privileges', () => {
    useEntityEnginePrivilegesMock.mockReturnValue({
      data: {
        has_all_required: false,
        has_read_permissions: false,
        privileges: {
          elasticsearch: {
            index: {
              '.entities.v2.latest.security_default': { read: false },
            },
          },
        },
      },
      isLoading: false,
      isError: false,
    });

    renderTab();

    expect(screen.getByTestId(ENTITY_TAB_NO_PRIVILEGES_TEST_ID)).toBeInTheDocument();
    expect(screen.queryByTestId(ENTITY_TAB_TABLE_TEST_ID)).not.toBeInTheDocument();
    // The shared callout title is rendered, matching the EA home page.
    expect(screen.getByText('Insufficient privileges')).toBeInTheDocument();
  });

  it('excludes entities that do not match the search term', () => {
    renderTab({ searchTerm: 'bob' }); // fixture entity name is 'alice'
    expect(screen.getByTestId(ENTITY_TAB_EMPTY_TEST_ID)).toBeInTheDocument();
    expect(screen.queryByTestId(ENTITY_TAB_TABLE_TEST_ID)).not.toBeInTheDocument();
  });

  it('shows entities that match the search term', () => {
    renderTab({ searchTerm: 'alice' });
    expect(screen.getByTestId(ENTITY_TAB_TABLE_TEST_ID)).toBeInTheDocument();
    expect(screen.queryByTestId(ENTITY_TAB_EMPTY_TEST_ID)).not.toBeInTheDocument();
  });

  it('renders the table (does not hide it) when the privileges request errors', () => {
    useEntityEnginePrivilegesMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    });

    renderTab();

    expect(screen.getByTestId(ENTITY_TAB_TABLE_TEST_ID)).toBeInTheDocument();
    expect(screen.queryByTestId(ENTITY_TAB_NO_PRIVILEGES_TEST_ID)).not.toBeInTheDocument();
  });

  it('shows a loading spinner while privileges are loading', () => {
    useEntityEnginePrivilegesMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    renderTab();

    expect(screen.queryByTestId(ENTITY_TAB_TABLE_TEST_ID)).not.toBeInTheDocument();
    expect(screen.queryByTestId(ENTITY_TAB_NO_PRIVILEGES_TEST_ID)).not.toBeInTheDocument();
  });
});
