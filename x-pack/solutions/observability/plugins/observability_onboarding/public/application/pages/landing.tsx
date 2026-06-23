/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiPageTemplate } from '@elastic/eui';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import React from 'react';
import type { ObservabilityOnboardingAppServices } from '../..';
import { IS_ADD_DATA_PAGE_V2_ENABLED } from '../../../common/feature_flags';
import { ApiEndpoints } from '../api_endpoints/api_endpoints';
import { LandingHeader } from '../header';
import { IntegrationsGrid } from '../integrations_grid/integrations_grid';
import { OnboardingFlowForm } from '../onboarding_flow_form/onboarding_flow_form';
import { PageTemplate } from './template';

export const LandingPage = () => {
  const {
    services: { featureFlags },
  } = useKibana<ObservabilityOnboardingAppServices>();
  const isAddDataPageV2Enabled = featureFlags.getBooleanValue(IS_ADD_DATA_PAGE_V2_ENABLED, false);

  if (isAddDataPageV2Enabled) {
    return (
      <EuiPageTemplate paddingSize="none" data-test-subj="addDataPageV2">
        <LandingHeader />
        <EuiPageTemplate.Section paddingSize="xl" restrictWidth>
          <IntegrationsGrid />
          <ApiEndpoints />
        </EuiPageTemplate.Section>
      </EuiPageTemplate>
    );
  }

  return (
    <PageTemplate>
      <OnboardingFlowForm />
    </PageTemplate>
  );
};
