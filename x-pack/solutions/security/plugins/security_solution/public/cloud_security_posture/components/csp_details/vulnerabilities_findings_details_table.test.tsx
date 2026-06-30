/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { VulnerabilitiesFindingsDetailsTable } from './vulnerabilities_findings_details_table';
import { TestProviders } from '../../../common/mock/test_providers';
import { EntityIdentifierFields } from '../../../../common/entity_analytics/types';

jest.mock('@kbn/cloud-security-posture-common/utils/ui_metrics', () => ({
  uiMetricService: { trackUiMetric: jest.fn() },
  ENTITY_FLYOUT_EXPAND_VULNERABILITY_VIEW_VISITS: 'visit',
  NAV_TO_FINDINGS_BY_HOST_NAME_FROM_ENTITY_FLYOUT: 'host_nav',
}));

const finding = {
  vulnerability: { id: 'CVE-1' },
  resource: { id: 'resource-1' },
  event: { id: 'event-1' },
};

jest.mock('@kbn/cloud-security-posture/src/hooks/use_vulnerabilities_findings', () => ({
  useVulnerabilitiesFindings: jest
    .fn()
    .mockReturnValue({ data: { rows: [finding] }, isLoading: false }),
  VULNERABILITY_FINDING: {
    ID: 'vulnerability.id',
    SEVERITY: 'vulnerability.severity',
    PACKAGE_NAME: 'package.name',
    PACKAGE_VERSION: 'package.version',
    TITLE: 'vulnerability.title',
  },
}));

jest.mock('@kbn/cloud-security-posture', () => ({
  getVulnerabilityStats: jest.fn().mockReturnValue([]),
  getNormalizedSeverity: jest.fn((severity: string) => severity),
  findReferenceLink: jest.fn().mockReturnValue(''),
  CVSScoreBadge: () => null,
  SeverityStatusBadge: () => null,
  ActionableBadge: () => null,
  MultiValueCellPopover: () => null,
}));

jest.mock('@kbn/cloud-security-posture/src/hooks/use_get_navigation_url_params', () => ({
  useGetNavigationUrlParams: jest.fn().mockReturnValue(jest.fn().mockReturnValue('')),
}));

jest.mock('@kbn/cloud-security-posture/src/hooks/use_get_severity_status_color', () => ({
  useGetSeverityStatusColor: jest
    .fn()
    .mockReturnValue({ getSeverityStatusColor: jest.fn().mockReturnValue('#000') }),
}));

jest.mock('@kbn/cloud-security-posture/src/hooks/use_has_vulnerabilities', () => ({
  useHasVulnerabilities: jest
    .fn()
    .mockReturnValue({ counts: { critical: 0, high: 0, medium: 0, low: 0, none: 0 } }),
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

const renderTable = (
  onShowVulnerability: (params: {
    vulnerabilityId: string;
    resourceId: string;
    packageName: string;
    packageVersion: string;
    eventId: string;
  }) => void
) =>
  render(
    <TestProviders>
      <VulnerabilitiesFindingsDetailsTable
        identityField={EntityIdentifierFields.hostName}
        value="my-host"
        onShowVulnerability={onShowVulnerability}
      />
    </TestProviders>
  );

describe('VulnerabilitiesFindingsDetailsTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('invokes onShowVulnerability with the row identifiers when the preview action is clicked', () => {
    const onShowVulnerability = jest.fn();
    renderTable(onShowVulnerability);

    fireEvent.click(screen.getByRole('button', { name: 'Preview vulnerability details' }));

    expect(onShowVulnerability).toHaveBeenCalledWith(
      expect.objectContaining({
        vulnerabilityId: 'CVE-1',
        resourceId: 'resource-1',
        eventId: 'event-1',
      })
    );
  });
});
