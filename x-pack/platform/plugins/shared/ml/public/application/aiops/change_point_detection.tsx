/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React from 'react';
import { pick } from 'lodash';
import { i18n } from '@kbn/i18n';

import { ChangePointDetection } from '@kbn/aiops-plugin/public';
import { AIOPS_EMBEDDABLE_ORIGIN } from '@kbn/aiops-common/constants';
import { useFieldStatsTrigger, FieldStatsFlyoutProvider } from '@kbn/ml-field-stats-flyout';

import { MlDataSourcePicker } from '@kbn/aiops-components';
import { DataViewPicker } from '@kbn/unified-search-plugin/public';
import { SavedObjectFinder } from '@kbn/saved-objects-finder-plugin/public';
import { NoDataViewPrompt } from './no_data_view_prompt';
import { useDataSource } from '../contexts/ml/data_source_context';
import { useMlKibana } from '../contexts/kibana';
import { HelpMenu } from '../components/help_menu';
import { MlAppHeader } from '../components/ml_app_header';
import { useEnabledFeatures } from '../contexts/ml/serverless_context';

export const ChangePointDetectionPage: FC = () => {
  const { services } = useMlKibana();
  const { showNodeInfo } = useEnabledFeatures();

  const { selectedDataView: dataView, selectedSavedSearch: savedSearch } = useDataSource();

  const pageTitle = i18n.translate('xpack.ml.changePointDetection.pageHeader', {
    defaultMessage: 'Change point detection',
  });

  return (
    <>
      <MlAppHeader
        title={pageTitle}
        badges={[
          {
            label: i18n.translate('xpack.ml.navMenu.trainedModelsTabBetaLabel', {
              defaultMessage: 'Technical preview',
            }),
            color: 'hollow',
            tooltip: i18n.translate('xpack.ml.navMenu.trainedModelsTabBetaTooltipContent', {
              defaultMessage:
                'This functionality is in technical preview and may be changed or removed completely in a future release. Elastic will work to fix any issues, but features in technical preview are not subject to the support SLA of official GA features.',
            }),
          },
        ]}
      />
      {!dataView ? (
        <>
          <MlDataSourcePicker
            currentDataView={dataView ?? null}
            services={services}
            DataViewPickerComponent={DataViewPicker}
            SavedObjectFinderComponent={SavedObjectFinder}
          />
          <NoDataViewPrompt />
        </>
      ) : (
        <ChangePointDetection
          dataView={dataView}
          savedSearch={savedSearch}
          showFrozenDataTierChoice={showNodeInfo}
          appContextValue={{
            embeddingOrigin: AIOPS_EMBEDDABLE_ORIGIN.ML_AIOPS_LABS,
            ...pick(services, [
              'analytics',
              'application',
              'cases',
              'charts',
              'contentManagement',
              'data',
              'dataViewEditor',
              'dataViewFieldEditor',
              'embeddable',
              'executionContext',
              'fieldFormats',
              'http',
              'i18n',
              'lens',
              'notifications',
              'share',
              'storage',
              'theme',
              'uiActions',
              'uiSettings',
              'unifiedSearch',
              'usageCollection',
              'userProfile',
              'cps',
            ]),
            fieldStats: { useFieldStatsTrigger, FieldStatsFlyoutProvider },
          }}
        />
      )}
      <HelpMenu
        docLink={services.docLinks.links.aggs.change_point}
        appName={i18n.translate('xpack.ml.changePointDetection.pageHeader', {
          defaultMessage: 'Change point detection',
        })}
      />
    </>
  );
};
