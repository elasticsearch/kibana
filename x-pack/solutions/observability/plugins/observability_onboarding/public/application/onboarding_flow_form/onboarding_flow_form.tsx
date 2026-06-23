/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { i18n } from '@kbn/i18n';

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import type { FunctionComponent } from 'react';
import {
  EuiCheckableCard,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  useGeneratedHtmlId,
  useEuiTheme,
  EuiBadge,
  EuiFlexGrid,
  EuiSearchBar,
} from '@elastic/eui';
import { css } from '@emotion/react';

import { useSearchParams } from 'react-router-dom-v5-compat';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { LazyPackageCard } from '@kbn/fleet-plugin/public';
import type { IntegrationCardItem } from '@kbn/fleet-plugin/public';
import { usePerformanceContext } from '@kbn/ebt-tools';
import { ObservabilityOnboardingPricingFeature } from '../../../common/pricing_features';
import { PackageListSearchForm } from '../package_list_search_form/package_list_search_form';
import type { Category } from './types';
import { useCustomCards, AWS_CLOUDWATCH_OTEL_CARD_ID } from './use_custom_cards';
import type { SupportedLogo } from '../shared/logo_icon';
import { LogoIcon } from '../shared/logo_icon';
import type { ObservabilityOnboardingAppServices } from '../..';
import { PackageList } from '../package_list/package_list';
import { usePricingFeature } from '../quickstart_flows/shared/use_pricing_feature';
import { ApiEndpoints } from '../api_endpoints/api_endpoints';

const CLOUD_PROVIDER_TILE_MIN_HEIGHT = 152;

interface UseCaseOption {
  id: Category;
  label: string;
  description: React.ReactNode;
  logos?: SupportedLogo[];
  showIntegrationsBadge?: boolean;
}

export const OnboardingFlowForm: FunctionComponent = () => {
  const {
    services: {
      context: { isCloud },
    },
  } = useKibana<ObservabilityOnboardingAppServices>();

  const metricsOnboardingEnabled = usePricingFeature(
    ObservabilityOnboardingPricingFeature.METRICS_ONBOARDING
  );

  const applicationUseCaseOption: UseCaseOption = {
    id: 'application',
    label: i18n.translate(
      'xpack.observability_onboarding.experimentalOnboardingFlow.euiCheckableCard.applicationLabel',
      { defaultMessage: 'Application' }
    ),
    description: i18n.translate(
      'xpack.observability_onboarding.onboardingFlowForm.applicationDescription',
      {
        defaultMessage:
          'Monitor your frontend and backend applications, set up synthetic monitors, and track application performance across your stack',
      }
    ),
    logos: ['opentelemetry', 'java', 'ruby', 'dotnet'],
  };

  const options: UseCaseOption[] = [
    {
      id: 'host',
      label: i18n.translate(
        'xpack.observability_onboarding.experimentalOnboardingFlow.euiCheckableCard.hostLabel',
        { defaultMessage: 'Host' }
      ),
      description: metricsOnboardingEnabled
        ? i18n.translate('xpack.observability_onboarding.onboardingFlowForm.hostDescription', {
            defaultMessage:
              'Track your host and its services by setting up SLOs, receiving alerts, and remediating performance issues',
          })
        : i18n.translate(
            'xpack.observability_onboarding.logsEssential.onboardingFlowForm.hostDescription',
            {
              defaultMessage:
                'Ingest and analyze logs on your host such as OS, service, application and other logs',
            }
          ),
      logos: ['opentelemetry', 'apache', 'mysql'],
    },
    {
      id: 'kubernetes',
      label: i18n.translate(
        'xpack.observability_onboarding.experimentalOnboardingFlow.euiCheckableCard.kubernetesLabel',
        { defaultMessage: 'Kubernetes' }
      ),
      description: metricsOnboardingEnabled
        ? i18n.translate(
            'xpack.observability_onboarding.onboardingFlowForm.kubernetesDescription',
            {
              defaultMessage:
                'Monitor your Kubernetes cluster and container workloads using logs, metrics, traces, and profiling data',
            }
          )
        : i18n.translate(
            'xpack.observability_onboarding.logsEssential.onboardingFlowForm.kubernetesDescription',
            {
              defaultMessage: 'Observe logs from your Kubernetes environments',
            }
          ),
      logos: ['kubernetes', 'opentelemetry'],
    },
    ...(metricsOnboardingEnabled ? [applicationUseCaseOption] : []),
    {
      id: 'cloud',
      label: i18n.translate(
        'xpack.observability_onboarding.experimentalOnboardingFlow.euiCheckableCard.cloudLabel',
        { defaultMessage: 'Cloud' }
      ),
      description: i18n.translate(
        'xpack.observability_onboarding.onboardingFlowForm.cloudDescription',
        {
          defaultMessage:
            'Ingest telemetry data from your cloud services to better understand application behavior and ensure service availability',
        }
      ),
      logos: ['azure', 'aws', 'gcp'],
    },
  ];

  const radioGroupId = useGeneratedHtmlId({ prefix: 'onboardingCategory' });
  const categorySelectorTitleId = useGeneratedHtmlId();
  const packageListTitleId = useGeneratedHtmlId();
  const { onPageReady } = usePerformanceContext();

  const [searchParams, setSearchParams] = useSearchParams();

  const suggestedPackagesRef = useRef<HTMLDivElement | null>(null);
  const searchResultsRef = useRef<HTMLDivElement | null>(null);
  const [integrationSearch, setIntegrationSearch] = useState(
    parseSearchQuery(searchParams.get('search'))
  );
  const { euiTheme } = useEuiTheme();

  useEffect(() => {
    const searchParam = parseSearchQuery(searchParams.get('search'));
    if (integrationSearch === searchParam) return;
    const entries: Record<string, string> = Object.fromEntries(searchParams.entries());
    if (integrationSearch) {
      entries.search = integrationSearch;
    } else {
      delete entries.search;
    }
    setSearchParams(entries, { replace: true });
  }, [integrationSearch, searchParams, setSearchParams]);

  const createCollectionCardHandler = useCallback(
    (query: string) => () => {
      setIntegrationSearch(query);
      if (searchResultsRef.current) {
        setTimeout(
          scrollIntoViewWithOffset,
          40, // Adding slight delay to ensure DOM is updated before calculating scroll position
          searchResultsRef.current,
          parseInt(euiTheme.size.l, 10)
        );
      }
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    onPageReady({
      meta: { description: '[ttfmp_onboarding] The UI with onboarding categories is rendered' },
    });
  }, [onPageReady]);

  const featuredCardsForCategoryMap: Record<Category, string[]> = {
    host: ['auto-detect-logs', 'otel-logs'],
    kubernetes: ['otel-kubernetes'],
    application: ['apm-virtual', 'otel-virtual', 'synthetics-virtual'],
    cloud: ['azure-logs-virtual', AWS_CLOUDWATCH_OTEL_CARD_ID, 'gcp-logs-virtual'],
  };
  const customCards = useCustomCards(createCollectionCardHandler);
  const selectedCategory = searchParams.get('category') as Category;
  const awsCollectionFallbackCard =
    selectedCategory === 'cloud'
      ? customCards.find((card) => card.id === 'aws-logs-virtual')
      : undefined;
  const featuredCardsForCategory: IntegrationCardItem[] = customCards.filter((card) => {
    if (selectedCategory === null) {
      return false;
    }

    const cardList = featuredCardsForCategoryMap[selectedCategory] ?? [];

    return cardList.includes(card.id);
  });

  /**
   * Cloud deployments have the new Firehose quick start
   * flow enabled, so the ond card 'epr:awsfirehose' should
   * not show up in the search results.
   */
  const searchExcludePackageIdList = isCloud ? ['epr:awsfirehose'] : [];

  let isSelectingCategoryWithKeyboard: boolean = false;

  return (
    <EuiPanel hasBorder paddingSize="xl">
      <EuiTitle size="s" id={categorySelectorTitleId}>
        <strong>
          {i18n.translate(
            'xpack.observability_onboarding.experimentalOnboardingFlow.strong.startCollectingYourDataLabel',
            {
              defaultMessage: 'What do you want to monitor?',
            }
          )}
        </strong>
      </EuiTitle>
      <EuiSpacer />
      <EuiFlexGrid
        columns={metricsOnboardingEnabled ? 2 : 3}
        role="group"
        aria-labelledby={categorySelectorTitleId}
        data-test-subj="observabilityOnboardingUseCaseGrid"
      >
        {options.map((option) => (
          <EuiFlexItem
            key={option.id}
            data-test-subj={`observabilityOnboardingUseCaseCard-${option.id}`} // EuiCheckableCard does not forward `data-test-subj` prop so using parent element instead
          >
            <EuiCheckableCard
              id={`${radioGroupId}_${option.id}`}
              name={radioGroupId}
              label={
                <>
                  <EuiText>
                    <strong>{option.label}</strong>
                  </EuiText>
                  {/* The description and logo icons are passed into `label` prop instead of `children` to ensure they are clickable */}
                  <EuiSpacer size="s" />
                  <EuiText
                    color="subdued"
                    size="s"
                    css={css`
                      flex-grow: 1; // Allow the description to grow to fill the space
                    `}
                  >
                    {option.description}
                  </EuiText>
                  {(option.logos || option.showIntegrationsBadge) && (
                    <>
                      <EuiSpacer size="m" />
                      <EuiFlexGroup
                        gutterSize="m"
                        responsive={false}
                        css={css`
                          flex-grow: 0; // Prevent the logos from growing to align to the bottom
                        `}
                        aria-hidden // Hide from screen readers as the logos are mainly decorative
                      >
                        {option.logos?.map((logo) => (
                          <EuiFlexItem key={logo} grow={false}>
                            <LogoIcon logo={logo} size="l" />
                          </EuiFlexItem>
                        ))}
                        {option.showIntegrationsBadge && (
                          <EuiBadge color="hollow">
                            <FormattedMessage
                              id="xpack.observability_onboarding.experimentalOnboardingFlow.form.addIntegrations"
                              defaultMessage="+ Integrations"
                              description="A badge indicating that the user can add additional observability integrations to their deployment via this option"
                            />
                          </EuiBadge>
                        )}
                      </EuiFlexGroup>
                    </>
                  )}
                </>
              }
              checked={option.id === selectedCategory}
              /**
               * onKeyDown and onKeyUp handlers disable
               * scrolling to the category items when user
               * changes the selected category using keyboard,
               * which prevents our custom scroll behavior
               * from conflicting with browser's native one to
               * put keyboard-focused item into the view.
               */
              onKeyDown={() => (isSelectingCategoryWithKeyboard = true)}
              onKeyUp={() => (isSelectingCategoryWithKeyboard = false)}
              onChange={() => {
                setIntegrationSearch('');
                setSearchParams({ category: option.id }, { replace: true });
              }}
              onClick={() => {
                if (!isSelectingCategoryWithKeyboard && suggestedPackagesRef.current) {
                  setTimeout(
                    scrollIntoViewWithOffset,
                    40, // Adding slight delay to ensure DOM is updated before calculating scroll position
                    suggestedPackagesRef.current,
                    parseInt(euiTheme.size.l, 10)
                  );
                }
              }}
              css={css`
                flex-grow: 1;

                & > .euiPanel {
                  display: flex;

                  & > .euiCheckableCard__label {
                    display: flex;
                    flex-direction: column;
                  }
                }
              `}
            />
          </EuiFlexItem>
        ))}
      </EuiFlexGrid>
      {/* Hiding element instead of not rending these elements in order to preload available packages on page load */}
      <div
        hidden={featuredCardsForCategory.length === 0}
        role="group"
        aria-labelledby={packageListTitleId}
      >
        <EuiSpacer size="xxl" />
        <div ref={suggestedPackagesRef}>
          <EuiTitle size="s" id={packageListTitleId}>
            <strong>
              {selectedCategory === 'kubernetes'
                ? i18n.translate(
                    'xpack.observability_onboarding.experimentalOnboardingFlow.kubernetesPackagesTitle',
                    {
                      defaultMessage: 'Monitor your Kubernetes cluster using:',
                    }
                  )
                : selectedCategory === 'application'
                ? i18n.translate(
                    'xpack.observability_onboarding.experimentalOnboardingFlow.applicationPackagesTitle',
                    {
                      defaultMessage: 'Monitor your Application using:',
                    }
                  )
                : selectedCategory === 'cloud'
                ? i18n.translate(
                    'xpack.observability_onboarding.experimentalOnboardingFlow.cloudPackagesTitle',
                    {
                      defaultMessage: 'Select your Cloud provider:',
                    }
                  )
                : i18n.translate(
                    'xpack.observability_onboarding.experimentalOnboardingFlow.hostPackagesTitle',
                    {
                      defaultMessage: 'Monitor your Host using:',
                    }
                  )}
            </strong>
          </EuiTitle>
          <EuiSpacer size="m" />
          <div
            css={css`
              [data-test-subj='integration-card:${AWS_CLOUDWATCH_OTEL_CARD_ID}'] {
                padding-block-start: ${euiTheme.size.base};
              }
            `}
          >
            <PackageList list={featuredCardsForCategory} showCardLabels={true} />
          </div>
          {awsCollectionFallbackCard && (
            <>
              <EuiSpacer size="s" />
              <EuiFlexGroup
                justifyContent="center"
                data-test-subj="observabilityOnboardingCloudExtraRow"
              >
                <EuiFlexItem
                  grow={false}
                  css={css`
                    width: calc((100% - ${euiTheme.size.base} * 2) / 3);
                  `}
                >
                  <Suspense fallback={null}>
                    <LazyPackageCard
                      {...awsCollectionFallbackCard}
                      showLabels={true}
                      minCardHeight={CLOUD_PROVIDER_TILE_MIN_HEIGHT}
                    />
                  </Suspense>
                </EuiFlexItem>
              </EuiFlexGroup>
            </>
          )}
        </div>
      </div>

      <div ref={searchResultsRef}>
        <EuiSpacer size="xxl" />
        <EuiText size="s" color="subdued">
          <strong>
            <FormattedMessage
              id="xpack.observability_onboarding.experimentalOnboardingFlow.form.searchPromptText"
              defaultMessage="Search through other ways of ingesting data:"
            />
          </strong>
        </EuiText>
        <EuiSpacer size="m" />
        <PackageListSearchForm
          searchQuery={integrationSearch}
          setSearchQuery={setIntegrationSearch}
          flowCategory={selectedCategory}
          customCards={customCards.filter(
            (card) => !card.isCollectionCard && card.id !== AWS_CLOUDWATCH_OTEL_CARD_ID
          )}
          excludePackageIdList={searchExcludePackageIdList}
        />
      </div>
      <ApiEndpoints />
    </EuiPanel>
  );
};

function scrollIntoViewWithOffset(element: HTMLElement, offset = 0) {
  // Fixed header in Kibana is different height between serverless and stateful so need to calculate dynamically.
  const fixedHeaders = document.querySelectorAll('#globalHeaderBars [data-fixed-header=true]');
  fixedHeaders.forEach((header) => {
    offset += header.getBoundingClientRect().height;
  });

  window.scrollTo({
    behavior: 'smooth',
    top: element.getBoundingClientRect().top - document.body.getBoundingClientRect().top - offset,
  });
}

function parseSearchQuery(searchQuery: string | null) {
  if (searchQuery === null) {
    return '';
  }

  try {
    EuiSearchBar.Query.parse(searchQuery ?? '');
    return searchQuery;
  } catch {
    return '';
  }
}
