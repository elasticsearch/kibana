/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import type { FC, MouseEvent } from 'react';
import React, { useMemo } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiImage,
  EuiSpacer,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { layoutRowOrStackCss } from '@kbn/css-utils/public/layout_css';
import { KibanaPageTemplate } from '@kbn/shared-ux-page-kibana-template';
import { FormattedMessage } from '@kbn/i18n-react';
import { METRIC_TYPE } from '@kbn/analytics';
import type { ApplicationStart } from '@kbn/core/public';
import { hasActiveModifierKey } from '@kbn/shared-ux-utility';
import { MoveData } from '../move_data';
import { SetupCloudConnect, CalloutSkeleton } from '../setup_cloud_connect';
import { createAppNavigationHandler } from '../app_navigation_handler';
import { getServices } from '../../kibana_services';

interface Props {
  addBasePath: (path: string) => string;
  application: ApplicationStart;
  isDarkMode: boolean;
  isCloudEnabled: boolean;
}

export const AddData: FC<Props> = ({ addBasePath, application, isDarkMode, isCloudEnabled }) => {
  const { trackUiMetric, addDataService, notifications } = getServices();
  const { euiTheme } = useEuiTheme();

  // Check cloud connect status
  const useCloudConnectStatus = useMemo(
    () => addDataService.getCloudConnectStatusHook(),
    [addDataService]
  );
  const { isLoading: isCloudConnectStatusLoading, isCloudConnected: isAlreadyConnected } =
    useCloudConnectStatus();

  const canAccessIntegrations = application.capabilities.navLinks.integrations;
  const hideAnnouncements = !notifications.tours.isEnabled();
  const hasCloudConnectPermission = Boolean(
    application.capabilities.cloudConnect?.show || application.capabilities.cloudConnect?.configure
  );
  const shouldShowCloudConnectCallout =
    hasCloudConnectPermission && !isAlreadyConnected && !hideAnnouncements;
  if (canAccessIntegrations) {
    return (
      <KibanaPageTemplate.Section
        bottomBorder
        paddingSize="xl"
        aria-labelledby="homeDataAdd__title"
      >
        <div css={layoutRowOrStackCss({ threshold: '50rem', gap: euiTheme.size.l, align: 'end' })}>
          <div>
            <EuiTitle size="s">
              <h2 id="homeDataAdd__title">
                <FormattedMessage
                  id="home.addData.sectionTitle"
                  defaultMessage="Get started by adding integrations"
                />
              </h2>
            </EuiTitle>

            <EuiSpacer />

            <EuiText>
              <p>
                <FormattedMessage
                  id="home.addData.text"
                  defaultMessage="To start working with your data, use one of our many ingest options. Collect data from an app or service, or upload a file. If you're not ready to use your own data, play with a sample data set."
                />
              </p>
            </EuiText>

            <EuiSpacer />

            <div css={layoutRowOrStackCss({ threshold: '36rem', gap: euiTheme.size.m })}>
              {/* eslint-disable-next-line @elastic/eui/href-or-on-click */}
              <EuiButton
                data-test-subj="homeAddData"
                fill={false}
                href={addBasePath('/app/integrations/browse')}
                iconType="plusCircle"
                onClick={(event: MouseEvent) => {
                  if (hasActiveModifierKey(event)) return;
                  trackUiMetric(METRIC_TYPE.CLICK, 'home_tutorial_directory');
                  createAppNavigationHandler('/app/integrations/browse')(event);
                }}
              >
                <FormattedMessage
                  id="home.addData.addDataButtonLabel"
                  defaultMessage="Add integrations"
                />
              </EuiButton>

              <EuiButtonEmpty
                data-test-subj="addSampleData"
                href={addBasePath('#/tutorial_directory/sampleData')}
                iconType="documents"
              >
                <FormattedMessage
                  id="home.addData.sampleDataButtonLabel"
                  defaultMessage="Try sample data"
                />
              </EuiButtonEmpty>

              <EuiButtonEmpty
                data-test-subj="uploadFile"
                href={addBasePath('#/tutorial_directory/fileDataViz')}
                iconType="download"
              >
                <FormattedMessage
                  id="home.addData.uploadFileButtonLabel"
                  defaultMessage="Upload a file"
                />
              </EuiButtonEmpty>
            </div>
          </div>

          <div>
            {!isCloudEnabled ? (
              hasCloudConnectPermission ? (
                isCloudConnectStatusLoading ? (
                  <CalloutSkeleton />
                ) : shouldShowCloudConnectCallout ? (
                  <SetupCloudConnect addBasePath={addBasePath} application={application} />
                ) : (
                  <MoveData addBasePath={addBasePath} />
                )
              ) : (
                <MoveData addBasePath={addBasePath} />
              )
            ) : (
              <EuiImage
                alt={i18n.translate('home.addData.illustration.alt.text', {
                  defaultMessage: 'Illustration of Elastic data integrations',
                })}
                wrapperProps={{ css: { display: 'block' } }}
                src={
                  addBasePath('/plugins/kibanaReact/assets/') +
                  (isDarkMode
                    ? 'illustration_integrations_darkmode.svg'
                    : 'illustration_integrations_lightmode.svg')
                }
              />
            )}
          </div>
        </div>
      </KibanaPageTemplate.Section>
    );
  } else {
    return null;
  }
};
