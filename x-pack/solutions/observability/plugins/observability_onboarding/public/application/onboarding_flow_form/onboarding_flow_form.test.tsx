/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { IntegrationCardItem } from '@kbn/fleet-plugin/public';
import { OnboardingFlowForm } from './onboarding_flow_form';
import { usePricingFeature } from '../quickstart_flows/shared/use_pricing_feature';
import { MemoryRouter } from 'react-router-dom-v5-compat';
import { I18nProvider } from '@kbn/i18n-react';
import { ObservabilityOnboardingPricingFeature } from '../../../common/pricing_features';
import type { ObservabilityOnboardingAppServices } from '../..';

jest.mock('@kbn/kibana-react-plugin/public');
jest.mock('../quickstart_flows/shared/use_pricing_feature');
jest.mock('@kbn/ebt-tools', () => ({
  usePerformanceContext: () => ({
    onPageReady: jest.fn(),
  }),
}));

const mockUseCustomCards = jest.fn<IntegrationCardItem[], []>(() => []);

jest.mock('./use_custom_cards', () => ({
  useCustomCards: () => mockUseCustomCards(),
  AWS_CLOUDWATCH_OTEL_CARD_ID: 'aws-cloudwatch-otel-virtual',
}));

jest.mock('../package_list/package_list', () => ({
  PackageList: ({ list }: { list: IntegrationCardItem[] }) => (
    <div data-test-subj="package-list">
      {list.map((item, index) => (
        <div key={index} data-test-subj={`package-item-${item.id || index}`}>
          {item.title || item.name}
        </div>
      ))}
    </div>
  ),
}));

jest.mock('@kbn/fleet-plugin/public', () => ({
  LazyPackageCard: ({ id, title }: IntegrationCardItem) => (
    <div data-test-subj={`package-card-${id}`}>{title}</div>
  ),
}));

jest.mock('../api_endpoints/api_endpoints', () => ({
  ApiEndpoints: () => <div data-test-subj="apiEndpointsStub" />,
}));

const mockUseKibana = useKibana as jest.MockedFunction<typeof useKibana>;
const mockUsePricingFeature = usePricingFeature as jest.MockedFunction<typeof usePricingFeature>;
const mockPackageListSearchForm = jest.fn(({ searchQuery }: { searchQuery: string }) => (
  <div data-test-subj="package-search-form">Search Form: {searchQuery}</div>
));

jest.mock('../package_list_search_form/package_list_search_form', () => ({
  PackageListSearchForm: (props: { searchQuery: string }) => mockPackageListSearchForm(props),
}));

const renderWithProviders = (children: React.ReactNode, initialEntries: string[] = ['/']) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <I18nProvider>{children}</I18nProvider>
    </MemoryRouter>
  );
};

describe('OnboardingFlowForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCustomCards.mockReturnValue([]);

    mockUseKibana.mockReturnValue({
      services: {
        context: {
          isCloud: false,
        },
      },
    } as unknown as ReturnType<typeof useKibana<ObservabilityOnboardingAppServices>>);
  });

  describe('Complete Tier (Metrics Onboarding Enabled)', () => {
    beforeEach(() => {
      mockUsePricingFeature.mockReturnValue(true);
    });

    it('should render all 4 use case tiles including Application', () => {
      renderWithProviders(<OnboardingFlowForm />);

      expect(screen.getByText('Host')).toBeInTheDocument();
      expect(screen.getByText('Kubernetes')).toBeInTheDocument();
      expect(screen.getByText('Cloud')).toBeInTheDocument();
      expect(screen.getByText('Application')).toBeInTheDocument();
    });

    it('should show complete tier description for Host', () => {
      renderWithProviders(<OnboardingFlowForm />);

      expect(
        screen.getByText(/Track your host and its services by setting up SLOs/)
      ).toBeInTheDocument();
    });

    it('should show complete tier description for Kubernetes', () => {
      renderWithProviders(<OnboardingFlowForm />);

      expect(
        screen.getByText(/Monitor your Kubernetes cluster and container workloads using logs/)
      ).toBeInTheDocument();
    });

    it('should call usePricingFeature with the correct feature', () => {
      renderWithProviders(<OnboardingFlowForm />);

      expect(mockUsePricingFeature).toHaveBeenCalledWith(
        ObservabilityOnboardingPricingFeature.METRICS_ONBOARDING
      );
    });

    it('should use 2-column grid layout for complete tier', () => {
      renderWithProviders(<OnboardingFlowForm />);

      const grid = screen.getByTestId('observabilityOnboardingUseCaseGrid');
      expect(grid).toBeInTheDocument();
    });

    it('should show only OpenTelemetry as the Kubernetes featured quickstart', () => {
      mockUseCustomCards.mockReturnValue([
        { id: 'otel-kubernetes', title: 'OpenTelemetry Kubernetes' } as IntegrationCardItem,
      ]);

      renderWithProviders(<OnboardingFlowForm />, ['/?category=kubernetes']);

      expect(screen.getByTestId('package-item-otel-kubernetes')).toBeInTheDocument();
    });

    it('leads with the AWS quickstart in the provider grid and shows the AWS collection as a fallback below', () => {
      mockUseCustomCards.mockReturnValue([
        { id: 'azure-logs-virtual', title: 'Azure' } as IntegrationCardItem,
        { id: 'aws-logs-virtual', title: 'AWS collection' } as IntegrationCardItem,
        { id: 'gcp-logs-virtual', title: 'Google Cloud Platform' } as IntegrationCardItem,
        { id: 'aws-cloudwatch-otel-virtual', title: 'AWS' } as IntegrationCardItem,
      ]);

      renderWithProviders(<OnboardingFlowForm />, ['/?category=cloud']);

      const [featuredPackageList] = screen.getAllByTestId('package-list');
      expect(
        within(featuredPackageList).getByTestId('package-item-aws-cloudwatch-otel-virtual')
      ).toBeInTheDocument();
      expect(
        within(featuredPackageList).queryByTestId('package-item-aws-logs-virtual')
      ).not.toBeInTheDocument();
      expect(within(featuredPackageList).getAllByTestId(/^package-item-/)).toHaveLength(3);

      const fallbackRow = screen.getByTestId('observabilityOnboardingCloudExtraRow');
      expect(fallbackRow).toBeInTheDocument();
      expect(within(fallbackRow).getByTestId('package-card-aws-logs-virtual')).toBeInTheDocument();
    });
  });

  describe('Logs-Essentials Tier (Metrics Onboarding Disabled)', () => {
    beforeEach(() => {
      mockUsePricingFeature.mockReturnValue(false);
    });

    it('should render only 3 use case tiles without Application', () => {
      renderWithProviders(<OnboardingFlowForm />);

      expect(screen.getByText('Host')).toBeInTheDocument();
      expect(screen.getByText('Kubernetes')).toBeInTheDocument();
      expect(screen.getByText('Cloud')).toBeInTheDocument();
      expect(screen.queryByText('Application')).not.toBeInTheDocument();
    });

    it('should show logs-essentials description for Host', () => {
      renderWithProviders(<OnboardingFlowForm />);

      expect(
        screen.getByText(/Ingest and analyze logs on your host such as OS, service/)
      ).toBeInTheDocument();
    });

    it('should show logs-essentials description for Kubernetes', () => {
      renderWithProviders(<OnboardingFlowForm />);

      expect(
        screen.getByText(/Observe logs from your Kubernetes environments/)
      ).toBeInTheDocument();
    });

    it('should use 3-column grid layout for logs-essentials tier', () => {
      renderWithProviders(<OnboardingFlowForm />);

      const grid = screen.getByTestId('observabilityOnboardingUseCaseGrid');
      expect(grid).toBeInTheDocument();
    });

    it('leads with the AWS quickstart in the provider grid and shows the AWS collection as a fallback below', () => {
      mockUseCustomCards.mockReturnValue([
        { id: 'azure-logs-virtual', title: 'Azure' } as IntegrationCardItem,
        { id: 'aws-logs-virtual', title: 'AWS collection' } as IntegrationCardItem,
        { id: 'gcp-logs-virtual', title: 'Google Cloud Platform' } as IntegrationCardItem,
        { id: 'aws-cloudwatch-otel-virtual', title: 'AWS' } as IntegrationCardItem,
      ]);

      renderWithProviders(<OnboardingFlowForm />, ['/?category=cloud']);

      const [featuredPackageList] = screen.getAllByTestId('package-list');
      expect(
        within(featuredPackageList).getByTestId('package-item-aws-cloudwatch-otel-virtual')
      ).toBeInTheDocument();
      expect(
        within(featuredPackageList).queryByTestId('package-item-aws-logs-virtual')
      ).not.toBeInTheDocument();
      expect(within(featuredPackageList).getAllByTestId(/^package-item-/)).toHaveLength(3);

      const fallbackRow = screen.getByTestId('observabilityOnboardingCloudExtraRow');
      expect(fallbackRow).toBeInTheDocument();
      expect(within(fallbackRow).getByTestId('package-card-aws-logs-virtual')).toBeInTheDocument();
    });
  });

  describe('Common Elements', () => {
    it('should always show the main question', () => {
      mockUsePricingFeature.mockReturnValue(true);
      renderWithProviders(<OnboardingFlowForm />);

      expect(screen.getByText('What do you want to monitor?')).toBeInTheDocument();
    });

    it('should always show Cloud tile with same description', () => {
      mockUsePricingFeature.mockReturnValue(false);
      renderWithProviders(<OnboardingFlowForm />);

      expect(screen.getByText('Cloud')).toBeInTheDocument();
      expect(
        screen.getByText(/Ingest telemetry data from your cloud services to better understand/)
      ).toBeInTheDocument();
    });

    it('should render search section', () => {
      mockUsePricingFeature.mockReturnValue(true);
      renderWithProviders(<OnboardingFlowForm />);

      expect(screen.getByText(/Search through other ways of ingesting data/)).toBeInTheDocument();
      expect(screen.getByTestId('package-search-form')).toBeInTheDocument();
    });

    it('should pass empty searchQuery to search form when URL search is invalid KQL', () => {
      mockUsePricingFeature.mockReturnValue(true);

      renderWithProviders(<OnboardingFlowForm />, ['/?search=host:(']);

      expect(mockPackageListSearchForm).toHaveBeenCalledWith(
        expect.objectContaining({ searchQuery: '' })
      );
    });

    it('excludes the AWS CloudWatch quickstart from the search results, since it has its own tile', () => {
      mockUsePricingFeature.mockReturnValue(true);
      mockUseCustomCards.mockReturnValue([
        { id: 'azure-logs-virtual', title: 'Azure', isCollectionCard: true } as IntegrationCardItem,
        { id: 'otel-logs', title: 'OpenTelemetry' } as IntegrationCardItem,
        { id: 'aws-cloudwatch-otel-virtual', title: 'Amazon CloudWatch' } as IntegrationCardItem,
      ]);

      renderWithProviders(<OnboardingFlowForm />, ['/?category=cloud']);

      const { customCards } = mockPackageListSearchForm.mock.calls[0][0] as unknown as {
        customCards: IntegrationCardItem[];
      };
      const customCardIds = customCards.map((card) => card.id);
      expect(customCardIds).toContain('otel-logs');
      expect(customCardIds).not.toContain('aws-cloudwatch-otel-virtual');
    });
  });
});
