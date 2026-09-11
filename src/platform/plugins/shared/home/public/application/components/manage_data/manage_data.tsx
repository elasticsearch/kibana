/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FC, MouseEvent } from 'react';
import React from 'react';
import {
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiSpacer,
  EuiTitle,
  EuiFlexItem,
  useEuiTheme,
} from '@elastic/eui';
import { layoutAutoGridCss } from '@kbn/css-utils/public/layout_css';
import { KibanaPageTemplate } from '@kbn/shared-ux-page-kibana-template';
import { FormattedMessage } from '@kbn/i18n-react';
import { METRIC_TYPE } from '@kbn/analytics';
import { AppStatus, type ApplicationStart } from '@kbn/core/public';
import useObservable from 'react-use/lib/useObservable';
import type { FeatureCatalogueEntry } from '../../../services';
import { createAppNavigationHandler } from '../app_navigation_handler';
import { Synopsis } from '../synopsis';
import { getServices } from '../../kibana_services';

const MANAGEMENT_APP_ID = 'management';

interface Props {
  addBasePath: (path: string) => string;
  application: ApplicationStart;
  features: FeatureCatalogueEntry[];
}

export const ManageData: FC<Props> = ({ addBasePath, application, features }) => {
  const { share, trackUiMetric } = getServices();
  const { euiTheme } = useEuiTheme();

  const consoleHref = share.url.locators.get('CONSOLE_APP_LOCATOR')?.useUrl({});
  const managementHref = share.url.locators
    .get('MANAGEMENT_APP_LOCATOR')
    ?.useUrl({ sectionId: '' });
  const { management: isManagementEnabled, dev_tools: isDevToolsEnabled } =
    application.capabilities.navLinks;
  const applications = useObservable(application.applications$);
  const managementApp = applications?.get(MANAGEMENT_APP_ID);
  const isManagementAppAccessible = Boolean(
    isManagementEnabled && managementApp?.status === AppStatus.accessible
  );

  if (features.length) {
    return (
      <KibanaPageTemplate.Section
        bottomBorder
        paddingSize="xl"
        aria-labelledby="homeDataManage__title"
        data-test-subj="homeDataManage"
      >
        <EuiFlexGroup alignItems="center">
          <EuiFlexItem grow={1}>
            <EuiTitle size="s">
              <h2 id="homeDataManage__title">
                <FormattedMessage id="home.manageData.sectionTitle" defaultMessage="Management" />
              </h2>
            </EuiTitle>
          </EuiFlexItem>

          {isDevToolsEnabled || isManagementAppAccessible ? (
            <EuiFlexItem grow={false}>
              <EuiFlexGroup alignItems="center" responsive={false} wrap>
                {/* Check if both the Dev Tools UI and the Console UI are enabled. */}
                {isDevToolsEnabled && consoleHref !== undefined ? (
                  <EuiFlexItem grow={false}>
                    <EuiButtonEmpty
                      data-test-subj="homeDevTools"
                      flush="both"
                      iconType="wrench"
                      href={consoleHref}
                    >
                      <FormattedMessage
                        id="home.manageData.devToolsButtonLabel"
                        defaultMessage="Dev Tools"
                      />
                    </EuiButtonEmpty>
                  </EuiFlexItem>
                ) : null}

                {isManagementAppAccessible ? (
                  <EuiFlexItem grow={false}>
                    <EuiButtonEmpty
                      data-test-subj="homeManage"
                      flush="both"
                      iconType="gear"
                      href={managementHref}
                    >
                      <FormattedMessage
                        id="home.manageData.stackManagementButtonLabel"
                        defaultMessage="Stack Management"
                      />
                    </EuiButtonEmpty>
                  </EuiFlexItem>
                ) : null}
              </EuiFlexGroup>
            </EuiFlexItem>
          ) : null}
        </EuiFlexGroup>

        <EuiSpacer />

        <div css={layoutAutoGridCss({ minItemWidth: '15rem', gap: euiTheme.size.l })}>
          {features.map((feature) => (
            <Synopsis
              description={feature.description}
              iconType={feature.icon}
              id={feature.id}
              key={feature.id}
              onClick={(event: MouseEvent) => {
                trackUiMetric(METRIC_TYPE.CLICK, `manage_data_card_${feature.id}`);
                createAppNavigationHandler(feature.path)(event);
              }}
              title={feature.title}
              url={addBasePath(feature.path)}
            />
          ))}
        </div>
      </KibanaPageTemplate.Section>
    );
  } else {
    return null;
  }
};
