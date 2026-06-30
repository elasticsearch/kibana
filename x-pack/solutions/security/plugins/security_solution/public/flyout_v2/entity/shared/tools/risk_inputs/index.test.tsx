/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { EntityType } from '../../../../../../common/entity_analytics/types';
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

describe('<RiskInputs /> host', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with storage icon and host entity type', () => {
    const { getByTestId } = render(
      <RiskInputs entityType={EntityType.host} entityName="my-host" />
    );
    expect(getByTestId('mockToolsFlyoutHeader')).toHaveAttribute('data-title', 'Risk score');
    expect(getByTestId('mockToolsFlyoutHeader')).toHaveAttribute('data-label', 'my-host');
    expect(getByTestId('mockToolsFlyoutHeader')).toHaveAttribute('data-icon-type', 'storage');
  });

  it('renders the host risk inputs body container', () => {
    const { getByTestId } = render(
      <RiskInputs entityType={EntityType.host} entityName="my-host" />
    );
    expect(getByTestId(RISK_INPUTS_TOOL_TEST_ID)).toBeInTheDocument();
  });

  it('passes host entity context to RiskInputsTab', () => {
    const { getByTestId } = render(
      <RiskInputs entityType={EntityType.host} entityName="my-host" entityId="euid-123" />
    );
    const tab = getByTestId('mockRiskInputsTab');
    expect(tab).toHaveAttribute('data-entity-type', 'host');
    expect(tab).toHaveAttribute('data-entity-name', 'my-host');
    expect(tab).toHaveAttribute('data-entity-id', 'euid-123');
  });

  it('forwards onOpenEntity to the header click handler for host', () => {
    const onOpenEntity = jest.fn();
    const { getByTestId } = render(
      <RiskInputs entityType={EntityType.host} entityName="my-host" onOpenEntity={onOpenEntity} />
    );
    getByTestId('mockToolsFlyoutHeader').click();
    expect(onOpenEntity).toHaveBeenCalledTimes(1);
  });

  it('opens a child system flyout when a risk-input alert is expanded', () => {
    const { getByTestId } = render(
      <RiskInputs entityType={EntityType.host} entityName="my-host" />
    );
    getByTestId('mockRiskInputsTab').click();
    expect(mockOpenSystemFlyout).toHaveBeenCalledTimes(1);
    expect(mockOpenSystemFlyout).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ session: 'inherit' })
    );
  });
});

describe('<RiskInputs /> user', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders with user icon and user entity type', () => {
    const { getByTestId } = render(
      <RiskInputs entityType={EntityType.user} entityName="my-user" />
    );
    expect(getByTestId('mockToolsFlyoutHeader')).toHaveAttribute('data-icon-type', 'user');
  });

  it('renders the user risk inputs body container', () => {
    const { getByTestId } = render(
      <RiskInputs entityType={EntityType.user} entityName="my-user" />
    );
    expect(getByTestId(RISK_INPUTS_TOOL_TEST_ID)).toBeInTheDocument();
  });

  it('passes user entity context to RiskInputsTab', () => {
    const { getByTestId } = render(
      <RiskInputs entityType={EntityType.user} entityName="my-user" entityId="euid-456" />
    );
    const tab = getByTestId('mockRiskInputsTab');
    expect(tab).toHaveAttribute('data-entity-type', 'user');
    expect(tab).toHaveAttribute('data-entity-name', 'my-user');
    expect(tab).toHaveAttribute('data-entity-id', 'euid-456');
  });

  it('forwards onOpenEntity to the header click handler for user', () => {
    const onOpenEntity = jest.fn();
    const { getByTestId } = render(
      <RiskInputs entityType={EntityType.user} entityName="my-user" onOpenEntity={onOpenEntity} />
    );
    getByTestId('mockToolsFlyoutHeader').click();
    expect(onOpenEntity).toHaveBeenCalledTimes(1);
  });
});
