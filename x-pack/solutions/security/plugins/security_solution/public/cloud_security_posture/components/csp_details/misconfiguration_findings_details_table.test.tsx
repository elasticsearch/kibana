/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MisconfigurationFindingsDetailsTable } from './misconfiguration_findings_details_table';
import { TestProviders } from '../../../common/mock/test_providers';
import { EntityIdentifierFields } from '../../../../common/entity_analytics/types';

jest.mock('@kbn/cloud-security-posture-common/utils/ui_metrics', () => ({
  uiMetricService: { trackUiMetric: jest.fn() },
  ENTITY_FLYOUT_EXPAND_MISCONFIGURATION_VIEW_VISITS: 'visit',
  NAV_TO_FINDINGS_BY_HOST_NAME_FROM_ENTITY_FLYOUT: 'host_nav',
  NAV_TO_FINDINGS_BY_RULE_NAME_FROM_ENTITY_FLYOUT: 'rule_nav',
}));

const finding = {
  rule: { id: 'rule-1', name: 'Rule One' },
  resource: { id: 'resource-1' },
  result: { evaluation: 'passed' },
};

jest.mock('@kbn/cloud-security-posture', () => ({
  useMisconfigurationFindings: jest
    .fn()
    .mockReturnValue({ data: { rows: [finding] }, isLoading: false }),
  useHasMisconfigurations: jest.fn().mockReturnValue({ passedFindings: 1, failedFindings: 1 }),
  useGetMisconfigurationStatusColor: jest
    .fn()
    .mockReturnValue({ getMisconfigurationStatusColor: jest.fn().mockReturnValue('#000') }),
  useGetNavigationUrlParams: jest.fn().mockReturnValue(jest.fn().mockReturnValue('')),
  CspEvaluationBadge: ({ type }: { type: string }) => <span>{type}</span>,
  MISCONFIGURATION: { RESULT_EVALUATION: 'result.evaluation', RULE_NAME: 'rule.name' },
}));

jest.mock('@kbn/entity-store/public', () => ({
  ...jest.requireActual('@kbn/entity-store/public'),
  useEntityStoreEuidApi: jest.fn().mockReturnValue({ euid: null }),
}));

jest.mock('../../../common/lib/kibana', () => ({
  useUiSetting: jest.fn().mockReturnValue(false),
  useKibana: jest.fn().mockReturnValue({ services: {} }),
}));

jest.mock('../../../flyout/entity_details/shared/hooks/use_entity_from_store', () => ({
  useEntityFromStore: jest.fn().mockReturnValue({ entityRecord: null, isLoading: false }),
}));

jest.mock('../../../common/components/links', () => ({
  SecuritySolutionLinkAnchor: ({ children }: { children: React.ReactNode }) => (
    <a href="/">{children}</a>
  ),
}));

const renderTable = (onShowFinding: (resourceId: string, ruleId: string) => void) =>
  render(
    <TestProviders>
      <MisconfigurationFindingsDetailsTable
        field={EntityIdentifierFields.hostName}
        value="my-host"
        onShowFinding={onShowFinding}
      />
    </TestProviders>
  );

describe('MisconfigurationFindingsDetailsTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('invokes onShowFinding with the row identifiers when the preview action is clicked', () => {
    const onShowFinding = jest.fn();
    renderTable(onShowFinding);

    fireEvent.click(screen.getByRole('button', { name: 'Preview finding details' }));

    expect(onShowFinding).toHaveBeenCalledWith('resource-1', 'rule-1');
  });
});
