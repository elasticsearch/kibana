/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { TestProviders } from '../../../common/mock';
import { RESOLUTION_SECTION_TEST_ID } from '../../../entity_analytics/components/entity_resolution/test_ids';
import { useHasEntityResolutionLicense } from '../../../common/hooks/use_has_entity_resolution_license';
import { HostPanelContent } from './content';
import { mockHostEntityRiskScores } from '../mocks';

jest.mock('../../../entity_analytics/components/entity_resolution/resolution_section', () => ({
  ResolutionSection: () => <div data-test-subj="securitySolutionFlyoutResolutionSection" />,
}));
jest.mock('../../../common/hooks/use_has_entity_resolution_license', () => ({
  useHasEntityResolutionLicense: jest.fn(() => false),
}));
jest.mock('../../../entity_analytics/components/risk_summary_flyout/risk_summary', () => ({
  FlyoutRiskSummary: () => null,
}));
jest.mock('../shared/components/right/visualizations_section', () => ({
  VisualizationsSection: () => null,
}));
jest.mock(
  '../../../entity_analytics/components/asset_criticality/asset_criticality_selector',
  () => ({
    AssetCriticalityAccordion: () => null,
  })
);
jest.mock(
  '../../../entity_analytics/components/entity_details_flyout/components/entity_highlights',
  () => ({
    EntityHighlightsAccordion: () => null,
  })
);
jest.mock('../../../cloud_security_posture/components/entity_insight', () => ({
  EntityInsight: () => null,
}));
jest.mock('./components/observed_data_section', () => ({
  ObservedDataSection: () => null,
}));

const defaultProps = {
  identityFields: { 'host.name': 'host-1' },
  observedHost: { details: {}, isLoading: false } as never,
  riskScoreState: { hasEngineBeenInstalled: false, data: [], loading: false } as never,
  entityRiskScores: mockHostEntityRiskScores,
  recalculatingScore: false,
  contextID: 'test',
  scopeId: 'test',
  onAssetCriticalityChange: () => {},
  openDetailsPanel: () => {},
  isPreviewMode: false,
  entityStoreEntityId: 'host:host-1@okta',
};

describe('HostPanelContent — resolution license gating', () => {
  beforeEach(() => {
    (useHasEntityResolutionLicense as jest.Mock).mockReturnValue(false);
  });

  it('does not render ResolutionSection when license is inactive', () => {
    render(<HostPanelContent {...defaultProps} />, { wrapper: TestProviders });
    expect(screen.queryByTestId(RESOLUTION_SECTION_TEST_ID)).not.toBeInTheDocument();
  });

  it('renders ResolutionSection when license is active and entityStoreEntityId is set', () => {
    (useHasEntityResolutionLicense as jest.Mock).mockReturnValue(true);
    render(<HostPanelContent {...defaultProps} />, { wrapper: TestProviders });
    expect(screen.getByTestId(RESOLUTION_SECTION_TEST_ID)).toBeInTheDocument();
  });
});
