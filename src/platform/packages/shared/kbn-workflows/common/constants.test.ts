/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  WORKFLOWS_UI_SETTING_ID,
  WORKFLOWS_UI_SHOW_MANAGED_WORKFLOWS_SETTING_ID,
  WORKFLOWS_VERSIONING_SETTING_ID,
} from './constants';

describe('Workflow Feature Flag Constants', () => {
  it('should export the correct UI setting ID', () => {
    expect(WORKFLOWS_UI_SETTING_ID).toBe('workflows:ui:enabled');
  });

  it('should export the managed workflows visibility setting ID', () => {
    expect(WORKFLOWS_UI_SHOW_MANAGED_WORKFLOWS_SETTING_ID).toBe(
      'workflows:ui:showManagedWorkflows'
    );
  });

  it('should export the workflow versioning setting ID', () => {
    expect(WORKFLOWS_VERSIONING_SETTING_ID).toBe('workflows:versioning:enabled');
  });

  it('should have consistent naming pattern', () => {
    expect(WORKFLOWS_UI_SETTING_ID).toMatch(/^workflows:/);
    expect(WORKFLOWS_UI_SETTING_ID).toMatch(/:enabled$/);
    expect(WORKFLOWS_UI_SHOW_MANAGED_WORKFLOWS_SETTING_ID).toMatch(/^workflows:/);
    expect(WORKFLOWS_VERSIONING_SETTING_ID).toMatch(/^workflows:/);
    expect(WORKFLOWS_VERSIONING_SETTING_ID).toMatch(/:enabled$/);
  });
});
