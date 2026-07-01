/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const MockAIValueReport = ({ sampleBanner }: { sampleBanner?: React.ReactNode }) => (
  <div data-test-subj="mock-ai-value-report">{sampleBanner}</div>
);

jest.mock('../../../common/services', () => ({
  useKibana: jest.fn(() => ({
    services: {
      cloud: {},
      securitySolution: {
        getAIValueReport: jest.fn(() => MockAIValueReport),
      },
    },
  })),
}));

jest.mock('../../../navigation/util', () => ({
  getProjectFeaturesUrl: jest.fn(),
}));

jest.mock('../../hooks/use_product_type_by_pli', () => ({
  getProductTypeByPLI: jest.fn(() => 'Security Complete'),
}));

jest.mock('./analytics_speed_acceleration.svg', () => 'mock-svg');

import { getProjectFeaturesUrl } from '../../../navigation/util';
import { getProductTypeByPLI } from '../../hooks/use_product_type_by_pli';
import { AIValueReportUpgradeBanner } from './upgrade_banner';
import * as i18n from './translations';

const mockGetProjectFeaturesUrl = getProjectFeaturesUrl as jest.Mock;
const mockGetProductTypeByPLI = getProductTypeByPLI as jest.Mock;

describe('AIValueReportUpgradeBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProductTypeByPLI.mockReturnValue('Security Complete');
  });

  it('renders the upgrade banner with correct test subject', () => {
    mockGetProjectFeaturesUrl.mockReturnValue(undefined);

    render(<AIValueReportUpgradeBanner />);

    expect(screen.getByTestId('aiValueEssentialsUpgradeBanner')).toBeInTheDocument();
  });

  it('always renders the CTA button', () => {
    mockGetProjectFeaturesUrl.mockReturnValue(undefined);

    render(<AIValueReportUpgradeBanner />);

    expect(screen.getByTestId('aiValueEssentialsUpgradeCtaButton')).toBeInTheDocument();
  });

  it('renders the CTA button with href when getProjectFeaturesUrl returns a URL', () => {
    const upgradeHref =
      'https://cloud.elastic.co/projects/security/proj-123?open=securityProjectFeatures';
    mockGetProjectFeaturesUrl.mockReturnValue(upgradeHref);

    render(<AIValueReportUpgradeBanner />);

    const ctaButton = screen.getByTestId('aiValueEssentialsUpgradeCtaButton');
    expect(ctaButton).toBeInTheDocument();
    expect(ctaButton).toHaveAttribute('href', upgradeHref);
  });

  it('renders the required tier name in the banner title', () => {
    mockGetProjectFeaturesUrl.mockReturnValue(undefined);

    render(<AIValueReportUpgradeBanner />);

    expect(screen.getByText(i18n.UPGRADE_TITLE('Security Complete'))).toBeInTheDocument();
  });
});

describe('AIValueReportUpsellPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetProductTypeByPLI.mockReturnValue('Security Complete');
    mockGetProjectFeaturesUrl.mockReturnValue(
      'https://cloud.elastic.co/projects/security/proj-123?open=securityProjectFeatures'
    );
  });

  it('renders the upsell page with the report content and upgrade banner injected', async () => {
    const { AIValueReportUpsellPage } = await import('.');
    render(<AIValueReportUpsellPage />);

    await waitFor(() => {
      expect(screen.getByTestId('aiValueUpsellPage')).toBeInTheDocument();
      expect(screen.getByTestId('mock-ai-value-report')).toBeInTheDocument();
      expect(screen.getByTestId('aiValueEssentialsUpgradeBanner')).toBeInTheDocument();
    });
  });
});
