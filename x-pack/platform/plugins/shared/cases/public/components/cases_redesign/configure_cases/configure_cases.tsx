/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiEmptyPrompt } from '@elastic/eui';

import { CASE_SETTINGS_TITLE, UNDER_CONSTRUCTION } from '../translations';

// Placeholder — will be replaced with the full redesigned Case Settings page.
export const ConfigureCasesRedesign: React.FC = () => (
  <EuiEmptyPrompt
    data-test-subj="cases-redesign-configure-cases"
    iconType="casesApp"
    title={<h2>{CASE_SETTINGS_TITLE}</h2>}
    body={<p>{UNDER_CONSTRUCTION}</p>}
  />
);

ConfigureCasesRedesign.displayName = 'ConfigureCasesRedesign';

// eslint-disable-next-line import/no-default-export
export { ConfigureCasesRedesign as default };
