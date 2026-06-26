/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useEffect, useState, useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiTitle,
  EuiSpacer,
  EuiCallOut,
  EuiText,
  EuiFlexGrid,
  EuiFlexItem,
  EuiLink,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { ES_FIELD_TYPES } from '@kbn/field-types';
import { ML_APP_LOCATOR } from '@kbn/ml-common-types/locator_app_locator';
import { ML_PAGES } from '@kbn/ml-common-types/locator_ml_pages';
import {
  useMlKibana,
  useMlManagementLocator,
  useNavigateToPath,
} from '../../../../contexts/kibana';

import { useDataSource } from '../../../../contexts/ml';
import { DataRecognizer } from '../../../../components/data_recognizer';
import { addItemToRecentlyAccessed } from '../../../../util/recently_accessed';
import { LinkCard } from '../../../../components/link_card';
import { useCreateAndNavigateToMlLink } from '../../../../contexts/kibana/use_create_url';
import { MlAppHeader } from '../../../../components/ml_app_header';
import { CPSUnsupportedWarning } from '../../../../components/cps_unsupported_warning';

export const Page: FC = () => {
  const {
    services: {
      chrome: { recentlyAccessed },
      share,
      notifications: { toasts },
    },
  } = useMlKibana();

  const dataSourceContext = useDataSource();
  const onSelectDifferentIndex = useCreateAndNavigateToMlLink(
    ML_PAGES.ANOMALY_DETECTION_CREATE_JOB_SELECT_INDEX
  );

  const [recognizerResultsCount, setRecognizerResultsCount] = useState(0);

  const { selectedDataView, selectedSavedSearch } = dataSourceContext;

  const isTimeBasedIndex: boolean = selectedDataView.isTimeBased();

  const navigateToPath = useNavigateToPath();
  const mlManagementLocator = useMlManagementLocator();

  const navigateToManagementPath = async (path: string) => {
    if (!mlManagementLocator) return;

    await mlManagementLocator.navigate({
      sectionId: 'ml',
      appId: `anomaly_detection${path}`,
    });
  };

  useEffect(() => {
    if (!isTimeBasedIndex) {
      toasts.addWarning({
        title: i18n.translate('xpack.ml.dataViewNotBasedOnTimeSeriesNotificationTitle', {
          defaultMessage: 'The data view {dataViewIndexPattern} is not based on a time series',
          values: { dataViewIndexPattern: selectedDataView.getIndexPattern() },
        }),
        text: i18n.translate('xpack.ml.dataViewNotBasedOnTimeSeriesNotificationDescription', {
          defaultMessage: 'Anomaly detection only runs over time-based indices',
        }),
      });
    }
  }, [isTimeBasedIndex, selectedDataView, toasts]);

  const hasGeoFields = useMemo(
    () =>
      [
        ...selectedDataView.fields.getByType(ES_FIELD_TYPES.GEO_POINT),
        ...selectedDataView.fields.getByType(ES_FIELD_TYPES.GEO_SHAPE),
      ].length > 0,
    [selectedDataView]
  );
  const indexWarningTitle =
    !isTimeBasedIndex && selectedSavedSearch
      ? i18n.translate(
          'xpack.ml.newJob.wizard.jobType.dataViewFromSavedSearchNotTimeBasedMessage',
          {
            defaultMessage:
              '{savedSearchTitle} uses data view {dataViewName} which is not time based',
            values: {
              savedSearchTitle: selectedSavedSearch.title ?? '',
              dataViewName: selectedDataView.getName(),
            },
          }
        )
      : i18n.translate('xpack.ml.newJob.wizard.jobType.dataViewNotTimeBasedMessage', {
          defaultMessage: 'Data view {dataViewName} is not time based',
          values: { dataViewName: selectedDataView.getName() },
        });

  const pageTitleLabel = selectedSavedSearch
    ? i18n.translate('xpack.ml.newJob.wizard.jobType.savedSearchPageTitleLabel', {
        defaultMessage: 'Discover session {savedSearchTitle}',
        values: { savedSearchTitle: selectedSavedSearch.title ?? '' },
      })
    : i18n.translate('xpack.ml.newJob.wizard.jobType.dataViewPageTitleLabel', {
        defaultMessage: 'data view {dataViewName}',
        values: { dataViewName: selectedDataView.getName() },
      });

  const recognizerResults = {
    count: 0,
    onChange() {
      setRecognizerResultsCount(recognizerResults.count);
    },
  };

  const getUrlParams = () => {
    return !selectedSavedSearch
      ? `?index=${selectedDataView.id}`
      : `?savedSearchId=${selectedSavedSearch.id}`;
  };

  const addSelectionToRecentlyAccessed = async () => {
    const title = !selectedSavedSearch
      ? selectedDataView.getName()
      : selectedSavedSearch.title ?? '';
    const mlLocator = share.url.locators.get(ML_APP_LOCATOR)!;

    const dataVisualizerLink = await mlLocator.getUrl(
      {
        page: ML_PAGES.DATA_VISUALIZER_INDEX_VIEWER,
        pageState: {
          ...(selectedSavedSearch?.id
            ? { savedSearchId: selectedSavedSearch.id }
            : { index: selectedDataView.id }),
        },
      },
      { absolute: true }
    );

    addItemToRecentlyAccessed(
      ML_PAGES.DATA_VISUALIZER_INDEX_VIEWER,
      title,
      dataVisualizerLink,
      recentlyAccessed
    );
    navigateToPath(`/${ML_PAGES.DATA_VISUALIZER_INDEX_VIEWER}${getUrlParams()}`);
  };

  const jobTypes = [
    {
      onClick: () => navigateToManagementPath(`/jobs/new_job/single_metric${getUrlParams()}`),
      icon: {
        type: 'createSingleMetricJob',
        ariaLabel: i18n.translate('xpack.ml.newJob.wizard.jobType.singleMetricAriaLabel', {
          defaultMessage: 'Single metric job',
        }),
      },
      title: i18n.translate('xpack.ml.newJob.wizard.jobType.singleMetricTitle', {
        defaultMessage: 'Single metric',
      }),
      description: i18n.translate('xpack.ml.newJob.wizard.jobType.singleMetricDescription', {
        defaultMessage: 'Detect anomalies in a single time series.',
      }),
      id: 'mlJobTypeLinkSingleMetricJob',
    },
    {
      onClick: () => navigateToManagementPath(`/jobs/new_job/multi_metric${getUrlParams()}`),
      icon: {
        type: 'createMultiMetricJob',
        ariaLabel: i18n.translate('xpack.ml.newJob.wizard.jobType.multiMetricAriaLabel', {
          defaultMessage: 'Multi-metric job',
        }),
      },
      title: i18n.translate('xpack.ml.newJob.wizard.jobType.multiMetricTitle', {
        defaultMessage: 'Multi-metric',
      }),
      description: i18n.translate('xpack.ml.newJob.wizard.jobType.multiMetricDescription', {
        defaultMessage:
          'Detect anomalies with one or more metrics and optionally split the analysis.',
      }),
      id: 'mlJobTypeLinkMultiMetricJob',
    },
    {
      onClick: () => navigateToManagementPath(`/jobs/new_job/population${getUrlParams()}`),
      icon: {
        type: 'createPopulationJob',
        ariaLabel: i18n.translate('xpack.ml.newJob.wizard.jobType.populationAriaLabel', {
          defaultMessage: 'Population job',
        }),
      },
      title: i18n.translate('xpack.ml.newJob.wizard.jobType.populationTitle', {
        defaultMessage: 'Population',
      }),
      description: i18n.translate('xpack.ml.newJob.wizard.jobType.populationDescription', {
        defaultMessage:
          'Detect unusual activity in a population. Recommended for high cardinality data.',
      }),
      id: 'mlJobTypeLinkPopulationJob',
    },
    {
      onClick: () => navigateToManagementPath(`/jobs/new_job/advanced${getUrlParams()}`),
      icon: {
        type: 'createAdvancedJob',
        ariaLabel: i18n.translate('xpack.ml.newJob.wizard.jobType.advancedAriaLabel', {
          defaultMessage: 'Advanced job',
        }),
      },
      title: i18n.translate('xpack.ml.newJob.wizard.jobType.advancedTitle', {
        defaultMessage: 'Advanced',
      }),
      description: i18n.translate('xpack.ml.newJob.wizard.jobType.advancedDescription', {
        defaultMessage:
          'Use the full range of options to create a job for more advanced use cases.',
      }),
      id: 'mlJobTypeLinkAdvancedJob',
    },
    {
      onClick: () => navigateToManagementPath(`/jobs/new_job/categorization${getUrlParams()}`),
      icon: {
        type: 'createGenericJob',
        ariaLabel: i18n.translate('xpack.ml.newJob.wizard.jobType.categorizationAriaLabel', {
          defaultMessage: 'Categorization job',
        }),
      },
      title: i18n.translate('xpack.ml.newJob.wizard.jobType.categorizationTitle', {
        defaultMessage: 'Categorization',
      }),
      description: i18n.translate('xpack.ml.newJob.wizard.jobType.categorizationDescription', {
        defaultMessage: 'Group log messages into categories and detect anomalies within them.',
      }),
      id: 'mlJobTypeLinkCategorizationJob',
    },
    {
      onClick: () => navigateToManagementPath(`/jobs/new_job/rare${getUrlParams()}`),
      icon: {
        type: 'createGenericJob',
        ariaLabel: i18n.translate('xpack.ml.newJob.wizard.jobType.rareAriaLabel', {
          defaultMessage: 'Rare job',
        }),
      },
      title: i18n.translate('xpack.ml.newJob.wizard.jobType.rareTitle', {
        defaultMessage: 'Rare',
      }),
      description: i18n.translate('xpack.ml.newJob.wizard.jobType.rareDescription', {
        defaultMessage: 'Detect rare values in time series data.',
      }),
      id: 'mlJobTypeLinkrareJob',
    },
  ];

  if (hasGeoFields) {
    jobTypes.push({
      onClick: () => navigateToManagementPath(`/jobs/new_job/geo${getUrlParams()}`),
      icon: {
        type: 'createGeoJob',
        ariaLabel: i18n.translate('xpack.ml.newJob.wizard.jobType.geoAriaLabel', {
          defaultMessage: 'Geo job',
        }),
      },
      title: i18n.translate('xpack.ml.newJob.wizard.jobType.geoTitle', {
        defaultMessage: 'Geo',
      }),
      description: i18n.translate('xpack.ml.newJob.wizard.jobType.geoDescription', {
        defaultMessage: 'Detect anomalies in the geographic location of the data.',
      }),
      id: 'mlJobTypeLinkGeoJob',
    });
  }

  return (
    <div data-test-subj="mlPageJobTypeSelection">
      <MlAppHeader
        title={i18n.translate('xpack.ml.newJob.wizard.jobType.createJobFromTitle', {
          defaultMessage: 'Create a job from the {pageTitleLabel}',
          values: { pageTitleLabel },
        })}
      />
      <EuiSpacer size="l" />

      <CPSUnsupportedWarning />

      {isTimeBasedIndex === false && (
        <>
          <EuiCallOut
            announceOnMount={false}
            title={indexWarningTitle}
            color="warning"
            iconType="warning"
          >
            <FormattedMessage
              id="xpack.ml.newJob.wizard.jobType.howToRunAnomalyDetectionDescription"
              defaultMessage="Anomaly detection can only be run over indices which are time based."
            />
            <br />
            <EuiLink onClick={onSelectDifferentIndex}>
              <FormattedMessage
                id="xpack.ml.newJob.wizard.jobType.selectDifferentIndexLinkText"
                defaultMessage="Select a different data view or saved Discover session"
              />
            </EuiLink>
          </EuiCallOut>
          <EuiSpacer size="l" />
        </>
      )}

      <div hidden={recognizerResultsCount === 0}>
        <EuiTitle size="s">
          <h2>
            <FormattedMessage
              id="xpack.ml.newJob.wizard.jobType.useSuppliedConfigurationTitle"
              defaultMessage="Use preconfigured jobs"
            />
          </h2>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiText>
          <p>
            <FormattedMessage
              id="xpack.ml.newJob.wizard.jobType.useSuppliedConfigurationDescription"
              defaultMessage="The fields in your data match known configurations.
                Create a set of preconfigured jobs."
            />
          </p>
        </EuiText>

        <EuiSpacer size="m" />

        <EuiFlexGrid gutterSize="l" columns={4}>
          <DataRecognizer
            indexPattern={selectedDataView}
            savedSearch={selectedSavedSearch}
            results={recognizerResults}
          />
        </EuiFlexGrid>

        <EuiSpacer size="xxl" />
      </div>

      <EuiTitle size="s">
        <h2>
          <FormattedMessage
            id="xpack.ml.newJob.wizard.jobType.useWizardTitle"
            defaultMessage="Use a wizard"
          />
        </h2>
      </EuiTitle>
      <EuiSpacer size="m" />

      <EuiFlexGrid gutterSize="l" columns={4}>
        {jobTypes.map(({ onClick, icon, title, description, id }) => (
          <EuiFlexItem key={id}>
            <LinkCard
              data-test-subj={id}
              onClick={onClick}
              icon={icon.type}
              iconAreaLabel={icon.ariaLabel}
              title={title}
              description={description}
              isDisabled={!isTimeBasedIndex}
            />
          </EuiFlexItem>
        ))}
      </EuiFlexGrid>

      <EuiSpacer size="xxl" />

      <EuiTitle size="s">
        <h2>
          <FormattedMessage
            id="xpack.ml.newJob.wizard.jobType.learnMoreAboutDataTitle"
            defaultMessage="Learn more about your data"
          />
        </h2>
      </EuiTitle>
      <EuiSpacer size="s" />
      <EuiText>
        <FormattedMessage
          id="xpack.ml.newJob.wizard.jobType.learnMoreAboutDataDescription"
          defaultMessage="If you're not sure what type of job to create, first explore the fields and metrics in your data."
        />
      </EuiText>

      <EuiSpacer size="m" />

      <EuiFlexGrid gutterSize="l" columns={4}>
        <EuiFlexItem>
          <LinkCard
            icon="dataVisualizer"
            iconAreaLabel={i18n.translate(
              'xpack.ml.newJob.wizard.jobType.dataVisualizerAriaLabel',
              {
                defaultMessage: 'Data Visualizer',
              }
            )}
            title={
              <FormattedMessage
                id="xpack.ml.newJob.wizard.jobType.dataVisualizerTitle"
                defaultMessage="Data Visualizer"
              />
            }
            description={
              <FormattedMessage
                id="xpack.ml.newJob.wizard.jobType.dataVisualizerDescription"
                defaultMessage="Learn more about the characteristics of your data and identify the fields for analysis with machine learning."
              />
            }
            onClick={addSelectionToRecentlyAccessed}
          />
        </EuiFlexItem>
      </EuiFlexGrid>
    </div>
  );
};
