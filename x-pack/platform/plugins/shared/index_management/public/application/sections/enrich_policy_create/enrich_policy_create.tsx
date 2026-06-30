/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect } from 'react';
import type { RouteComponentProps } from 'react-router-dom';
import { i18n } from '@kbn/i18n';
import { EuiSpacer } from '@elastic/eui';
import { AppHeader } from '@kbn/app-header';
import { documentationService } from '../../services/documentation';
import { breadcrumbService, IndexManagementBreadcrumb } from '../../services/breadcrumbs';
import { CreatePolicyWizard } from './create_policy_wizard';
import { CreatePolicyContextProvider } from './create_policy_context';

export const EnrichPolicyCreate: React.FunctionComponent<RouteComponentProps> = () => {
  useEffect(() => {
    breadcrumbService.setBreadcrumbs(IndexManagementBreadcrumb.enrichPoliciesCreate);
  }, []);

  return (
    <CreatePolicyContextProvider>
      <AppHeader
        title={i18n.translate('xpack.idxMgmt.enrichPolicyCreate.appTitle', {
          defaultMessage: 'Create enrich policy',
        })}
        back="/app/management/data/index_management/enrich_policies"
        padding={{ bleed: 'l' }}
        docLink={documentationService.getCreateEnrichPolicyLink()}
      />
      <EuiSpacer size="l" />

      <CreatePolicyWizard />
    </CreatePolicyContextProvider>
  );
};
