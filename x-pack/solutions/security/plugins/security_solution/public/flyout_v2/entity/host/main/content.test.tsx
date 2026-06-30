/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { TestProviders } from '../../../../common/mock';
import { RESOLUTION_SECTION_TEST_ID } from '../../../../entity_analytics/components/entity_resolution/test_ids';
import { useHasEntityResolutionLicense } from '../../../../common/hooks/use_has_entity_resolution_license';
import { Content } from './content';
import { mockHostEntityRiskScores } from '../../../../flyout/entity_details/mocks';

const mockResolutionSection = jest.fn((_props: { openDetailsPanel?: unknown }) => (
  <div data-test-subj="securitySolutionFlyoutResolutionSection" />
));
const mockVisualizationsSection = jest.fn((_props: { openDetailsPanel?: unknown }) => null);

jest.mock('../../../../entity_analytics/components/entity_resolution/resolution_section', () => ({
  ResolutionSection: (props: { openDetailsPanel?: unknown }) => mockResolutionSection(props),
}));
jest.mock('../../../../common/hooks/use_has_entity_resolution_license', () => ({
  useHasEntityResolutionLicense: jest.fn(() => false),
}));
jest.mock('../../../../entity_analytics/components/risk_summary_flyout/risk_summary', () => ({
  FlyoutRiskSummary: () => null,
}));
jest.mock(
  '../../../../flyout/entity_details/shared/components/right/visualizations_section',
  () => ({
    VisualizationsSection: (props: { openDetailsPanel?: unknown }) =>
      mockVisualizationsSection(props),
  })
);
jest.mock(
  '../../../../entity_analytics/components/asset_criticality/asset_criticality_selector',
  () => ({
    AssetCriticalityAccordion: () => null,
  })
);
jest.mock(
  '../../../../entity_analytics/components/entity_details_flyout/components/entity_highlights',
  () => ({
    EntityHighlightsAccordion: () => null,
  })
);
jest.mock('../../../../cloud_security_posture/components/entity_insight', () => ({
  EntityInsight: () => null,
}));
jest.mock('../../shared/components/observed_data_section', () => ({
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

describe('Content — resolution license gating', () => {
  beforeEach(() => {
    (useHasEntityResolutionLicense as jest.Mock).mockReturnValue(false);
  });

  it('does not render ResolutionSection when license is inactive', () => {
    render(<Content {...defaultProps} />, { wrapper: TestProviders });
    expect(screen.queryByTestId(RESOLUTION_SECTION_TEST_ID)).not.toBeInTheDocument();
  });

  it('renders ResolutionSection when license is active and entityStoreEntityId is set', () => {
    (useHasEntityResolutionLicense as jest.Mock).mockReturnValue(true);
    render(<Content {...defaultProps} />, { wrapper: TestProviders });
    expect(screen.getByTestId(RESOLUTION_SECTION_TEST_ID)).toBeInTheDocument();
  });
});

describe('Content — graph/resolution navigation gating', () => {
  const openDetailsPanel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useHasEntityResolutionLicense as jest.Mock).mockReturnValue(true);
  });

  it('forwards openDetailsPanel to the graph and resolution sections by default', () => {
    render(<Content {...defaultProps} openDetailsPanel={openDetailsPanel} />, {
      wrapper: TestProviders,
    });
    expect(mockVisualizationsSection).toHaveBeenLastCalledWith(
      expect.objectContaining({ openDetailsPanel })
    );
    expect(mockResolutionSection).toHaveBeenLastCalledWith(
      expect.objectContaining({ openDetailsPanel })
    );
  });

  it('withholds openDetailsPanel from the graph and resolution sections when navigation is disabled', () => {
    render(
      <Content
        {...defaultProps}
        openDetailsPanel={openDetailsPanel}
        enableGraphAndResolutionNavigation={false}
      />,
      { wrapper: TestProviders }
    );
    expect(mockVisualizationsSection).toHaveBeenLastCalledWith(
      expect.objectContaining({ openDetailsPanel: undefined })
    );
    expect(mockResolutionSection).toHaveBeenLastCalledWith(
      expect.objectContaining({ openDetailsPanel: undefined })
    );
  });
});
