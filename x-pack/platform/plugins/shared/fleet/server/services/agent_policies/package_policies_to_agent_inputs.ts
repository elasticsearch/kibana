/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import apm from 'elastic-apm-node';
import { merge } from 'lodash';
import deepMerge from 'deepmerge';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import type { SavedObjectsClientContract } from '@kbn/core/server';

import type { FullAgentPolicyAddFields, GlobalDataTag } from '../../../common/types';
import { getAgentlessGlobalDataTags } from '../../../common/services/agentless_policy_helper';

import type {
  PackagePolicy,
  FullAgentPolicyInput,
  FullAgentPolicyInputStream,
  PackageInfo,
  PackagePolicyInput,
  NewPackagePolicyInput,
  PackagePolicySOAttributes,
} from '../../types';
import { DEFAULT_OUTPUT } from '../../constants';
import { pkgToPkgKey } from '../epm/registry';
import {
  DATA_STREAM_TYPE_VAR_NAME,
  FLEET_ENDPOINT_PACKAGE,
  GLOBAL_DATA_TAG_EXCLUDED_INPUTS,
  OTEL_COLLECTOR_INPUT_TYPE,
  USE_APM_VAR_NAME,
} from '../../../common/constants/epm';
import { _compilePackagePolicyInputs, getPackagePolicySavedObjectType } from '../package_policy';
import { getAgentTemplateAssetsMap } from '../epm/packages/get';
import { appContextService } from '../app_context';
import { PackagePolicyValidationError } from '../../errors';
import {
  packagePolicyInputAllowsUndefinedDataStreamType,
  getInputEffectiveName,
} from '../../../common/services';

import { getEffectiveOtelStreamDataset } from './get_effective_otel_stream_dataset';

const isPolicyEnabled = (packagePolicy: PackagePolicy) => {
  return packagePolicy.enabled && packagePolicy.inputs && packagePolicy.inputs.length;
};

const combineConditions = (conditions: Array<string | null | undefined>): string | undefined => {
  const filtered = conditions
    .map((c) => (typeof c === 'string' ? c.trim() : undefined))
    .filter((c): c is string => Boolean(c));
  if (filtered.length === 0) return undefined;
  if (filtered.length === 1) return filtered[0];
  return filtered.map((c) => `(${c})`).join(' and ');
};

export function getInputId(
  input: NewPackagePolicyInput,
  packagePolicyId?: string,
  packageInfo?: PackageInfo
): string {
  // Only the endpoint (Elastic Defend) package uses a simplified ID format for backward compatibility.
  // All other packages (including other limited packages) use the standard format with type and policy template.
  const useSimplifiedId = packageInfo?.name === FLEET_ENDPOINT_PACKAGE;

  return useSimplifiedId
    ? packagePolicyId || 'default'
    : `${getInputEffectiveName(input)}${input.policy_template ? `-${input.policy_template}` : ''}${
        packagePolicyId ? `-${packagePolicyId}` : ''
      }`;
}

export const storedPackagePolicyToAgentInputs = (
  packagePolicy: PackagePolicy,
  packageInfo?: PackageInfo,
  agentPolicyOutputId: string = DEFAULT_OUTPUT.name,
  agentPolicyNamespace?: string,
  addFields?: FullAgentPolicyAddFields
): FullAgentPolicyInput[] => {
  const fullInputs: FullAgentPolicyInput[] = [];

  if (!isPolicyEnabled(packagePolicy)) {
    return fullInputs;
  }

  const isAgentless = packagePolicy.supports_agentless === true;

  packagePolicy.inputs.forEach((input) => {
    if (!input.enabled) {
      return;
    }

    const integrationLevelCondition =
      !isAgentless && input.type !== OTEL_COLLECTOR_INPUT_TYPE
        ? packagePolicy.condition
        : undefined;

    const inputStreams = getFullInputStreams(input, {
      userIntegrationCondition: integrationLevelCondition,
    });

    const fullInput: FullAgentPolicyInput = {
      // @ts-ignore-next-line the following id is actually one level above the one in fullInputStream, but the linter thinks it gets overwritten
      id: input.id ?? getInputId(input, packagePolicy.id, packageInfo), // Generate input id if not already set
      revision: packagePolicy.revision,
      name: packagePolicy.name,
      type: input.type,
      // @ts-ignore-next-line
      data_stream: {
        namespace: packagePolicy?.namespace || agentPolicyNamespace || 'default', // custom namespace has precedence on agent policy's one
      },
      use_output: packagePolicy.output_id || agentPolicyOutputId,
      package_policy_id: packagePolicy.id,
      ...inputStreams,
    };

    // Guard: undefined data_stream.type is only valid for inputs that allow dynamic signal types.
    // Checked per-input so mixed packages (some dynamic, some static) are handled correctly.
    if (fullInput.streams) {
      const inputAllowsDynamic =
        packageInfo !== undefined &&
        packagePolicyInputAllowsUndefinedDataStreamType(packageInfo, input);
      for (const stream of fullInput.streams) {
        if (stream.data_stream?.type === undefined) {
          if (inputAllowsDynamic) {
            // For dynamic inputs, type is determined at runtime — strip the undefined key
            const { type: _type, ...restDataStream } = stream.data_stream ?? {};
            stream.data_stream = restDataStream as FullAgentPolicyInputStream['data_stream'];
          } else {
            // Should never reach here if preflightCheckPackagePolicy ran, but throw defensively
            throw new PackagePolicyValidationError(
              `[data_stream.type]: unexpected undefined stream type for non-dynamic package`
            );
          }
        }
      }
    }

    if (addFields && !GLOBAL_DATA_TAG_EXCLUDED_INPUTS.has(fullInput.type)) {
      fullInput.processors = [addFields];
    }

    // deeply merge the input.config values with the full policy input
    merge(
      fullInput,
      Object.entries(input.config || {}).reduce((acc, [key, { value }]) => {
        acc[key] = value;
        return acc;
      }, {} as Record<string, unknown>)
    );
    if (packagePolicy.package) {
      fullInput.meta = {
        package: {
          name: packagePolicy.package.name,
          version: packagePolicy.package.version ?? packageInfo?.version,
          ...(input.policy_template ? { policy_template: input.policy_template } : {}),
          ...(packageInfo?.release ? { release: packageInfo.release } : {}),
          agentVersion: packageInfo?.conditions?.agent?.version,
        },
      };
    }

    const fullInputWithOverrides = mergeInputsOverrides(packagePolicy, fullInput);
    fullInputs.push(fullInputWithOverrides);
  });
  return fullInputs;
};

export const mergeInputsOverrides = (
  packagePolicy: PackagePolicy,
  fullInput: FullAgentPolicyInput
) => {
  // check if there are inputs overrides and merge them
  if (packagePolicy?.overrides?.inputs) {
    const overrideInputs = packagePolicy.overrides.inputs;
    const keys = Object.keys(overrideInputs);

    if (keys.length > 0 && fullInput.id === keys[0]) {
      return deepMerge<FullAgentPolicyInput>(fullInput, overrideInputs[keys[0]]);
    }
  }
  return fullInput;
};

export interface GetFullInputStreamsOptions {
  /** Force-include disabled streams (used for template-inputs previews). */
  allStreamEnabled?: boolean;
  /** Map of stream ids <destinationId, originalId>. */
  streamsOriginalIdsMap?: Map<string, string>;
  /** Pre-gated by the caller; layered onto the input-level condition. */
  userIntegrationCondition?: string | null;
}

export const getFullInputStreams = (
  input: PackagePolicyInput,
  {
    allStreamEnabled = false,
    streamsOriginalIdsMap,
    userIntegrationCondition,
  }: GetFullInputStreamsOptions = {}
): FullAgentPolicyInputStream => {
  const { condition: compiledInputCondition, ...compiledInputRest } = input.compiled_input || {};
  const inputCondition = combineConditions([
    userIntegrationCondition,
    compiledInputCondition,
    input.condition,
  ]);

  return {
    ...compiledInputRest,
    ...(inputCondition !== undefined ? { condition: inputCondition } : {}),
    ...(input.streams.length
      ? {
          streams: input.streams
            .filter((stream) => stream.enabled || allStreamEnabled)
            .map((stream) => {
              const streamId = stream.id;
              const {
                data_stream: compiledDataStream,
                condition: compiledStreamCondition,
                ...compiledStream
              } = stream.compiled_stream ?? {};
              const streamCondition = combineConditions([
                compiledStreamCondition,
                stream.condition,
              ]);
              const fullStream: FullAgentPolicyInputStream = {
                id: streamId,
                data_stream: {
                  ...stream.data_stream,
                  ...compiledDataStream,
                },
                ...compiledStream,
                ...(streamCondition !== undefined ? { condition: streamCondition } : {}),
                ...Object.entries(stream.config || {}).reduce((acc, [key, { value }]) => {
                  acc[key] = value;
                  return acc;
                }, {} as { [k: string]: any }),
              };
              const dsTypeVar = stream.vars?.[DATA_STREAM_TYPE_VAR_NAME]?.value;
              if (dsTypeVar) {
                fullStream.data_stream = {
                  ...fullStream.data_stream,
                  type: dsTypeVar,
                };
              }

              if (input.type === OTEL_COLLECTOR_INPUT_TYPE) {
                // Replace policy output dataset verbatim (no .otel append); EPM templates use registry dataset + isOtelInputType separately.
                fullStream.data_stream = {
                  ...fullStream.data_stream,
                  dataset: getEffectiveOtelStreamDataset(stream),
                };

                const useAPMVar = stream.vars?.[USE_APM_VAR_NAME]?.value;
                if (useAPMVar !== undefined) {
                  fullStream[USE_APM_VAR_NAME] = useAPMVar;
                }
              }

              streamsOriginalIdsMap?.set(fullStream.id, streamId);

              return fullStream;
            }),
        }
      : {}),
  };
};

export const recompileInputsWithAgentVersion = async (
  packageInfo: PackageInfo,
  packagePolicy: PackagePolicy,
  agentVersion: string,
  soClient: SavedObjectsClientContract
): Promise<PackagePolicyInput[]> => {
  const logger = appContextService.getLogger();
  const assetsMap = await getAgentTemplateAssetsMap({
    logger,
    packageInfo: packageInfo!,
    savedObjectsClient: soClient,
  });

  const inputs = _compilePackagePolicyInputs(
    packageInfo!,
    packagePolicy.vars || {},
    packagePolicy.inputs,
    assetsMap,
    agentVersion
  );
  return inputs;
};

/**
 * Compile inputs for `agentVersion` and persist them into `inputs_for_versions` so later reads do
 * not pay the compile cost again.
 *
 * This can run from read only endpoints, since `getFullAgentPolicy` is reachable from the agent
 * policy GET handlers, so the write is best effort in two ways. The caller still gets the freshly
 * compiled inputs when persisting fails, and the update is guarded by the version that was read so
 * a concurrent backfill of a different agent version is never dropped by our stale copy of
 * `inputs_for_versions`.
 *
 * No variant `.fleet-policies` document is written from here. Only the deploy path writes those,
 * and it compiles through the same helper, so a policy backfilled by a read is picked up on the
 * next deploy rather than being left inconsistent.
 */
const backfillInputsForVersion = async ({
  packageInfo,
  packagePolicy,
  agentVersion,
  soClient,
  savedObjectType,
  inputsForVersions,
  version,
}: {
  packageInfo: PackageInfo;
  packagePolicy: PackagePolicy;
  agentVersion: string;
  soClient: SavedObjectsClientContract;
  savedObjectType: string;
  inputsForVersions?: Record<string, PackagePolicyInput[]>;
  version?: string;
}): Promise<PackagePolicyInput[] | undefined> => {
  const logger = appContextService.getLogger();
  const span = apm.startSpan(
    `compile packagePolicySO inputs_for_versions ${packageInfo.name}-${packageInfo.version} ${agentVersion}`,
    'full-agent-policy'
  );

  try {
    let versionInputs: PackagePolicyInput[];

    try {
      versionInputs = await recompileInputsWithAgentVersion(
        packageInfo,
        packagePolicy,
        agentVersion,
        soClient
      );
    } catch (error) {
      // Missing package assets or a malformed template would otherwise abort the whole agent policy
      // read with the same failure mode this change set out to remove.
      logger.warn(
        `Failed to compile inputs for agent version ${agentVersion} in package policy ${packagePolicy.id}, falling back to its default inputs: ${error.message}`
      );
      return undefined;
    }

    try {
      await soClient.update<PackagePolicySOAttributes>(
        savedObjectType,
        packagePolicy.id,
        {
          inputs_for_versions: {
            ...inputsForVersions,
            [agentVersion]: versionInputs,
          },
        },
        { version }
      );
    } catch (error) {
      if (SavedObjectsErrorHelpers.isConflictError(error)) {
        // Another request backfilled a version between our read and this write, so the entry we
        // would have written is stale. Whatever is still missing is backfilled by the next read.
        logger.debug(
          `Skipped persisting inputs for agent version ${agentVersion} in package policy ${packagePolicy.id}, the saved object changed concurrently`
        );
      } else {
        // Read only routes pass a request scoped client that may not be allowed to write, which
        // would otherwise recompile on every request with nothing in the logs to show for it.
        logger.warn(
          `Failed to persist inputs for agent version ${agentVersion} in package policy ${packagePolicy.id}, they will be recompiled on the next read: ${error.message}`
        );
      }
    }

    return versionInputs;
  } finally {
    span?.end();
  }
};

export const storedPackagePoliciesToAgentInputs = async (
  packagePolicies: PackagePolicy[],
  packageInfoCache: Map<string, PackageInfo>,
  agentPolicyOutputId: string = DEFAULT_OUTPUT.name,
  agentPolicyNamespace?: string,
  globalDataTags?: GlobalDataTag[],
  agentVersion?: string,
  soClient?: SavedObjectsClientContract,
  hasAgentVersionConditions?: boolean
): Promise<FullAgentPolicyInput[]> => {
  const fullInputs: FullAgentPolicyInput[] = [];

  for (const packagePolicy of packagePolicies) {
    if (!isPolicyEnabled(packagePolicy)) {
      continue;
    }

    const packageInfo = packagePolicy.package
      ? packageInfoCache.get(pkgToPkgKey(packagePolicy.package))
      : undefined;

    const filteredGlobalDataTags = filterGlobalDataTags(globalDataTags, packageInfo);
    const packagePolicyTags =
      filterGlobalDataTags(packagePolicy.global_data_tags ?? [], packageInfo) ?? [];
    const allTags = [...(filteredGlobalDataTags ?? []), ...packagePolicyTags];
    const addFields = allTags.length > 0 ? globalDataTagsToAddFields(allTags) : undefined;

    let packagePolicyWithUpdatedInputs = packagePolicy;
    // recompile inputs to apply agent version conditions
    if (
      agentVersion &&
      appContextService.getExperimentalFeatures().enableVersionSpecificPolicies &&
      hasAgentVersionConditions
    ) {
      const savedObjectType = await getPackagePolicySavedObjectType();
      const readSpan = apm.startSpan(
        `read packagePolicySO inputs_for_versions ${packageInfo!.name}-${
          packageInfo!.version
        } ${agentVersion}`,
        'full-agent-policy'
      );
      const packagePolicySO = await soClient?.get<PackagePolicySOAttributes>(
        savedObjectType,
        packagePolicy.id
      );
      readSpan?.end();

      const inputsForVersions = packagePolicySO?.attributes.inputs_for_versions;
      const hasVersionSpecificInputs = Boolean(
        inputsForVersions && Object.keys(inputsForVersions).length > 0
      );
      // `hasAgentVersionConditions` is computed once per agent policy, so it is true for every
      // package policy on a policy where at least one package has version conditions. Narrow it to
      // this package policy so we never compile and persist version specific inputs for a package
      // that has none. Template level conditions only become visible once `inputs_for_versions`
      // exists, which is why both signals are checked.
      const packageHasVersionCondition = Boolean(
        packagePolicy.package_agent_version_condition ?? packageInfo?.conditions?.agent?.version
      );

      if (hasVersionSpecificInputs || packageHasVersionCondition) {
        let versionInputs = inputsForVersions?.[agentVersion];

        if (!versionInputs) {
          // Not backfilled yet, e.g. right after a Kibana upgrade widens the default version set
          // (see getAgentVersionsForVersionSpecificPolicies) before this package policy has been
          // recompiled for it, or the package policy predates `enableVersionSpecificPolicies` and
          // has no `inputs_for_versions` at all. Compile on the fly so the read still succeeds.
          versionInputs = await backfillInputsForVersion({
            packageInfo: packageInfo!,
            packagePolicy,
            agentVersion,
            soClient: soClient!,
            savedObjectType,
            inputsForVersions,
            version: packagePolicySO?.version,
          });
        }

        // `versionInputs` is undefined only when the compile itself failed. Fall back to the
        // package policy's default inputs rather than failing the whole agent policy read.
        if (versionInputs) {
          packagePolicyWithUpdatedInputs = {
            ...packagePolicy,
            inputs: versionInputs,
          };
        }
      }
    }

    fullInputs.push(
      ...storedPackagePolicyToAgentInputs(
        packagePolicyWithUpdatedInputs,
        packageInfo,
        agentPolicyOutputId,
        agentPolicyNamespace,
        addFields
      )
    );
  }

  return fullInputs;
};

const globalDataTagsToAddFields = (tags: GlobalDataTag[]): FullAgentPolicyAddFields => {
  const fields: { [key: string]: string | number } = {};

  tags.forEach((tag) => {
    fields[tag.name] = tag.value;
  });

  return {
    add_fields: {
      target: '',
      fields,
    },
  };
};

const filterGlobalDataTags = (
  globalDataTags: GlobalDataTag[] | undefined,
  packageInfo: PackageInfo | undefined
): GlobalDataTag[] | undefined => {
  if (!globalDataTags) {
    return globalDataTags;
  }

  const agentlessGlobalDataTags = getAgentlessGlobalDataTags(packageInfo);

  if (!agentlessGlobalDataTags) {
    return globalDataTags;
  }

  return globalDataTags.filter((globalDataTag) => {
    return !agentlessGlobalDataTags.some(
      ({ name, value }) => name === globalDataTag.name && value === globalDataTag.value
    );
  });
};
