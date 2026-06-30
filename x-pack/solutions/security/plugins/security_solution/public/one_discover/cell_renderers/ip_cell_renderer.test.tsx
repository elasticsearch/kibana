/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DataGridCellValueElementProps } from '@kbn/unified-data-table';
import { dataViewMock } from '@kbn/discover-utils/src/__mocks__';
import { fieldFormatsMock } from '@kbn/field-formats-plugin/common/mocks';
import { IpCellRenderer } from './ip_cell_renderer';
import type { StartServices } from '../../types';
import type { SecurityAppStore } from '../../common/store/types';

const mockOpenSystemFlyout = jest.fn();
jest.mock('../../common/lib/kibana', () => ({
  useKibana: () => ({
    services: {
      overlays: { openSystemFlyout: mockOpenSystemFlyout },
    },
  }),
}));

jest.mock('../../common/hooks/is_in_security_app', () => ({
  useIsInSecurityApp: () => false,
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useHistory: () => ({ push: jest.fn(), location: { pathname: '/' } }),
}));

jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useStore: () => ({}),
}));

jest.mock('../../flyout_v2/shared/hooks/use_default_flyout_properties', () => ({
  useDefaultDocumentFlyoutProperties: () => ({
    ownFocus: false,
    paddingSize: 'm',
    resizable: true,
    size: 's',
  }),
}));

jest.mock('../../flyout_v2/shared/utils/build_flyout_content', () => ({
  buildFlyoutContent: jest.fn((field: string, value: string) => {
    if (field === 'source.ip' && value) {
      return <div data-test-subj="mock-network-flyout" />;
    }
    return null;
  }),
}));

jest.mock('../../flyout_v2/shared/components/flyout_provider', () => ({
  flyoutProviders: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../alert_flyout_overview_tab_component/data_view_manager_bootstrap', () => ({
  DataViewManagerBootstrap: () => null,
}));

const mockServices = {
  overlays: { openSystemFlyout: mockOpenSystemFlyout },
} as unknown as StartServices;
const mockStore = {} as SecurityAppStore;

const baseProps: DataGridCellValueElementProps = {
  columnId: 'source.ip',
  isDetails: false,
  isExpanded: false,
  row: {
    id: '1',
    raw: {},
    flattened: {
      'source.ip': '192.168.1.1',
    },
  },
  dataView: dataViewMock,
  setCellProps: jest.fn(),
  isExpandable: false,
  rowIndex: 0,
  colIndex: 0,
  fieldFormats: fieldFormatsMock,
  closePopover: jest.fn(),
  columnsMeta: undefined,
};

describe('IpCellRenderer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render a single IP as a clickable link', () => {
    const { getByTestId } = render(
      <IpCellRenderer {...baseProps} services={mockServices} store={mockStore} />
    );

    const link = getByTestId('one-discover-ip-link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveTextContent('192.168.1.1');
  });

  it('should open system flyout on click', async () => {
    const { getByTestId } = render(
      <IpCellRenderer {...baseProps} services={mockServices} store={mockStore} />
    );

    await userEvent.click(getByTestId('one-discover-ip-link'));
    expect(mockOpenSystemFlyout).toHaveBeenCalledTimes(1);
  });

  it('should render multiple IPs as separate links', () => {
    const props = {
      ...baseProps,
      row: {
        ...baseProps.row,
        flattened: {
          'source.ip': ['10.0.0.1', '10.0.0.2', '10.0.0.3'],
        },
      },
    };

    const { getAllByTestId } = render(
      <IpCellRenderer {...props} services={mockServices} store={mockStore} />
    );

    const links = getAllByTestId('one-discover-ip-link');
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveTextContent('10.0.0.1');
    expect(links[1]).toHaveTextContent('10.0.0.2');
    expect(links[2]).toHaveTextContent('10.0.0.3');
  });

  it('should render empty tag when value is null', () => {
    const props = {
      ...baseProps,
      row: {
        ...baseProps.row,
        flattened: {
          'source.ip': null,
        },
      },
    };

    const { container } = render(
      <IpCellRenderer {...props} services={mockServices} store={mockStore} />
    );

    expect(container.querySelector('[data-test-subj="one-discover-ip-link"]')).toBeNull();
  });

  it('should render empty tag when value is an empty array', () => {
    const props = {
      ...baseProps,
      row: {
        ...baseProps.row,
        flattened: {
          'source.ip': [],
        },
      },
    };

    const { container } = render(
      <IpCellRenderer {...props} services={mockServices} store={mockStore} />
    );

    expect(container.querySelector('[data-test-subj="one-discover-ip-link"]')).toBeNull();
  });
});
