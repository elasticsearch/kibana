/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CompatRouter } from 'react-router-dom-v5-compat';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { IntegrationCardItem } from '@kbn/fleet-plugin/public';
import type { ObservabilityOnboardingAppServices } from '../..';
import { usePricingFeature } from '../quickstart_flows/shared/use_pricing_feature';
import { useManagedOtlpServiceAvailability } from '../shared/use_managed_otlp_service_availability';
import { useCustomCards } from './use_custom_cards';

jest.mock('@kbn/kibana-react-plugin/public', () => ({
  ...jest.requireActual('@kbn/kibana-react-plugin/public'),
  useKibana: jest.fn(),
}));

jest.mock('../quickstart_flows/shared/use_pricing_feature');
jest.mock('../shared/use_managed_otlp_service_availability');

const mockUseKibana = useKibana as jest.MockedFunction<typeof useKibana>;
const mockUsePricingFeature = usePricingFeature as jest.MockedFunction<typeof usePricingFeature>;
const mockUseManagedOtlpServiceAvailability =
  useManagedOtlpServiceAvailability as jest.MockedFunction<
    typeof useManagedOtlpServiceAvailability
  >;

const CardsProbe: React.FC = () => {
  const cards = useCustomCards(jest.fn());

  return (
    <dl>
      {cards.map((card: IntegrationCardItem) => (
        <React.Fragment key={card.id}>
          <dt>{card.id}</dt>
          <dd data-test-subj={`card-name-${card.id}`}>{card.name}</dd>
          <dd data-test-subj={`card-title-${card.id}`}>{card.title}</dd>
          <dd data-test-subj={`card-description-${card.id}`}>{card.description}</dd>
          <dd data-test-subj={`card-icon-${card.id}`}>{card.icons?.[0]?.src}</dd>
          <dd data-test-subj={`card-url-${card.id}`}>{card.url}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
};

describe('useCustomCards', () => {
  beforeEach(() => {
    mockUsePricingFeature.mockReturnValue(true);
    mockUseManagedOtlpServiceAvailability.mockReturnValue(true);
    mockUseKibana.mockReturnValue({
      services: {
        application: {
          getUrlForApp: jest.fn(() => '/app/mock'),
        },
        http: {
          staticAssets: {
            getPluginAssetHref: jest.fn(
              (asset: string) => `/plugins/observabilityOnboarding/${asset}`
            ),
          },
        },
        featureFlags: {
          getBooleanValue: jest.fn(() => false),
        },
        context: {
          isCloud: false,
          isDev: false,
          isServerless: false,
        },
        share: {
          url: {
            locators: {
              get: jest.fn(() => ({ getRedirectUrl: jest.fn(() => '/app/redirect') })),
            },
          },
        },
      },
    } as unknown as ReturnType<typeof useKibana<ObservabilityOnboardingAppServices>>);
  });

  it('uses the merged Kubernetes OTel quickstart for the Kubernetes add data entry', () => {
    render(
      <MemoryRouter>
        <CompatRouter>
          <CardsProbe />
        </CompatRouter>
      </MemoryRouter>
    );

    expect(screen.getByTestId('card-url-otel-kubernetes')).toHaveTextContent(/^\/kubernetes$/);
  });

  it('exposes the AWS CloudWatch OTel quickstart card with expected metadata', () => {
    render(
      <MemoryRouter>
        <CompatRouter>
          <CardsProbe />
        </CompatRouter>
      </MemoryRouter>
    );

    expect(screen.getByText('aws-cloudwatch-otel-virtual')).toBeInTheDocument();
    expect(screen.getByTestId('card-name-aws-cloudwatch-otel-virtual')).toHaveTextContent(
      'aws-cloudwatch-otel'
    );
    expect(screen.getByTestId('card-title-aws-cloudwatch-otel-virtual')).toHaveTextContent('AWS');
    expect(screen.getByTestId('card-description-aws-cloudwatch-otel-virtual')).toHaveTextContent(
      'Collect signals from AWS with OpenTelemetry'
    );
    expect(screen.getByTestId('card-icon-aws-cloudwatch-otel-virtual')).toHaveTextContent(
      'logoAWS'
    );
    expect(screen.getByTestId('card-url-aws-cloudwatch-otel-virtual')).toHaveTextContent(/^\/aws$/);
  });
});
