/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { EuiSpacer, EuiText } from '@elastic/eui';
import { dynamic } from '@kbn/shared-ux-utility';
import { ML_PAGES } from '@kbn/ml-common-types/locator_ml_pages';
import type { MlRoute } from '../../router';
import { createPath, PageLoader } from '../../router';
import { useRouteResolver } from '../../use_resolver';
import { basicResolvers } from '../../resolvers';
import {
  type NavigateToApp,
  getMlManagementBreadcrumb,
  getStackManagementBreadcrumb,
} from '../../breadcrumbs';
import { MlAppHeader } from '../../../components/ml_app_header';

const SuppliedConfigurations = dynamic(async () => ({
  default: (await import('../../../supplied_configurations/supplied_configurations'))
    .SuppliedConfigurations,
}));

export const suppliedConfigurationsRouteFactory = (navigateToApp: NavigateToApp): MlRoute => ({
  id: 'supplied_configurations',
  path: createPath(ML_PAGES.SUPPLIED_CONFIGURATIONS),
  title: i18n.translate('xpack.ml.suppliedConfigurations.suppliedConfigurations.docTitle', {
    defaultMessage: 'Supplied configurations',
  }),
  render: () => <PageWrapper />,
  breadcrumbs: [
    getStackManagementBreadcrumb(navigateToApp),
    getMlManagementBreadcrumb('ANOMALY_DETECTION_MANAGEMENT_BREADCRUMB', navigateToApp),
    getMlManagementBreadcrumb('SUPPLIED_CONFIGURATIONS_MANAGEMENT_BREADCRUMB', navigateToApp),
  ],
  enableDatePicker: false,
  'data-test-subj': 'mlPageSuppliedConfigurations',
});

const PageWrapper: FC = () => {
  const { context } = useRouteResolver('full', ['canGetJobs'], basicResolvers());

  return (
    <PageLoader context={context}>
      <MlAppHeader
        title={i18n.translate('xpack.ml.suppliedConfigurations.preconfigurecJobsHeader', {
          defaultMessage: 'Supplied configurations',
        })}
      />
      <EuiSpacer size="s" />
      <EuiText size="s" data-test-subj="mlPageSuppliedConfigurations">
        <FormattedMessage
          id="xpack.ml.suppliedConfigurations.preconfigurecJobsHeaderDescription"
          defaultMessage="This page lists pre-defined anomaly detection job configurations with related Kibana assets."
        />
      </EuiText>
      <SuppliedConfigurations />
    </PageLoader>
  );
};
