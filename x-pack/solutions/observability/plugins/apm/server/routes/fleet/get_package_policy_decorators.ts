/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { set } from '@kbn/safer-lodash-set';
import { cloneDeep, get } from 'lodash';
import type { NewPackagePolicy } from '@kbn/fleet-plugin/common';
import type { AgentConfiguration } from '../../../common/agent_configuration/configuration_types';
import { AGENT_NAME } from '../../../common/es_fields/apm';
import type { ArtifactSourceMap } from './source_maps';

// agent config
export const AGENT_CONFIG_PATH = `inputs[0].config['apm-server'].value.agent_config`;
export const AGENT_CONFIG_API_KEY_PATH = `inputs[0].config['apm-server'].value.agent.config.elasticsearch.api_key`;

// source map
export const SOURCE_MAP_API_KEY_PATH = `inputs[0].config['apm-server'].value.rum.source_mapping.elasticsearch.api_key`;
export const SOURCE_MAP_PATH = `inputs[0].config['apm-server'].value.rum.source_mapping.metadata`;

/*
 * Will decorate the package policy with agent configurations
 */
export function getPackagePolicyWithAgentConfigurations(
  packagePolicy: NewPackagePolicy,
  agentConfigurations: AgentConfiguration[]
) {
  const packagePolicyClone = cloneDeep(packagePolicy);

  const value = agentConfigurations.map((configuration) => ({
    service: configuration.service,
    config: configuration.settings,
    etag: configuration.etag,
    [AGENT_NAME]: configuration.agent_name,
  }));

  set(packagePolicyClone, AGENT_CONFIG_PATH, value);
  return packagePolicyClone;
}

/*
 * Will decorate the package policy with source maps
 */
export function getPackagePolicyWithSourceMap({
  packagePolicy,
  artifacts,
}: {
  packagePolicy: NewPackagePolicy;
  artifacts: ArtifactSourceMap[];
}): NewPackagePolicy {
  const packagePolicyClone = cloneDeep(packagePolicy);

  const value = artifacts.map((artifact) => ({
    'service.name': artifact.body.serviceName,
    'service.version': artifact.body.serviceVersion,
    'bundle.filepath': artifact.body.bundleFilepath,
    'sourcemap.url': artifact.relative_url,
  }));
  set(packagePolicyClone, SOURCE_MAP_PATH, value);
  return packagePolicyClone;
}

/*
 * Will decorate the package policy with api keys for source maps and agent configurations
 */
export function getPackagePolicyWithApiKeys<T extends NewPackagePolicy>({
  packagePolicy,
  agentConfigApiKey,
  sourceMapApiKey,
}: {
  packagePolicy: T;
  agentConfigApiKey: string;
  sourceMapApiKey: string;
}): T {
  const packagePolicyClone = cloneDeep(packagePolicy);
  set(packagePolicyClone, SOURCE_MAP_API_KEY_PATH, sourceMapApiKey);
  set(packagePolicyClone, AGENT_CONFIG_API_KEY_PATH, agentConfigApiKey);
  return packagePolicyClone;
}

export function policyHasApiKey(packagePolicy: NewPackagePolicy) {
  return (
    get(packagePolicy, AGENT_CONFIG_API_KEY_PATH) !== undefined ||
    get(packagePolicy, SOURCE_MAP_API_KEY_PATH) !== undefined
  );
}
