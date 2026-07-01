/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { EuiPageTemplate, EuiTitle, EuiText } from '@elastic/eui';
import { createRoot } from 'react-dom/client';
import type { AppMountParameters, CoreStart } from '@kbn/core/public';
import { tryPollutingPrototypes, tryReassigningPrototypes } from '../common/pollute';

export const renderApp = (_core: CoreStart, { element }: AppMountParameters) => {
  const pollutionResult = JSON.stringify(tryPollutingPrototypes(), null, 2);
  const reassignResult = JSON.stringify(tryReassigningPrototypes(), null, 2);

  const root = createRoot(element);
  root.render(
    <EuiPageTemplate restrictWidth="1000px">
      <EuiPageTemplate.Header>
        <EuiTitle size="l">
          <h1>Hardening tests</h1>
        </EuiTitle>
      </EuiPageTemplate.Header>
      <EuiPageTemplate.Section>
        <EuiTitle>
          <h2>Goal of this page</h2>
        </EuiTitle>
        <EuiText>
          <p>
            The goal of this page is to attempt to pollute prototypes client-side, and report on the
            success/failure of these attempts.
          </p>
        </EuiText>
      </EuiPageTemplate.Section>
      <EuiPageTemplate.Section>
        <EuiTitle>
          <h2>Pollution result</h2>
        </EuiTitle>
        <EuiText>
          <pre data-test-subj="pollution-result">{pollutionResult}</pre>
        </EuiText>
      </EuiPageTemplate.Section>
      <EuiPageTemplate.Section>
        <EuiTitle>
          <h2>Reassignment result</h2>
        </EuiTitle>
        <EuiText>
          <pre data-test-subj="reassign-result">{reassignResult}</pre>
        </EuiText>
      </EuiPageTemplate.Section>
    </EuiPageTemplate>
  );

  return () => root.unmount();
};
