/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { resolveConnectorIdStepType } from './resolve_connector_id_step_type';
import type { StepInfo, StepPropInfo } from '../../../../../../entities/workflows/store';

describe('resolveConnectorIdStepType', () => {
  const waitForApprovalStep: StepInfo = {
    stepType: 'waitForApproval',
    stepId: 'request-approval',
    propInfos: {},
    stepYamlNode: {} as StepInfo['stepYamlNode'],
    lineStart: 1,
    lineEnd: 5,
  };

  it('returns null when focused step info is missing', () => {
    expect(resolveConnectorIdStepType(null, [], null)).toBeNull();
  });

  it('returns the step type for step-level connector-id fields', () => {
    expect(
      resolveConnectorIdStepType(
        { ...waitForApprovalStep, stepType: 'slack' },
        ['steps', 0, 'connector-id'],
        null
      )
    ).toBe('slack');
  });

  it('maps waitForApproval slack channel connector-id to slack connector type', () => {
    const focusedYamlPair = {
      path: ['with', 'channels', 'slack', 'connector-id'],
    } as StepPropInfo;

    expect(
      resolveConnectorIdStepType(
        waitForApprovalStep,
        ['steps', 0, ...focusedYamlPair.path],
        focusedYamlPair
      )
    ).toBe('slack');
  });

  it('maps waitForApproval slack_api channel connector-id to slack_api connector type', () => {
    const focusedYamlPair = {
      path: ['with', 'channels', 'slack_api', 'connector-id'],
    } as StepPropInfo;

    expect(
      resolveConnectorIdStepType(
        waitForApprovalStep,
        ['steps', 0, ...focusedYamlPair.path],
        focusedYamlPair
      )
    ).toBe('slack_api');
  });
});
