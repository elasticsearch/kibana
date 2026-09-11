/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';

import { EuiPanel, EuiSpacer, EuiText, EuiTitle } from '@elastic/eui';
import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import { DashboardRenderer } from '@kbn/dashboard-plugin/public';

import panels from './static_by_value_example_panels.json';

export const StaticByValueExample = () => {
  return (
    <>
      <EuiTitle>
        <h2>Static, by value example</h2>
      </EuiTitle>
      <EuiText>
        <p>Creates and displays static, non-editable by value dashboard.</p>
      </EuiText>
      <EuiSpacer size="m" />
      <EuiPanel hasBorder={true}>
        <DashboardRenderer
          getCreationOptions={async () => {
            return {
              getInitialInput: () => ({
                time_range: { from: 'now-30d', to: 'now' },
                viewMode: 'view',
                panels: panels as DashboardState['panels'],
              }),
            };
          }}
        />
      </EuiPanel>
    </>
  );
};
