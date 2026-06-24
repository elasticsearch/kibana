/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { formatDate } from '@elastic/eui';
import { EntityStoreEuidApiProvider } from '@kbn/entity-store/public';
import { ALERT_REASON, ALERT_RULE_NAME } from '@kbn/rule-data-utils';
import { useExpandableFlyoutApi } from '@kbn/expandable-flyout';
import { TestProviders } from '../../../../../common/mock';
import { useUserPrivileges } from '../../../../../common/components/user_privileges';
import { mockFlyoutApi } from '../../../../../flyout/document_details/shared/mocks/mock_flyout_context';
import { getColumns, TIMESTAMP_DATE_FORMAT } from './get_columns';

jest.mock('@kbn/expandable-flyout');
jest.mock('../../../../../common/components/user_privileges');
jest.mock('../../../../../common/hooks/is_in_security_app', () => ({
  useIsInSecurityApp: () => false,
}));
jest.mock('../../../../../common/lib/kibana', () => ({
  useKibana: () => ({
    services: {
      telemetry: { reportEvent: jest.fn() },
    },
  }),
  useUiSetting: jest.fn(() => false),
}));

const scopeId = 'test-scope';
const dataTestSubj = 'TEST';
const mockOnShowAlert = jest.fn();
const useUserPrivilegesMock = useUserPrivileges as jest.Mock;

const renderColumn = (element: React.ReactElement) =>
  render(
    <TestProviders>
      <EntityStoreEuidApiProvider>{element}</EntityStoreEuidApiProvider>
    </TestProviders>
  );

describe('getColumns', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useExpandableFlyoutApi).mockReturnValue(mockFlyoutApi);
    useUserPrivilegesMock.mockReturnValue({
      timelinePrivileges: {
        read: true,
      },
      rulesPrivileges: {
        rules: {
          read: true,
        },
      },
    });
  });

  it('returns 5 columns', () => {
    const columns = getColumns({
      scopeId,
      dataTestSubj,
      onShowAlert: mockOnShowAlert,
    });
    expect(columns).toHaveLength(5);
  });

  describe('preview button column', () => {
    const row = { id: 'alert-id-1', index: 'test-index' };

    it('renders the preview button with correct test id', () => {
      const [previewColumn] = getColumns({
        scopeId,
        dataTestSubj,
        onShowAlert: mockOnShowAlert,
      });
      const { render: renderCell } = previewColumn as {
        render: (row: Record<string, unknown>) => React.ReactElement;
      };

      renderColumn(renderCell(row));

      expect(screen.getByTestId(`${dataTestSubj}AlertPreviewButton`)).toBeInTheDocument();
    });

    it('calls onShowAlert with row id and index when clicked', async () => {
      const [previewColumn] = getColumns({
        scopeId,
        dataTestSubj,
        onShowAlert: mockOnShowAlert,
      });
      const { render: renderCell } = previewColumn as {
        render: (row: Record<string, unknown>) => React.ReactElement;
      };

      renderColumn(renderCell(row));

      await userEvent.click(screen.getByTestId(`${dataTestSubj}AlertPreviewButton`));

      expect(mockOnShowAlert).toHaveBeenCalledWith('alert-id-1', 'test-index');
    });
  });

  describe('timestamp column', () => {
    it('renders formatted date', () => {
      const [, timestampColumn] = getColumns({
        scopeId,
        dataTestSubj,
        onShowAlert: mockOnShowAlert,
      });
      const { render: renderCell } = timestampColumn as unknown as {
        render: (value: string) => React.ReactElement;
      };

      const isoDate = '2022-01-15T10:30:00.000Z';
      renderColumn(renderCell(isoDate));

      const expected = formatDate(isoDate, TIMESTAMP_DATE_FORMAT);
      expect(screen.getByText(expected)).toBeInTheDocument();
    });

    it('has field @timestamp', () => {
      const [, timestampColumn] = getColumns({
        scopeId,
        dataTestSubj,
        onShowAlert: mockOnShowAlert,
      });
      expect((timestampColumn as { field: string }).field).toBe('@timestamp');
    });
  });

  describe('rule column', () => {
    const row = {
      [ALERT_RULE_NAME]: 'My Detection Rule',
      'kibana.alert.rule.uuid': 'rule-uuid-123',
    };

    it('renders rule name as a PreviewLink when useLegacyExpandableFlyout is true', () => {
      const [, , ruleColumn] = getColumns({
        scopeId,
        dataTestSubj,
        onShowAlert: mockOnShowAlert,
        useLegacyExpandableFlyout: true,
      });
      const { render: renderCell } = ruleColumn as {
        render: (row: Record<string, unknown>) => React.ReactElement;
      };

      renderColumn(renderCell(row));

      expect(screen.getByText('My Detection Rule')).toBeInTheDocument();
      expect(screen.getByTestId(`${dataTestSubj}RulePreview`)).toBeInTheDocument();
    });

    it('renders rule name as an OpenFlyoutLink when useLegacyExpandableFlyout is false', () => {
      const [, , ruleColumn] = getColumns({
        scopeId,
        dataTestSubj,
        onShowAlert: mockOnShowAlert,
        useLegacyExpandableFlyout: false,
      });
      const { render: renderCell } = ruleColumn as {
        render: (row: Record<string, unknown>) => React.ReactElement;
      };

      renderColumn(renderCell(row));

      expect(screen.getByText('My Detection Rule')).toBeInTheDocument();
      expect(screen.getByTestId(`${dataTestSubj}RuleLink`)).toBeInTheDocument();
    });

    it('renders rule name as plain text when user cannot read rules', () => {
      useUserPrivilegesMock.mockReturnValue({
        timelinePrivileges: {
          read: true,
        },
        rulesPrivileges: {
          rules: {
            read: false,
          },
        },
      });

      const [, , ruleColumn] = getColumns({
        scopeId,
        dataTestSubj,
        onShowAlert: mockOnShowAlert,
      });
      const { render: renderCell } = ruleColumn as {
        render: (row: Record<string, unknown>) => React.ReactElement;
      };

      renderColumn(renderCell(row));

      expect(screen.getByText('My Detection Rule')).toBeInTheDocument();
      expect(screen.queryByTestId(`${dataTestSubj}RulePreview`)).not.toBeInTheDocument();
    });
  });

  describe('reason column', () => {
    it('renders reason value', () => {
      const [, , , reasonColumn] = getColumns({
        scopeId,
        dataTestSubj,
        onShowAlert: mockOnShowAlert,
      });
      const { render: renderCell } = reasonColumn as unknown as {
        render: (value: string) => React.ReactElement;
      };

      renderColumn(renderCell('Alert triggered by suspicious activity'));

      expect(screen.getByText('Alert triggered by suspicious activity')).toBeInTheDocument();
    });

    it('has field kibana.alert.reason', () => {
      const [, , , reasonColumn] = getColumns({
        scopeId,
        dataTestSubj,
        onShowAlert: mockOnShowAlert,
      });
      expect((reasonColumn as { field: string }).field).toBe(ALERT_REASON);
    });
  });

  describe('severity column', () => {
    it('renders SeverityBadge for a valid severity value', () => {
      const [, , , , severityColumn] = getColumns({
        scopeId,
        dataTestSubj,
        onShowAlert: mockOnShowAlert,
      });
      const { render: renderCell } = severityColumn as unknown as {
        render: (value: string) => React.ReactElement;
      };

      renderColumn(renderCell('high'));

      // SeverityBadge renders the severity label
      expect(screen.getByText('High')).toBeInTheDocument();
    });

    it('renders plain text for an invalid severity value', () => {
      const [, , , , severityColumn] = getColumns({
        scopeId,
        dataTestSubj,
        onShowAlert: mockOnShowAlert,
      });
      const { render: renderCell } = severityColumn as unknown as {
        render: (value: string) => React.ReactElement;
      };

      renderColumn(renderCell('unknown-severity'));

      expect(screen.getByText('unknown-severity')).toBeInTheDocument();
    });

    it('has field kibana.alert.severity', () => {
      const [, , , , severityColumn] = getColumns({
        scopeId,
        dataTestSubj,
        onShowAlert: mockOnShowAlert,
      });
      expect((severityColumn as { field: string }).field).toBe('kibana.alert.severity');
    });
  });

  describe('without dataTestSubj', () => {
    it('renders preview button without crashing when dataTestSubj is undefined', () => {
      const row = { id: 'id', index: 'idx' };
      const [previewColumn] = getColumns({
        scopeId,
        onShowAlert: mockOnShowAlert,
      });
      const { render: renderCell } = previewColumn as {
        render: (row: Record<string, unknown>) => React.ReactElement;
      };

      renderColumn(renderCell(row));

      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });
});
