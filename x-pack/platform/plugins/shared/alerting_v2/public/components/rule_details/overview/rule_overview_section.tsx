/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiErrorBoundary, EuiSpacer } from '@elastic/eui';
import { AlertTimelineSection } from './alert_timeline/alert_timeline_section';
import { DashboardArtifactsSection } from './artifacts';
import { SignalRuleOverview } from './signal_rule_overview';
import { useRule } from '../rule_context';

export const RuleOverviewSection: React.FC = () => {
  const rule = useRule();

  return (
    <div data-test-subj="ruleOverviewSection">
      {rule.kind === 'signal' ? (
        <EuiErrorBoundary>
          <SignalRuleOverview />
        </EuiErrorBoundary>
      ) : (
        <EuiErrorBoundary>
          <AlertTimelineSection />
        </EuiErrorBoundary>
      )}
      {rule.kind === 'alert' ? (
        <>
          <EuiSpacer size="l" />
          <DashboardArtifactsSection />
        </>
      ) : null}
    </div>
  );
};
