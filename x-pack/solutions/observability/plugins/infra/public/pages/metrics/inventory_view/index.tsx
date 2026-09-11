/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiFlexGroup, EuiFlexItem, EuiPageSection, useEuiTheme } from '@elastic/eui';
import { useTrackPageview } from '@kbn/observability-shared-plugin/public';
import { APP_WRAPPER_CLASS } from '@kbn/core/public';
import { AppHeader } from '@kbn/app-header';
import { css } from '@emotion/react';
import { InfraPageTemplate } from '../../../components/shared/templates/infra_page_template';
import { InfraOnboardingPage } from '../../../components/shared/templates/infra_onboarding_page';
import { useMetricsBreadcrumbs } from '../../../hooks/use_metrics_breadcrumbs';
import { useInfraHasData } from '../../../hooks/use_infra_has_data';
import { inventoryTitle } from '../../../translations';
import { SnapshotContainer } from './components/snapshot_container';
import { WaffleTimeProvider } from './hooks/use_waffle_time';
import { WaffleFiltersProvider } from './hooks/use_waffle_filters';
import { InventoryViewsProvider } from './hooks/use_inventory_views';
import { WaffleOptionsProvider } from './hooks/use_waffle_options';
import { InventoryTimeRangeMetadataProvider } from './providers/inventory_timerange_metadata_provider';
import { useMetricsAppHeaderMenu } from '../header/use_metrics_app_header_menu';

export const SnapshotPage = (): React.ReactElement => {
  const { euiTheme } = useEuiTheme();
  useTrackPageview({ app: 'infra_metrics', path: 'inventory' });
  useTrackPageview({ app: 'infra_metrics', path: 'inventory', delay: 15000 });

  useMetricsBreadcrumbs(
    [
      {
        text: inventoryTitle,
      },
    ],
    { parent: 'app' }
  );

  const { menu, flyouts } = useMetricsAppHeaderMenu();
  const { showOnboarding } = useInfraHasData();

  // Template noDataConfig ignores children; Inventory renders onboarding as body instead.
  return (
    <InventoryViewsProvider>
      <WaffleOptionsProvider>
        <WaffleTimeProvider>
          <WaffleFiltersProvider>
            <InventoryTimeRangeMetadataProvider>
              <div className={APP_WRAPPER_CLASS}>
                <InfraPageTemplate
                  hasDataOverride={!showOnboarding}
                  header={
                    <>
                      <AppHeader title={inventoryTitle} menu={menu} spacing="standard" />
                      {flyouts}
                    </>
                  }
                  pageSectionProps={{
                    paddingSize: 'none',
                    contentProps: {
                      css: css`
                        display: flex;
                        flex-direction: column;
                        flex: 1 1 auto;
                        min-height: 0;
                        height: 100%;
                        width: 100%;
                        padding-bottom: 0;
                      `,
                    },
                  }}
                >
                  {showOnboarding ? (
                    <InfraOnboardingPage />
                  ) : (
                    <EuiPageSection
                      paddingSize="m"
                      grow
                      restrictWidth={false}
                      contentProps={{
                        css: css`
                          display: flex;
                          flex-direction: column;
                          flex: 1 1 auto;
                          min-height: 0;
                          height: 100%;
                          width: 100%;
                          padding-top: ${euiTheme.size.base};
                          padding-bottom: 0;
                        `,
                      }}
                    >
                      <EuiFlexGroup
                        direction="column"
                        gutterSize="none"
                        css={css`
                          flex: 1;
                          min-height: 0;
                        `}
                      >
                        <EuiFlexItem
                          css={css`
                            min-height: 0;
                          `}
                        >
                          <SnapshotContainer />
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiPageSection>
                  )}
                </InfraPageTemplate>
              </div>
            </InventoryTimeRangeMetadataProvider>
          </WaffleFiltersProvider>
        </WaffleTimeProvider>
      </WaffleOptionsProvider>
    </InventoryViewsProvider>
  );
};
