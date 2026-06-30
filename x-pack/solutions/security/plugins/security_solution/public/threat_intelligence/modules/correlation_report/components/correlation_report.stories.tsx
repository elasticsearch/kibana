/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiProvider } from '@elastic/eui';
import { CorrelationReport } from './correlation_report';
import {
  mockCorrelationFindings,
  mockCandidateMeta,
} from '../../../mocks/mock_correlation_findings';

export default {
  component: Default,
  title: 'ThreatIntelligence/CorrelationReport',
};

export function Default() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <CorrelationReport
        findings={mockCorrelationFindings}
        candidateMeta={mockCandidateMeta}
        title="SILENTCONNECT / ScreenConnect — Correlation Run"
        runId="run-2024-06-14-001"
      />
    </div>
  );
}

export function DarkMode() {
  return (
    <EuiProvider colorMode="dark">
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 24, backgroundColor: '#1a1b20' }}>
        <CorrelationReport
          findings={mockCorrelationFindings}
          candidateMeta={mockCandidateMeta}
          title="SILENTCONNECT / ScreenConnect — Correlation Run"
          runId="run-2024-06-14-001"
        />
      </div>
    </EuiProvider>
  );
}
