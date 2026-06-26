/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useMemo } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import type { EuiCardProps } from '@elastic/eui';
import {
  EuiButton,
  EuiCard,
  EuiFlexGrid,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiPageBody,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiHorizontalRule,
  EuiIcon,
  useEuiTheme,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { ENABLE_ESQL } from '@kbn/esql-utils';
import { ML_PAGES } from '@kbn/ml-common-types/locator_ml_pages';
import { css } from '@emotion/react';
import { UpgradeWarning } from '../components/upgrade';
import { HelpMenu } from '../components/help_menu';
import { useMlKibana, useNavigateToPath } from '../contexts/kibana';
import { useCreateAndNavigateToManagementMlLink } from '../contexts/kibana/use_create_url';
import { MlAppHeader } from '../components/ml_app_header';
import { AnomalyDetectionOverviewCard } from './components/anomaly_detection_overview';
import { DataFrameAnalyticsOverviewCard } from './components/data_frame_analytics_overview';
import { useEnabledFeatures } from '../contexts/ml';
import { DataVisualizerGrid } from './data_visualizer_grid';
import { OverviewFooterItem } from './components/overview_ml_footer_item';
import { usePermissionCheck } from '../capabilities/check_capabilities';

export const useOverviewPageCustomCss = () => {
  const {
    euiTheme: { colors, size },
  } = useEuiTheme();

  return useMemo(
    () => css`
      .euiEmptyPrompt__content {
        padding-top: ${size.xxs};
        padding-bottom: ${size.xxs};
      }
      .euiText {
        color: ${colors.textHeading};
      }
    `,
    [colors?.textHeading, size?.xxs]
  );
};

export const overviewPanelDefaultState = Object.freeze({
  nodes: true,
  adJobs: true,
  dfaJobs: true,
});

export const MLOverviewCard = ({
  layout,
  path,
  title,
  titleSize = 's',
  description,
  iconType,
  buttonLabel,
  cardDataTestSubj,
  buttonDataTestSubj,
}: {
  path: string;
  iconType: string;
  buttonLabel: string;
  cardDataTestSubj: string;
  buttonDataTestSubj: string;
} & EuiCardProps) => {
  const navigateToPath = useNavigateToPath();

  return (
    <EuiFlexItem data-test-subj={cardDataTestSubj}>
      <EuiCard
        layout={layout}
        data-test-subj={cardDataTestSubj}
        hasBorder
        title={title}
        titleSize={titleSize}
        titleElement="h3"
        id="mlOverviewCardTitle"
      >
        <EuiText size="s">{description}</EuiText>
        <EuiSpacer size="s" />
        <EuiButton
          color="text"
          target="_self"
          onClick={() => navigateToPath(path)}
          data-test-subj={buttonDataTestSubj}
          aria-label={buttonLabel}
        >
          {iconType ? <EuiIcon aria-hidden={true} type={iconType} /> : null}
          {buttonLabel}
        </EuiButton>
      </EuiCard>
    </EuiFlexItem>
  );
};

export const OverviewPage: FC = () => {
  const {
    services: { docLinks, uiSettings },
  } = useMlKibana();
  const { isADEnabled, isDFAEnabled, isNLPEnabled } = useEnabledFeatures();
  const [canUseAiops] = usePermissionCheck(['canUseAiops']);
  const helpLink = docLinks.links.ml.guide;
  const trainedModelsDocLink = docLinks.links.ml.trainedModels;
  const navigateToPath = useNavigateToPath();
  const navigateToTrainedModels = useCreateAndNavigateToManagementMlLink(
    '',
    ML_PAGES.TRAINED_MODELS_MANAGE
  );
  const navigateToStackManagementMLOverview = useCreateAndNavigateToManagementMlLink(
    '',
    'overview'
  );
  const isEsqlEnabled = useMemo(() => uiSettings.get(ENABLE_ESQL), [uiSettings]);

  return (
    <>
      <MlAppHeader
        title={i18n.translate('xpack.ml.overview.welcomeBanner.header.title', {
          defaultMessage: 'Machine Learning',
        })}
        showDatePicker
        metadata={[
          {
            type: 'text',
            label: i18n.translate('xpack.ml.overview.welcomeBanner.header.titleDescription', {
              defaultMessage: 'Analyze your data and generate models for its patterns of behavior.',
            }),
          },
        ]}
      />
      <EuiPageBody restrictWidth={1200}>
        <UpgradeWarning />
        <EuiSpacer size="s" />
        <EuiFlexGroup gutterSize="m" direction="column">
          {isADEnabled || isDFAEnabled ? (
            <>
              <EuiFlexGroup direction="column">
                <EuiFlexItem>
                  <EuiTitle size="m">
                    <h2>
                      {i18n.translate('xpack.ml.overview.analyzeYourDataTitle', {
                        defaultMessage: 'Analyze your data',
                      })}
                    </h2>
                  </EuiTitle>
                </EuiFlexItem>
                <EuiFlexItem>
                  <EuiFlexGroup gutterSize="m">
                    {isADEnabled ? (
                      <EuiFlexItem data-test-subj="mlOverviewAnomalyDetectionCard">
                        <AnomalyDetectionOverviewCard />
                      </EuiFlexItem>
                    ) : null}
                    {isDFAEnabled ? (
                      <EuiFlexItem data-test-subj="mlOverviewCardDataFrameAnalytics">
                        <DataFrameAnalyticsOverviewCard />
                      </EuiFlexItem>
                    ) : null}
                  </EuiFlexGroup>
                </EuiFlexItem>
              </EuiFlexGroup>

              <EuiSpacer size="s" />
            </>
          ) : null}
          {canUseAiops ? (
            <>
              <EuiFlexGroup direction="column">
                <EuiTitle size="m">
                  <h2>
                    {i18n.translate('xpack.ml.overview.aiopsLabsTitle', {
                      defaultMessage: 'Surface insights',
                    })}
                  </h2>
                </EuiTitle>
                <EuiFlexGrid gutterSize="m" columns={3}>
                  <EuiFlexItem>
                    <EuiCard
                      display="subdued"
                      textAlign="left"
                      layout="vertical"
                      hasBorder
                      titleSize="xs"
                      title={
                        <FormattedMessage
                          id="xpack.ml.overview.logPatternAnalysisTitle"
                          defaultMessage="Log pattern analysis"
                        />
                      }
                      titleElement="h3"
                      description={
                        <>
                          <FormattedMessage
                            id="xpack.ml.overview.logPatternAnalysisDescription"
                            defaultMessage="Quickly spot unusual patterns and changes in normal log behavior in high-volume, noisy logs to accelerate root cause analysis."
                          />
                        </>
                      }
                      footer={
                        <EuiButton
                          color="text"
                          target="_self"
                          onClick={() => navigateToPath('/aiops/log_categorization')}
                          data-test-subj="mlOverviewCardLogPatternAnalysisButton"
                        >
                          <EuiIcon aria-hidden={true} type="pattern" />
                          <FormattedMessage
                            id="xpack.ml.overview.logPatternAnalysis.findPatternsButton"
                            defaultMessage="Find patterns"
                          />
                        </EuiButton>
                      }
                      data-test-subj="mlOverviewCardLogPatternAnalysis"
                    />
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiCard
                      display="subdued"
                      textAlign="left"
                      layout="vertical"
                      hasBorder
                      title={
                        <FormattedMessage
                          id="xpack.ml.overview.logRateAnalysis.title"
                          defaultMessage="Log rate analysis"
                        />
                      }
                      titleElement="h3"
                      titleSize="xs"
                      description={
                        <>
                          <FormattedMessage
                            id="xpack.ml.overview.logRateAnalysis.description"
                            defaultMessage="Detect log volume changes and uncover their causes easily by surfacing the log fields that dominate and explain the shift."
                          />
                        </>
                      }
                      footer={
                        <EuiButton
                          color="text"
                          target="_self"
                          onClick={() => navigateToPath('/aiops/log_rate_analysis')}
                          data-test-subj="mlOverviewCardLogRateAnalysisButton"
                        >
                          <EuiIcon aria-hidden={true} type="chartBarVertical" />
                          <FormattedMessage
                            id="xpack.ml.overview.logRateAnalysis.explainChangesButton"
                            defaultMessage="Explain changes"
                          />
                        </EuiButton>
                      }
                      data-test-subj="mlOverviewCardLogRateAnalysis"
                    />
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiCard
                      display="subdued"
                      textAlign="left"
                      layout="vertical"
                      hasBorder
                      title={
                        <FormattedMessage
                          id="xpack.ml.overview.changePointDetection.title"
                          defaultMessage="Change point detection"
                        />
                      }
                      titleElement="h3"
                      titleSize="xs"
                      description={
                        <>
                          <FormattedMessage
                            id="xpack.ml.overview.changePointDetection.description"
                            defaultMessage="Reveal significant changes in time series data, making it easier to correlate events without manually analyzing charts."
                          />
                        </>
                      }
                      footer={
                        <EuiButton
                          color="text"
                          target="_self"
                          onClick={() => navigateToPath('/aiops/change_point_detection')}
                          data-test-subj="mlOverviewCardChangePointDetectionButton"
                          aria-label={i18n.translate(
                            'xpack.ml.overview.changePointDetection.findChangesButton',
                            {
                              defaultMessage: 'Find changes',
                            }
                          )}
                        >
                          <EuiIcon aria-hidden={true} type="chartChangePoint" />
                          <FormattedMessage
                            id="xpack.ml.overview.changePointDetection.findChangesButton"
                            defaultMessage="Find changes"
                          />
                        </EuiButton>
                      }
                      data-test-subj="mlOverviewCardChangePointDetection"
                    />
                  </EuiFlexItem>
                </EuiFlexGrid>
              </EuiFlexGroup>
              <EuiSpacer size="s" />
            </>
          ) : null}
          <EuiFlexGroup direction="column">
            <EuiTitle size="m">
              <h2>
                {i18n.translate('xpack.ml.overview.visualizeYourDataTitle', {
                  defaultMessage: 'Visualize your data',
                })}
              </h2>
            </EuiTitle>
            <DataVisualizerGrid isEsqlEnabled={isEsqlEnabled} cardTitleSize="xs" />
          </EuiFlexGroup>
        </EuiFlexGroup>
        <EuiHorizontalRule />
        <EuiFlexGroup>
          {isADEnabled || isNLPEnabled || isDFAEnabled ? (
            <EuiFlexItem>
              <OverviewFooterItem
                title={i18n.translate('xpack.ml.overview.manageMlAssetsTitle', {
                  defaultMessage: 'Manage ML assets',
                })}
                description={i18n.translate('xpack.ml.overview.manageMlAssetsDescription', {
                  defaultMessage: 'Overview of your ML jobs, memory usage, and notifications.',
                })}
                docLink={helpLink}
                callToAction={
                  <EuiLink onClick={navigateToStackManagementMLOverview}>
                    {i18n.translate('xpack.ml.overview.goToManagmentLink', {
                      defaultMessage: 'Go to management',
                    })}
                  </EuiLink>
                }
              />
            </EuiFlexItem>
          ) : null}
          {isNLPEnabled || isDFAEnabled ? (
            <EuiFlexItem>
              <OverviewFooterItem
                title={i18n.translate('xpack.ml.overview.trainedModelsTitle', {
                  defaultMessage: 'Trained models',
                })}
                description={i18n.translate('xpack.ml.overview.trainedModelsDescription', {
                  defaultMessage:
                    'Add or manage trained models. See deployment stats or add a new deployment.',
                })}
                docLink={trainedModelsDocLink}
                callToAction={
                  <EuiLink onClick={navigateToTrainedModels}>
                    {i18n.translate('xpack.ml.overview.manageTrainedModelsLink', {
                      defaultMessage: 'Manage trained models',
                    })}
                  </EuiLink>
                }
              />
            </EuiFlexItem>
          ) : null}
          <EuiFlexItem>
            <OverviewFooterItem
              title={i18n.translate('xpack.ml.overview.browseDocumentationTitle', {
                defaultMessage: 'Browse documentation',
              })}
              description={i18n.translate('xpack.ml.overview.browseDocumentationDescription', {
                defaultMessage: 'In-depth guides on Elastic Machine Learning.',
              })}
              docLink={helpLink}
              callToAction={
                <EuiLink href={helpLink} external target="_blank">
                  {i18n.translate('xpack.ml.overview.startReadingDocsLink', {
                    defaultMessage: 'Start reading',
                  })}
                </EuiLink>
              }
            />
          </EuiFlexItem>
        </EuiFlexGroup>
        <HelpMenu docLink={helpLink} />
      </EuiPageBody>
    </>
  );
};

// required for dynamic import using React.lazy()
// eslint-disable-next-line import/no-default-export
export default OverviewPage;
