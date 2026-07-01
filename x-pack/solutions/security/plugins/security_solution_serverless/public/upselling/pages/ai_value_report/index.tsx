/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Suspense, useMemo } from 'react';
import { EuiLoadingSpinner, EuiPageHeader, EuiSpacer } from '@elastic/eui';
import { useKibana } from '../../../common/services';
import { AIValueReportUpgradeBanner } from './upgrade_banner';
import * as i18n from './translations';

export const AIValueReportUpsellPage: React.FC = () => {
  const { services } = useKibana();
  const AIValueReportComponent = services.securitySolution.getAIValueReport();

  const { from, to } = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOf30DaysAgo = new Date(startOfToday);
    startOf30DaysAgo.setDate(startOf30DaysAgo.getDate() - 30);
    return {
      from: startOf30DaysAgo.toISOString(),
      to: now.toISOString(),
    };
  }, []);

  return (
    <div data-test-subj="aiValueUpsellPage">
      <EuiPageHeader pageTitle={i18n.AI_VALUE_DASHBOARD} />
      <EuiSpacer size="l" />
      <Suspense fallback={<EuiLoadingSpinner />}>
        <AIValueReportComponent
          from={from}
          to={to}
          isSourcererLoading={false}
          sampleBanner={<AIValueReportUpgradeBanner />}
          forceSampleData={true}
        />
      </Suspense>
    </div>
  );
};
