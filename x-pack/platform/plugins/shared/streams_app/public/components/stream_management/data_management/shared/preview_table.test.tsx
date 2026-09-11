/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@kbn/i18n-react';
import { PreviewTable } from './preview_table';

const mockKibana = {
  core: {},
  dependencies: {
    start: {
      share: {},
      fieldFormats: {},
      data: {
        dataViews: {},
      },
    },
  },
};

jest.mock('../../../../hooks/use_kibana', () => ({
  useKibana: () => mockKibana,
}));

// EuiDataGrid relies on ColumnHeaderTruncateContainer which imports from kbn-unified-data-table.
// Provide a lightweight stub so the module resolves without loading the full package.
jest.mock('@kbn/unified-data-table/src/components/column_header_truncate_container', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const SAMPLE_DOCUMENTS = [{ message: 'hello world', level: 'info' }];

const renderTable = (props: Partial<React.ComponentProps<typeof PreviewTable>> = {}) =>
  render(
    <I18nProvider>
      <PreviewTable documents={SAMPLE_DOCUMENTS} {...props} />
    </I18nProvider>
  );

// EuiDataGrid's render cost is largely fixed and can exceed the default 5s budget under parallel CI load.
jest.setTimeout(30_000);

describe('PreviewTable — leading control column a11y', () => {
  it('exposes an accessible name for the row-selection column header by default', async () => {
    renderTable();
    // EuiScreenReaderOnly renders a visually-hidden but DOM-accessible span.
    // Querying by role ensures we're asserting on the ARIA tree, not implementation detail.
    // waitFor lets useAsync settle and avoids act() warnings.
    await waitFor(() => {
      expect(screen.getByRole('columnheader', { name: /row selection/i })).toBeInTheDocument();
    });
  });

  it('does not render the row-selection column when showLeadingControlColumns is false', async () => {
    renderTable({ showLeadingControlColumns: false });
    await waitFor(() => {
      expect(
        screen.queryByRole('columnheader', { name: /row selection/i })
      ).not.toBeInTheDocument();
    });
  });
});
