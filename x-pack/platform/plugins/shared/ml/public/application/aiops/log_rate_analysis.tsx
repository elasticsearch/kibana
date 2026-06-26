/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React from 'react';
import { pick } from 'lodash';

import { LogRateAnalysis } from '@kbn/aiops-plugin/public';
import { AIOPS_EMBEDDABLE_ORIGIN } from '@kbn/aiops-common/constants';

import { MlDataSourcePicker } from '@kbn/aiops-components';
import { DataViewPicker } from '@kbn/unified-search-plugin/public';
import { SavedObjectFinder } from '@kbn/saved-objects-finder-plugin/public';
import { i18n } from '@kbn/i18n';
import { NoDataViewPrompt } from './no_data_view_prompt';
import { useDataSource } from '../contexts/ml/data_source_context';
import { useMlKibana } from '../contexts/kibana';
import { HelpMenu } from '../components/help_menu';
import { useEnabledFeatures } from '../contexts/ml';
import { MlAppHeader } from '../components/ml_app_header';

export const LogRateAnalysisPage: FC = () => {
  const { services } = useMlKibana();
  const { showContextualInsights, showNodeInfo } = useEnabledFeatures();

  const { selectedDataView: dataView, selectedSavedSearch: savedSearch } = useDataSource();

  const pageTitle = i18n.translate('xpack.ml.logRateAnalysis.pageHeader', {
    defaultMessage: 'Log rate analysis',
  });

  return (
    <>
      <MlAppHeader title={pageTitle} />
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
        <LogRateAnalysis
          dataView={dataView}
          savedSearch={savedSearch}
          showContextualInsights={showContextualInsights}
          showFrozenDataTierChoice={showNodeInfo}
          appContextValue={{
            embeddingOrigin: AIOPS_EMBEDDABLE_ORIGIN.ML_AIOPS_LABS,
            ...pick(services, [
              'analytics',
              'application',
              'charts',
              'contentManagement',
              'data',
              'dataViewEditor',
              'dataViewFieldEditor',
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
              'userProfile',
              'unifiedSearch',
              'observabilityAIAssistant',
              'embeddable',
              'cases',
              'cps',
            ]),
          }}
        />
      )}
      <HelpMenu docLink={services.docLinks.links.ml.guide} />
    </>
  );
};
