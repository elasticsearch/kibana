/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import type { DataTableRecord } from '@kbn/discover-utils';
import { buildDataTableRecord } from '@kbn/discover-utils';
import { dataViewMock } from '@kbn/discover-utils/src/__mocks__';
import { fieldFormatsMock } from '@kbn/field-formats-plugin/common/mocks';
import { render, screen } from '@testing-library/react';
import type { FieldFormatsStart } from '@kbn/field-formats-plugin/public';
import { getServiceNameCell } from './service_name_cell';
import {
  EMPTY_CONTEXT_AWARENESS_TOOLKIT,
  type ContextAwarenessToolkit,
} from '../../../context_awareness';

const core = {
  application: {
    capabilities: {
      apm: {
        show: true,
      },
    },
  },
  uiSettings: {
    get: () => true,
  },
};

jest.mock('../../../hooks/use_discover_services', () => {
  const originalModule = jest.requireActual('../../../hooks/use_discover_services');
  return {
    ...originalModule,
    useDiscoverServices: () => ({ core, share: {} }),
  };
});

const renderCell = (
  serviceNameField: string,
  record: DataTableRecord,
  fieldFormats: FieldFormatsStart = fieldFormatsMock
) => {
  const toolkit: ContextAwarenessToolkit = {
    ...EMPTY_CONTEXT_AWARENESS_TOOLKIT,
    actions: {
      ...EMPTY_CONTEXT_AWARENESS_TOOLKIT.actions,
      addFilter: jest.fn(),
    },
  };
  const ServiceNameCell = getServiceNameCell(serviceNameField, toolkit);
  render(
    <ServiceNameCell
      rowIndex={0}
      colIndex={0}
      columnId="service.name"
      isExpandable={false}
      isExpanded={false}
      isDetails={false}
      row={record}
      dataView={dataViewMock}
      fieldFormats={fieldFormats}
      setCellProps={() => {}}
      closePopover={() => {}}
      columnsMeta={undefined}
    />
  );
};

describe('getServiceNameCell', () => {
  it('renders icon if agent name is recognized', () => {
    const record = buildDataTableRecord(
      { fields: { 'service.name': 'test-service', 'agent.name': 'nodejs' } },
      dataViewMock
    );
    renderCell('service.name', record);
    expect(screen.getByTestId('dataTableCellActionsPopover_service.name')).toBeInTheDocument();
  });

  it('renders otel icon if otel sdk language is recognized', () => {
    const record = buildDataTableRecord(
      {
        fields: {
          'service.name': 'test-service',
          'resource.attributes.telemetry.sdk.language': 'nodejs',
        },
      },
      dataViewMock
    );
    renderCell('service.name', record);
    expect(screen.getByTestId('dataTableCellActionsPopover_service.name')).toBeInTheDocument();
  });

  it('does render empty div if service name is missing', () => {
    const record = buildDataTableRecord({ fields: { 'agent.name': 'nodejs' } }, dataViewMock);
    renderCell('service.name', record);
    expect(screen.queryByTestId('serviceNameCell-empty')).toBeInTheDocument();
  });

  describe('when hit.highlight is present', () => {
    const mockFieldFormats = {
      ...fieldFormatsMock,
      getDefaultInstance: jest.fn().mockReturnValue({
        convertToReact: jest.fn().mockImplementation((value, options) => {
          if (options?.hit?.highlight?.bytes) {
            return <mark className="ffSearch__highlight">{value}</mark>;
          }
          return value;
        }),
      }),
    } as unknown as FieldFormatsStart;

    const record = buildDataTableRecord(
      {
        fields: { bytes: '12345' },
        highlight: { bytes: ['<em>12345</em>'] },
      },
      dataViewMock
    );

    it('renders search highlights', () => {
      renderCell('bytes', record, mockFieldFormats);
      expect(screen.getByText('12345').closest('mark')).toHaveClass('ffSearch__highlight');
    });

    it('sets textValue to plain text extracted from the formatted value', () => {
      renderCell('bytes', record, mockFieldFormats);
      // highlights are rendered
      expect(screen.getByText('12345').closest('mark')).toHaveClass('ffSearch__highlight');
      // textValue is plain text extracted from the <mark> React element
      expect(screen.getByTestId('dataTableCellActionsPopover_bytes')).toHaveAttribute(
        'title',
        '12345'
      );
    });
  });
});
