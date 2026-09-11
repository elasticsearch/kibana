/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  INFERENCE_PROCEED_CAPABILITY_ID,
  PII_TOKENIZATION_CAPABILITY_ID,
  resolveInferenceProceedCapabilityValue,
  resolvePiiTokenizationCapabilityValue,
  type InferenceProceedCapability,
  type PiiTokenizationContext,
} from '@kbn/inference-plugin/server';
import type { WorkflowExecutionCapabilities } from '@kbn/workflows-extensions/server';

const getCapabilityValue = (
  capabilities: WorkflowExecutionCapabilities | undefined,
  id: string
): object => {
  const capability = capabilities?.find((entry) => entry.id === id);
  if (!capability) {
    throw new Error(`Workflow step requires the request-local "${id}" capability`);
  }
  return capability.value;
};

export const getPiiTokenizationContext = (
  capabilities: WorkflowExecutionCapabilities | undefined
): PiiTokenizationContext => {
  const capability = resolvePiiTokenizationCapabilityValue(
    getCapabilityValue(capabilities, PII_TOKENIZATION_CAPABILITY_ID)
  );
  if (!capability) {
    throw new Error(
      `Workflow capability "${PII_TOKENIZATION_CAPABILITY_ID}" is invalid. ` +
        `Capabilities are in-memory handles that cannot survive JSON serialization.`
    );
  }
  return capability;
};

export const getInferenceProceedCapability = (
  capabilities: WorkflowExecutionCapabilities | undefined
): InferenceProceedCapability => {
  const capability = resolveInferenceProceedCapabilityValue(
    getCapabilityValue(capabilities, INFERENCE_PROCEED_CAPABILITY_ID)
  );
  if (!capability) {
    throw new Error(
      `Workflow capability "${INFERENCE_PROCEED_CAPABILITY_ID}" is invalid. ` +
        `Capabilities are in-memory handles that cannot survive JSON serialization.`
    );
  }
  return capability;
};
