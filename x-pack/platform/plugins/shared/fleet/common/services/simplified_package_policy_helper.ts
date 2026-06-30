/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { isEmpty, omit, pick } from 'lodash';

import type {
  AgentConditionExpression,
  NewPackagePolicyInput,
  NewPackagePolicyInputStream,
  PackagePolicyConfigRecord,
  PackagePolicy,
  NewPackagePolicy,
  PackageInfo,
  ExperimentalDataStreamFeature,
} from '../types';
import { DATASET_VAR_NAME, DATA_STREAM_TYPE_VAR_NAME } from '../constants';
import type { RegistryVarGroup } from '../types/models/package_spec';
import type { NewAgentlessPolicy } from '../types/rest_spec/agentless_policy';

import { PackagePolicyValidationError } from '../errors';

import { packageToPackagePolicy, getInputEffectiveName } from './package_to_package_policy';
import { isInputAllowedForDeploymentMode } from './agentless_policy_helper';
import { detectTargetCsp } from './cloud_connectors';

export type SimplifiedVars = Record<
  string,
  | string
  | string[]
  | boolean
  | number
  | number[]
  | null
  | {
      isSecretRef: boolean;
      id: string;
    }
>;

export type SimplifiedPackagePolicyStreams = Record<
  string,
  {
    enabled?: undefined | boolean;
    vars?: SimplifiedVars;
    condition?: AgentConditionExpression | null;
  }
>;

export type SimplifiedInputs = Record<
  string,
  {
    enabled?: boolean | undefined;
    vars?: SimplifiedVars;
    streams?: SimplifiedPackagePolicyStreams;
    condition?: AgentConditionExpression | null;
  }
>;

export interface SimplifiedPackagePolicy {
  id?: string;
  policy_id?: string | null;
  policy_ids: string[];
  output_id?: string;
  cloud_connector_id?: string | null;
  namespace: string;
  name: string;
  description?: string;
  vars?: SimplifiedVars;
  var_group_selections?: Record<string, string>;
  inputs?: SimplifiedInputs;
  supports_agentless?: boolean | null;
  supports_cloud_connector?: boolean | null;
  additional_datastreams_permissions?: string[] | null;
  // Only available for agentless integration policies.
  // On standard package policies this field is rejected by server-side validation.
  global_data_tags?: Array<{ name: string; value: string | number }> | null;
  condition?: AgentConditionExpression | null;
}

export interface FormattedPackagePolicy extends Omit<PackagePolicy, 'inputs' | 'vars'> {
  inputs?: SimplifiedInputs;
  vars?: SimplifiedVars;
}

export interface FormattedCreatePackagePolicyResponse {
  item: FormattedPackagePolicy;
}

export function packagePolicyToSimplifiedPackagePolicy(packagePolicy: PackagePolicy) {
  const formattedPackagePolicy = packagePolicy as unknown as FormattedPackagePolicy;
  formattedPackagePolicy.inputs = formatInputs(packagePolicy.inputs);
  if (packagePolicy.vars) {
    formattedPackagePolicy.vars = formatVars(packagePolicy.vars);
  }
  if (packagePolicy.var_group_selections) {
    (formattedPackagePolicy as any).var_group_selections = packagePolicy.var_group_selections;
  }

  return formattedPackagePolicy;
}

export function generateInputId(input: NewPackagePolicyInput) {
  return `${input.policy_template ? `${input.policy_template}-` : ''}${getInputEffectiveName(
    input
  )}`;
}

export function formatInputs(
  inputs: NewPackagePolicy['inputs'],
  supportsAgentless?: boolean,
  packageInfo?: PackageInfo
) {
  return inputs.reduce((acc, input) => {
    const inputId = generateInputId(input);
    if (!acc) {
      acc = {};
    }

    acc[inputId] = {
      enabled: isInputAllowedForDeploymentMode(
        input,
        supportsAgentless ? 'agentless' : 'default',
        packageInfo
      )
        ? input.enabled
        : false,
      vars: formatVars(input.vars),
      streams: formatStreams(input.streams),
      ...(input.condition !== undefined ? { condition: input.condition } : {}),
    };

    return acc;
  }, {} as SimplifiedPackagePolicy['inputs']);
}

export function formatVars(vars: NewPackagePolicy['inputs'][number]['vars']) {
  if (!vars) {
    return;
  }

  return Object.entries(vars).reduce((acc, [varKey, varRecord]) => {
    // the dataset var uses an internal format before we send it
    if (varKey === DATASET_VAR_NAME && varRecord?.value?.dataset) {
      acc[varKey] = varRecord?.value.dataset;
    } else {
      acc[varKey] = varRecord?.value;
    }

    return acc;
  }, {} as SimplifiedVars);
}

function formatStreams(streams: NewPackagePolicy['inputs'][number]['streams']) {
  return streams.reduce((acc, stream) => {
    if (!acc) {
      acc = {};
    }
    acc[stream.data_stream.dataset] = {
      enabled: stream.enabled,
      vars: formatVars(stream.vars),
      ...(stream.condition !== undefined ? { condition: stream.condition } : {}),
    };

    return acc;
  }, {} as SimplifiedPackagePolicyStreams);
}

export function syncDataStreamTypeFromVar(packagePolicy: NewPackagePolicy): void {
  for (const input of packagePolicy.inputs) {
    for (const stream of input.streams) {
      const typeVal = stream.vars?.[DATA_STREAM_TYPE_VAR_NAME]?.value;
      if (typeof typeVal === 'string' && typeVal && typeVal !== stream.data_stream.type) {
        stream.data_stream.type = typeVal;
      }
    }
  }
}

function assignVariables(
  userProvidedVars: SimplifiedVars,
  varsRecord?: PackagePolicyConfigRecord,
  ctxMessage = ''
) {
  Object.entries(userProvidedVars).forEach(([varKey, varValue]) => {
    if (!varsRecord || !varsRecord[varKey]) {
      throw new PackagePolicyValidationError(`Variable ${ctxMessage}:${varKey} not found`);
    }

    varsRecord[varKey].value = varValue;
  });
}

type StreamsMap = Map<string, NewPackagePolicyInputStream>;
type InputMap = Map<string, { input: NewPackagePolicyInput; streams: StreamsMap }>;

export function simplifiedPackagePolicytoNewPackagePolicy(
  data: SimplifiedPackagePolicy,
  packageInfo: PackageInfo,
  options?: {
    experimental_data_stream_features?: ExperimentalDataStreamFeature[];
    policyTemplate?: string;
  }
): NewPackagePolicy {
  const {
    policy_id: policyId,
    policy_ids: policyIds,
    output_id: outputId,
    namespace,
    name,
    description,
    inputs = {},
    vars: packageLevelVars,
    var_group_selections: varGroupSelections,
    supports_agentless: supportsAgentless,
    supports_cloud_connector: supportsCloudConnector,
    cloud_connector_id: cloudConnectorId,
    additional_datastreams_permissions: additionalDatastreamsPermissions,
    global_data_tags: globalDataTags,
    condition: integrationCondition,
  } = data;
  const packagePolicy = {
    ...packageToPackagePolicy(
      packageInfo,
      policyId && isEmpty(policyIds) ? policyId : policyIds,
      namespace,
      name,
      description,
      options?.policyTemplate
    ),
    supports_agentless: supportsAgentless,
    supports_cloud_connector: supportsCloudConnector,
    cloud_connector_id: cloudConnectorId,
    output_id: outputId,
    var_group_selections: varGroupSelections,
    ...(integrationCondition !== undefined ? { condition: integrationCondition } : {}),
  };

  if (additionalDatastreamsPermissions) {
    packagePolicy.additional_datastreams_permissions = additionalDatastreamsPermissions;
  }

  if (globalDataTags) {
    packagePolicy.global_data_tags = globalDataTags;
  }

  if (packagePolicy.package && options?.experimental_data_stream_features) {
    packagePolicy.package.experimental_data_stream_features =
      options.experimental_data_stream_features;
  }

  // Disable agentless-only inputs for non-agentless policies; the reverse is unnecessary as the agentless API always passes an explicit policy_template.
  if (!supportsAgentless) {
    packagePolicy.inputs.forEach((input) => {
      if (!isInputAllowedForDeploymentMode(input, 'default', packageInfo)) {
        input.enabled = false;
        input.streams.forEach((stream) => {
          stream.enabled = false;
        });
      }
    });
  }

  // Build a input and streams Map to easily find package policy stream
  const inputMap: InputMap = new Map();
  packagePolicy.inputs.forEach((input) => {
    const streamMap: StreamsMap = new Map();
    input.streams.forEach((stream) => {
      streamMap.set(stream.data_stream.dataset, stream);
    });
    inputMap.set(generateInputId(input), { input, streams: streamMap });
  });

  if (packageLevelVars) {
    assignVariables(packageLevelVars, packagePolicy.vars);
  }

  Object.entries(inputs).forEach(([inputId, val]) => {
    const { enabled, streams = {}, vars: inputLevelVars, condition: inputCondition } = val;

    const { input: packagePolicyInput, streams: streamsMap } = inputMap.get(inputId) ?? {};

    if (!packagePolicyInput || !streamsMap) {
      throw new PackagePolicyValidationError(`Input not found: ${inputId}`);
    }

    const isInputAllowed = isInputAllowedForDeploymentMode(
      packagePolicyInput,
      packagePolicy?.supports_agentless ? 'agentless' : 'default',
      packageInfo
    );

    packagePolicyInput.enabled = !isInputAllowed || enabled === false ? false : true;

    if (inputLevelVars) {
      assignVariables(inputLevelVars, packagePolicyInput.vars, `${inputId}`);
    }

    if (inputCondition !== undefined) {
      packagePolicyInput.condition = inputCondition;
    }

    Object.entries(streams).forEach(([streamId, streamVal]) => {
      const {
        enabled: streamEnabled,
        vars: streamsLevelVars,
        condition: streamCondition,
      } = streamVal;
      const packagePolicyStream = streamsMap.get(streamId);
      if (!packagePolicyStream) {
        throw new PackagePolicyValidationError(`Stream not found ${inputId}: ${streamId}`);
      }
      if (streamEnabled === false || isInputAllowed === false) {
        packagePolicyStream.enabled = false;
      } else {
        packagePolicyStream.enabled = true;
      }

      if (streamsLevelVars) {
        assignVariables(streamsLevelVars, packagePolicyStream.vars, `${inputId} ${streamId}`);
      }

      if (streamCondition !== undefined) {
        packagePolicyStream.condition = streamCondition;
      }
    });
  });

  syncDataStreamTypeFromVar(packagePolicy);

  return packagePolicy;
}

type AgentlessPolicyInput = NewPackagePolicy & {
  force?: boolean;
  create_dataset_templates?: boolean;
};

/**
 * Build the agentless create request body ({@link NewAgentlessPolicy}) from a
 * package policy. Single source of truth shared by the UI create submit
 * (`form.tsx`) and the Dev Tools request preview (`devtools_request.tsx`) so the
 * two can never drift.
 *
 * Uses an explicit `pick` allowlist (not an `omit` blocklist): only fields that
 * are part of the agentless contract are ever forwarded. This keeps the UI→API
 * payload leak-proof as `NewPackagePolicy` evolves — any new/unknown property
 * (e.g. `overrides`, `elasticsearch`, `is_managed`) is dropped instead of being
 * silently sent and potentially rejected by the server.
 */
export const toNewAgentlessPolicy = (
  packagePolicy: AgentlessPolicyInput,
  varGroups?: RegistryVarGroup[]
): NewAgentlessPolicy => {
  const targetCsp = detectTargetCsp(packagePolicy, varGroups);

  return {
    ...pick(packagePolicy, [
      'name',
      'description',
      'namespace',
      'additional_datastreams_permissions',
      'force',
      'create_dataset_templates',
      'global_data_tags',
      'var_group_selections',
    ]),
    package: omit(packagePolicy.package, 'title'),
    id: packagePolicy.id ? String(packagePolicy.id) : undefined,
    inputs: formatInputs(packagePolicy.inputs, true),
    vars: formatVars(packagePolicy.vars),
    ...(packagePolicy.supports_cloud_connector && {
      cloud_connector: {
        enabled: true,
        ...(targetCsp && { target_csp: targetCsp }),
        ...(packagePolicy.cloud_connector_id && {
          cloud_connector_id: packagePolicy.cloud_connector_id,
        }),
        ...(!packagePolicy.cloud_connector_id &&
          packagePolicy.cloud_connector_name && {
            name: packagePolicy.cloud_connector_name,
          }),
      },
    }),
  };
};
