/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  WAIT_FOR_APPROVAL_CHANNEL_CONNECTOR_TYPES,
  type WaitForApprovalChannelKey,
} from '@kbn/workflows';
import type { StepInfo, StepPropInfo } from '../../../../../../entities/workflows/store';

function resolveWaitForApprovalChannelConnectorType(
  propPath: ReadonlyArray<string | number>
): string | null {
  const connectorIdIndex = propPath.lastIndexOf('connector-id');
  if (connectorIdIndex < 2 || propPath[connectorIdIndex - 2] !== 'channels') {
    return null;
  }

  const channelKey = propPath[connectorIdIndex - 1];
  if (typeof channelKey !== 'string') {
    return null;
  }

  return WAIT_FOR_APPROVAL_CHANNEL_CONNECTOR_TYPES[channelKey as WaitForApprovalChannelKey] ?? null;
}

/**
 * Resolves which connector type to use when suggesting connector-id values.
 * Step-level connector-id uses the step type (e.g. `slack`); nested ids under
 * `waitForApproval.with.channels` map to the notification channel connector type.
 */
export function resolveConnectorIdStepType(
  focusedStepInfo: StepInfo | null,
  path: ReadonlyArray<string | number>,
  focusedYamlPair: StepPropInfo | null
): string | null {
  if (!focusedStepInfo?.stepType) {
    return null;
  }

  const propPath = focusedYamlPair?.path ?? path;
  const channelConnectorType = resolveWaitForApprovalChannelConnectorType(propPath);
  if (channelConnectorType) {
    return channelConnectorType;
  }

  return focusedStepInfo.stepType;
}
