/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { RiskInputs } from '.';
import { RISK_INPUTS_TOOL_TEST_ID } from './test_ids';

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
  '../../../../../entity_analytics/components/entity_details_flyout/tabs/risk_inputs/risk_inputs_tab',
  () => ({
    RiskInputsTab: ({
      entityType,
      entityName,
      entityId,
      onShowAlert,
    }: {
      entityType: string;
      entityName: string;
      entityId?: string;
      onShowAlert?: (id: string, indexName: string) => void;
    }) => (
      <button
        type="button"
        data-test-subj="mockRiskInputsTab"
        data-entity-type={entityType}
        data-entity-name={entityName}
        data-entity-id={entityId ?? ''}
        onClick={() => onShowAlert?.('alert-1', '.alerts-security')}
      />
    ),
  })
);

jest.mock('../../../../shared/components/flyout_provider', () => ({
  flyoutProviders: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../../../../document/main/document_flyout_wrapper', () => ({
  DocumentFlyoutWrapper: () => <div data-test-subj="mockDocumentFlyoutWrapper" />,
}));

jest.mock('../../../../shared/components/cell_actions', () => ({
  cellActionRenderer: jest.fn(),
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

describe('<RiskInputs />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the header with the "Risk score" title and host label', () => {
    const { getByTestId } = render(<RiskInputs entityName="my-host" onShowHost={jest.fn()} />);
    const header = getByTestId('mockToolsFlyoutHeader');
    expect(header).toHaveAttribute('data-title', 'Risk score');
    expect(header).toHaveAttribute('data-label', 'my-host');
    expect(header).toHaveAttribute('data-icon-type', 'storage');
  });

  it('renders the risk inputs body container', () => {
    const { getByTestId } = render(<RiskInputs entityName="my-host" onShowHost={jest.fn()} />);
    expect(getByTestId(RISK_INPUTS_TOOL_TEST_ID)).toBeInTheDocument();
  });

  it('passes entity context to the underlying RiskInputsTab', () => {
    const { getByTestId } = render(
      <RiskInputs entityName="my-host" entityId="euid-123" onShowHost={jest.fn()} />
    );
    const tab = getByTestId('mockRiskInputsTab');
    expect(tab).toHaveAttribute('data-entity-type', 'host');
    expect(tab).toHaveAttribute('data-entity-name', 'my-host');
    expect(tab).toHaveAttribute('data-entity-id', 'euid-123');
  });

  it('forwards onShowHost to the header click handler', () => {
    const onShowHost = jest.fn();
    const { getByTestId } = render(<RiskInputs entityName="my-host" onShowHost={onShowHost} />);
    getByTestId('mockToolsFlyoutHeader').click();
    expect(onShowHost).toHaveBeenCalledTimes(1);
  });

  it('opens a child system flyout when a risk-input alert is expanded', () => {
    const { getByTestId } = render(<RiskInputs entityName="my-host" onShowHost={jest.fn()} />);
    getByTestId('mockRiskInputsTab').click();
    expect(mockOpenSystemFlyout).toHaveBeenCalledTimes(1);
    expect(mockOpenSystemFlyout).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ session: 'inherit' })
    );
  });
});
