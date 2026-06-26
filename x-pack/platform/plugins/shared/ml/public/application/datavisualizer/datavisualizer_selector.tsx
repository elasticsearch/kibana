/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { Fragment, useMemo } from 'react';

import {
  EuiButton,
  EuiCard,
  EuiFlexGroup,
  EuiFlexGrid,
  EuiFlexItem,
  EuiLink,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';

import { FormattedMessage } from '@kbn/i18n-react';
import { useTimefilter } from '@kbn/ml-date-picker';
import { ENABLE_ESQL } from '@kbn/esql-utils';
import { i18n } from '@kbn/i18n';
import { isFullLicense } from '../license';
import { useMlKibana } from '../contexts/kibana';
import { HelpMenu } from '../components/help_menu';
import { MlAppHeader } from '../components/ml_app_header';
import { DataVisualizerGrid } from '../overview/data_visualizer_grid';

function startTrialDescription() {
  return (
    <span>
      <FormattedMessage
        id="xpack.ml.datavisualizer.startTrial.fullMLFeaturesDescription"
        defaultMessage="To experience the full Machine Learning features that a {subscriptionsLink} offers, start a 30-day trial."
        values={{
          subscriptionsLink: (
            <EuiLink href="https://www.elastic.co/subscriptions" target="_blank">
              <FormattedMessage
                id="xpack.ml.datavisualizer.startTrial.subscriptionsLinkText"
                defaultMessage="Platinum or Enterprise subscription"
              />
            </EuiLink>
          ),
        }}
      />
    </span>
  );
}

export const DatavisualizerSelector: FC = () => {
  useTimefilter({ timeRangeSelector: false, autoRefreshSelector: false });

  const {
    services: {
      licenseManagement,
      http: { basePath },
      docLinks,
      dataVisualizer,
      uiSettings,
    },
  } = useMlKibana();
  const isEsqlEnabled = useMemo(() => uiSettings.get(ENABLE_ESQL), [uiSettings]);
  const helpLink = docLinks.links.ml.guide;

  const startTrialVisible =
    licenseManagement !== undefined &&
    licenseManagement.enabled === true &&
    isFullLicense() === false;

  if (dataVisualizer === undefined) {
    // eslint-disable-next-line no-console
    console.error('File data visualizer plugin not available');
    return null;
  }

  return (
    <>
      <div data-test-subj="mlPageDataVisualizerSelector">
        <MlAppHeader
          title={i18n.translate('xpack.ml.datavisualizer.selector.dataVisualizerTitle', {
            defaultMessage: 'Data visualizer',
          })}
        />

        <EuiFlexGroup gutterSize="xl">
          <EuiFlexItem grow={false}>
            <EuiText color="subdued">
              <FormattedMessage
                id="xpack.ml.datavisualizer.selector.dataVisualizerDescription"
                defaultMessage="The Machine Learning Data Visualizer tool helps you understand your data
                  by analyzing the metrics and fields in a log file or an existing Elasticsearch index."
              />
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="xl" />
        <DataVisualizerGrid isEsqlEnabled={isEsqlEnabled} />
        {startTrialVisible === true && (
          <Fragment>
            <EuiSpacer size="xxl" />
            <EuiSpacer size="xxl" />
            <EuiFlexGrid gutterSize="xl" columns={2} style={{ maxWidth: '1000px' }}>
              <EuiFlexItem>
                <EuiCard
                  hasBorder
                  title={
                    <FormattedMessage
                      id="xpack.ml.datavisualizer.selector.startTrialTitle"
                      defaultMessage="Start trial"
                    />
                  }
                  description={startTrialDescription()}
                  footer={
                    <EuiButton
                      target="_blank"
                      href={`${basePath.get()}/app/management/stack/license_management/home`}
                      data-test-subj="mlDataVisualizerStartTrialButton"
                    >
                      <FormattedMessage
                        id="xpack.ml.datavisualizer.selector.startTrialButtonLabel"
                        defaultMessage="Start trial"
                      />
                    </EuiButton>
                  }
                  data-test-subj="mlDataVisualizerCardStartTrial"
                />
              </EuiFlexItem>
            </EuiFlexGrid>
          </Fragment>
        )}
      </div>
      <HelpMenu docLink={helpLink} />
    </>
  );
};
