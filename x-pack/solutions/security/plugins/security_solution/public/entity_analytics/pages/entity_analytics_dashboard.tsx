/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React, { useMemo } from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiLoadingSpinner } from '@elastic/eui';
import { ENTITY_ANALYTICS } from '../../app/translations';
import { SpyRoute } from '../../common/utils/route/spy_routes';
import { SecurityPageName } from '../../app/types';
import { SecuritySolutionPageWrapper } from '../../common/components/page_wrapper';
import { HeaderPage } from '../../common/components/header_page';
import { EmptyPrompt } from '../../common/components/empty_prompt';
import { SiemSearchBar } from '../../common/components/search_bar';
import { InputsModelId } from '../../common/store/inputs/constants';
import { FiltersGlobal } from '../../common/components/filters_global';
import { EntityAnalyticsHeader } from '../components/entity_analytics_header';
import { EntityAnalyticsAnomalies } from '../components/entity_analytics_anomalies';

import { EntityStoreDashboardPanels } from '../components/entity_store/components/dashboard_entity_store_panels';
import { useDataView } from '../../data_view_manager/hooks/use_data_view';
import { PageLoader } from '../../common/components/page_loader';
import { EaMlJobCallout } from '../components/ea_ml_job_callout';

const EntityAnalyticsComponent = () => {
  const [skipEmptyPrompt, setSkipEmptyPrompt] = React.useState(false);
  const onSkip = React.useCallback(() => setSkipEmptyPrompt(true), [setSkipEmptyPrompt]);

  const { dataView, status } = useDataView();
  const indicesExist = useMemo(
    () => !!dataView?.matchedIndices?.length,
    [dataView?.matchedIndices?.length]
  );
  const isDataViewLoading = useMemo(() => status !== 'ready', [status]);

  const showEmptyPrompt = !indicesExist && !skipEmptyPrompt;

  if (status === 'pristine') {
    return <PageLoader />;
  }

  return (
    <>
      {showEmptyPrompt ? (
        <EmptyPrompt onSkip={onSkip} />
      ) : (
        <>
          <FiltersGlobal>
            <SiemSearchBar dataView={dataView} id={InputsModelId.global} />
          </FiltersGlobal>

          <SecuritySolutionPageWrapper data-test-subj="entityAnalyticsPage">
            <HeaderPage title={ENTITY_ANALYTICS} />

            <EaMlJobCallout />

            {isDataViewLoading ? (
              <EuiLoadingSpinner size="l" data-test-subj="entityAnalyticsLoader" />
            ) : (
              <EuiFlexGroup direction="column" data-test-subj="entityAnalyticsSections">
                <EuiFlexItem>
                  <EntityAnalyticsHeader />
                </EuiFlexItem>

                <EuiFlexItem>
                  <EntityStoreDashboardPanels />
                </EuiFlexItem>

                <EuiFlexItem>
                  <EntityAnalyticsAnomalies />
                </EuiFlexItem>
              </EuiFlexGroup>
            )}
          </SecuritySolutionPageWrapper>
        </>
      )}

      <SpyRoute pageName={SecurityPageName.entityAnalytics} />
    </>
  );
};

export const EntityAnalyticsPage = EntityAnalyticsComponent;
