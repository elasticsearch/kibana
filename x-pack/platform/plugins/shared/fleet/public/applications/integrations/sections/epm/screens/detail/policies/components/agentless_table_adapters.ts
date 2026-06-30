/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PackagePolicy } from '../../../../../../types';
import type {
  AgentlessEnrollmentConnector,
  AgentlessEnrollmentSelectedInput,
} from '../../../../../../components';

// Adapter: extract connector deep-links from the package policy's enabled inputs.
// Disabled inputs aren't running, so their connectors shouldn't surface as cards.
export const getConnectorsFromPackagePolicy = (
  packagePolicy: PackagePolicy
): AgentlessEnrollmentConnector[] =>
  (packagePolicy.inputs ?? [])
    .filter(
      (input) =>
        input.enabled &&
        (!!input?.vars?.connector_id?.value || !!input?.vars?.connector_name?.value)
    )
    .map((input) => ({
      id: input?.vars?.connector_id?.value,
      name: input?.vars?.connector_name?.value,
    }));

// Adapter: identify the single enabled input from the package's policy templates
export const getSelectedInput = (
  packagePolicy: PackagePolicy
): AgentlessEnrollmentSelectedInput | undefined => {
  const enabledInputs = (packagePolicy.inputs ?? []).filter((input) => input.enabled);
  if (enabledInputs.length === 1 && enabledInputs[0].policy_template) {
    return { policyTemplate: enabledInputs[0].policy_template, type: enabledInputs[0].type };
  }
  return undefined;
};
