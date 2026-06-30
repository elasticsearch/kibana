/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentlessEnrollmentSelectedInput } from './types';

/** Minimal shape needed from the package's policy templates to resolve a title. */
interface IntegrationTitleSource {
  name: string;
  inputs?: Array<{ type: string; title?: string }>;
}

/**
 * Resolves the integration title shown in the enrollment copy. When a single input
 * is selected, prefer that input's title from the package's policy templates
 * (e.g. "AWS S3"); otherwise fall back to the package title, then the policy name.
 */
export const resolveIntegrationTitle = ({
  packageTitle,
  policyTemplates,
  selectedInput,
  fallbackName,
}: {
  packageTitle?: string;
  policyTemplates?: IntegrationTitleSource[];
  selectedInput?: AgentlessEnrollmentSelectedInput;
  fallbackName: string;
}): string => {
  if (!packageTitle) {
    return fallbackName;
  }
  if (!selectedInput) {
    return packageTitle;
  }
  const policyTemplate = policyTemplates?.find(
    (template) => template.name === selectedInput.policyTemplate
  );
  const input = policyTemplate?.inputs?.find((i) => i.type === selectedInput.type);
  return input?.title || packageTitle;
};
