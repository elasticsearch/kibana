/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { TestProviders } from '../../../../common/mock';
import { useAllEntityStoreHosts, useAllHost } from '../../containers/hosts';
import { useQueryToggle } from '../../../../common/containers/query_toggle';
import { HostsQueryTabBody } from './hosts_query_tab_body';
import { HostsType } from '../../store/model';
import { useExploreEntityStoreV2Enabled } from '../../../hooks/use_explore_entity_store_v2_enabled';

jest.mock('../../containers/hosts');
jest.mock('../../../../common/containers/query_toggle');
jest.mock('../../../hooks/use_explore_entity_store_v2_enabled', () => ({
  useExploreEntityStoreV2Enabled: jest.fn(() => false),
}));

describe('Hosts query tab body', () => {
  const mockUseAllHost = useAllHost as jest.Mock;
  const mockUseAllEntityStoreHosts = useAllEntityStoreHosts as jest.Mock;
  const mockUseQueryToggle = useQueryToggle as jest.Mock;
  const mockUseExploreEntityStoreV2Enabled = useExploreEntityStoreV2Enabled as jest.Mock;
  const defaultProps = {
    indexNames: [],
    setQuery: jest.fn(),
    skip: false,
    startDate: '2019-06-25T04:31:59.345Z',
    endDate: '2019-06-25T06:31:59.345Z',
    type: HostsType.page,
  };
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQueryToggle.mockReturnValue({ toggleStatus: true, setToggleStatus: jest.fn() });
    const emptyHostsArgs = {
      hosts: [],
      id: '123',
      inspect: {
        dsl: [],
        response: [],
      },
      isInspected: false,
      totalCount: 0,
      pageInfo: { activePage: 1, fakeTotalCount: 100, showMorePagesIndicator: false },
      loadPage: jest.fn(),
      refetch: jest.fn(),
    };
    mockUseAllHost.mockReturnValue([false, emptyHostsArgs]);
    mockUseAllEntityStoreHosts.mockReturnValue([false, emptyHostsArgs]);
    mockUseExploreEntityStoreV2Enabled.mockReturnValue(false);
  });
  it('toggleStatus=true, do not skip', () => {
    render(
      <TestProviders>
        <HostsQueryTabBody {...defaultProps} />
      </TestProviders>
    );
    expect(mockUseAllHost.mock.calls[0][0].skip).toEqual(false);
  });
  it('toggleStatus=false, skip', () => {
    mockUseQueryToggle.mockReturnValue({ toggleStatus: false, setToggleStatus: jest.fn() });
    render(
      <TestProviders>
        <HostsQueryTabBody {...defaultProps} />
      </TestProviders>
    );
    expect(mockUseAllHost.mock.calls[0][0].skip).toEqual(true);
  });

  it('skips legacy hosts query when entity store v2 is available', () => {
    mockUseExploreEntityStoreV2Enabled.mockReturnValue(true);
    render(
      <TestProviders>
        <HostsQueryTabBody {...defaultProps} />
      </TestProviders>
    );
    expect(mockUseAllHost.mock.calls[0][0].skip).toEqual(true);
    expect(mockUseAllEntityStoreHosts.mock.calls[0][0].skip).toEqual(false);
  });
});
