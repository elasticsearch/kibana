/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { MisconfigurationInsights } from '.';
import { MISCONFIGURATION_INSIGHTS_TOOL_TEST_ID } from './test_ids';

const mockOpenSystemFlyout = jest.fn();

jest.mock('../../../../shared/components/tools_flyout_header', () => ({
  ToolsFlyoutHeader: ({
    title,
    label,
    iconType,
    onTitleClick,
  }: {
    title: string;
    label?: string;
    iconType?: string;
    onTitleClick?: () => void;
  }) => (
    <button
      type="button"
      data-test-subj="mockToolsFlyoutHeader"
      data-title={title}
      data-label={label}
      data-icon-type={iconType}
      onClick={onTitleClick}
    />
  ),
}));

jest.mock(
  '../../../../../cloud_security_posture/components/csp_details/misconfiguration_findings_details_table',
  () => ({
    MisconfigurationFindingsDetailsTable: ({
      field,
      value,
      entityId,
      entityType,
      onShowFinding,
    }: {
      field: string;
      value: string;
      entityId?: string;
      entityType?: string;
      onShowFinding?: (resourceId: string, ruleId: string) => void;
    }) => (
      <button
        type="button"
        data-test-subj="mockMisconfigurationFindingsDetailsTable"
        data-field={field}
        data-value={value}
        data-entity-id={entityId ?? ''}
        data-entity-type={entityType ?? ''}
        onClick={() => onShowFinding?.('resource-1', 'rule-1')}
      >
        {'misconfiguration-table'}
      </button>
    ),
  })
);

jest.mock('../../../../csp/misconfiguration', () => ({
  Misconfiguration: () => <div data-test-subj="mockMisconfigurationPanel" />,
}));

jest.mock('../../../../shared/components/flyout_provider', () => ({
  flyoutProviders: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../../../../shared/hooks/use_default_flyout_properties', () => ({
  useDefaultDocumentFlyoutProperties: () => ({ size: 'm' }),
}));

jest.mock('../../../../../common/hooks/is_in_security_app', () => ({
  useIsInSecurityApp: () => true,
}));

jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useStore: () => ({}),
}));

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useHistory: () => ({ push: jest.fn() }),
}));

jest.mock('../../../../../common/lib/kibana', () => ({
  useKibana: () => ({
    services: {
      overlays: { openSystemFlyout: mockOpenSystemFlyout },
    },
  }),
}));

describe('<MisconfigurationInsights />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the header with the title, host label and entity icon', () => {
    const { getByTestId } = render(
      <MisconfigurationInsights value="my-host" onShowHost={jest.fn()} />
    );
    const header = getByTestId('mockToolsFlyoutHeader');
    expect(header).toHaveAttribute('data-title', 'Misconfigurations');
    expect(header).toHaveAttribute('data-label', 'my-host');
    expect(header).toHaveAttribute('data-icon-type', 'storage');
  });

  it('renders the table inside a scrollable flyout body', () => {
    const { getByTestId } = render(
      <MisconfigurationInsights value="my-host" onShowHost={jest.fn()} />
    );
    const body = getByTestId(MISCONFIGURATION_INSIGHTS_TOOL_TEST_ID);
    expect(body).toBeInTheDocument();
    expect(body).toContainElement(getByTestId('mockMisconfigurationFindingsDetailsTable'));
  });

  it('forwards the host name and entity id to the findings table', () => {
    const { getByTestId } = render(
      <MisconfigurationInsights value="my-host" entityId="euid-123" onShowHost={jest.fn()} />
    );
    const table = getByTestId('mockMisconfigurationFindingsDetailsTable');
    expect(table).toHaveAttribute('data-field', 'host.name');
    expect(table).toHaveAttribute('data-value', 'my-host');
    expect(table).toHaveAttribute('data-entity-id', 'euid-123');
    expect(table).toHaveAttribute('data-entity-type', 'host');
  });

  it('forwards onShowHost to the header click handler', () => {
    const onShowHost = jest.fn();
    const { getByTestId } = render(
      <MisconfigurationInsights value="my-host" onShowHost={onShowHost} />
    );
    getByTestId('mockToolsFlyoutHeader').click();
    expect(onShowHost).toHaveBeenCalledTimes(1);
  });

  it('opens a child system flyout when a finding row is expanded', () => {
    const { getByTestId } = render(
      <MisconfigurationInsights value="my-host" onShowHost={jest.fn()} />
    );
    getByTestId('mockMisconfigurationFindingsDetailsTable').click();
    expect(mockOpenSystemFlyout).toHaveBeenCalledTimes(1);
    expect(mockOpenSystemFlyout).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ session: 'inherit', title: 'my-host' })
    );
  });
});
