/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
// Necessary until components being tested are migrated of styled-components https://github.com/elastic/kibana/issues/219037
import 'jest-styled-components';

import * as i18n from './translations';
import { AuthenticationsHostTable } from './authentications_host_table';
import { hostsModel } from '../../hosts/store';
import { TestProviders } from '../../../common/mock';
import { useAuthentications } from '../../containers/authentications';
import { useQueryToggle } from '../../../common/containers/query_toggle';

jest.mock('../../../common/containers/query_toggle', () => ({
  useQueryToggle: jest.fn().mockReturnValue({ toggleStatus: true, setToggleStatus: jest.fn() }),
}));
jest.mock('../../containers/authentications', () => ({
  useAuthentications: jest.fn().mockReturnValue([
    false,
    {
      authentications: [],
      totalCount: 0,
      pageInfo: {},
      loadPage: jest.fn(),
      inspect: {},
      isInspected: false,
      refetch: jest.fn(),
    },
  ]),
}));

describe('Authentication Host Table Component', () => {
  const mockUseAuthentications = useAuthentications as jest.Mock;
  const mockUseQueryToggle = useQueryToggle as jest.Mock;

  const startDate = '2020-07-07T08:20:18.966Z';
  const endDate = '3000-01-01T00:00:00.000Z';
  const defaultProps = {
    type: hostsModel.HostsType.page,
    startDate,
    endDate,
    skip: false,
    setQuery: jest.fn(),
    indexNames: [],
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    test('it renders the host authentication table', () => {
      const { getByTestId } = render(
        <TestProviders>
          <AuthenticationsHostTable {...defaultProps} />
        </TestProviders>
      );

      expect(getByTestId('authentications-host-table-loading-false')).toMatchSnapshot();
    });
  });

  describe('columns', () => {
    test('on hosts page, we expect to get all 9 columns', () => {
      const { queryAllByTestId, queryByText } = render(
        <TestProviders>
          <AuthenticationsHostTable {...defaultProps} />
        </TestProviders>
      );

      expect(queryAllByTestId(/tableHeaderCell_/).length).toEqual(9);

      // it should have Last Successful Destination column
      expect(queryByText(i18n.LAST_SUCCESSFUL_DESTINATION)).toBeInTheDocument();
      // it should have Last Failed Destination column
      expect(queryByText(i18n.LAST_FAILED_DESTINATION)).toBeInTheDocument();
    });

    test('on hosts page, we expect to get 7 user details columns', () => {
      const { queryAllByTestId, queryByText } = render(
        <TestProviders>
          <AuthenticationsHostTable {...defaultProps} type={hostsModel.HostsType.details} />
        </TestProviders>
      );

      expect(queryAllByTestId(/tableHeaderCell_/).length).toEqual(7);

      // it should not have Successful Destination column
      expect(queryByText(i18n.LAST_SUCCESSFUL_DESTINATION)).not.toBeInTheDocument();
      // it should not have Failed Destination column
      expect(queryByText(i18n.LAST_FAILED_DESTINATION)).not.toBeInTheDocument();
    });
  });

  it('toggleStatus=true, do not skip', () => {
    render(
      <TestProviders>
        <AuthenticationsHostTable {...defaultProps} />
      </TestProviders>
    );
    expect(mockUseAuthentications.mock.calls[0][0].skip).toEqual(false);
  });

  it('toggleStatus=false, skip', () => {
    mockUseQueryToggle.mockReturnValue({ toggleStatus: false, setToggleStatus: jest.fn() });
    render(
      <TestProviders>
        <AuthenticationsHostTable {...defaultProps} />
      </TestProviders>
    );
    expect(mockUseAuthentications.mock.calls[0][0].skip).toEqual(true);
  });
});
