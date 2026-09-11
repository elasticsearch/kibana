/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsClientContract } from '@kbn/core/server';
import { uniq } from 'lodash';

import type { AgentPolicy, DownloadSource, FleetProxy } from '../../types';
import { outputService } from '../output';
import { isBeatsOutput } from '../../../common/services/output_helpers';

import { getDownloadSourcesForAgentPolicy } from '../../routes/agent/source_uri_utils';

import { getFleetServerHostsForAgentPolicy } from '../fleet_server_host';
import { appContextService } from '../app_context';
import { bulkGetFleetProxies } from '../fleet_proxies';
import { OutputNotFoundError } from '../../errors';

export async function fetchRelatedSavedObjects(
  soClient: SavedObjectsClientContract,
  agentPolicy: AgentPolicy
) {
  const logger = appContextService.getLogger().get('fetchRelatedSavedObjects');

  logger.debug(
    () =>
      `getting related saved objects for policy [${
        agentPolicy.id
      }] with soClient scoped to [${soClient.getCurrentNamespace()}]`
  );

  const [defaultDataOutputId, defaultMonitoringOutputId] = await Promise.all([
    outputService.getDefaultDataOutputId(),
    outputService.getDefaultMonitoringOutputId(),
  ]);

  if (!defaultDataOutputId) {
    throw new OutputNotFoundError('Default output is not setup');
  }

  const dataOutputId = agentPolicy.data_output_id || defaultDataOutputId;
  const monitoringOutputId =
    agentPolicy.monitoring_output_id || defaultMonitoringOutputId || dataOutputId;

  const outputIds = uniq([
    dataOutputId,
    monitoringOutputId,
    ...(agentPolicy.package_policies || []).reduce((acc: string[], packagePolicy) => {
      if (packagePolicy.output_id) {
        acc.push(packagePolicy.output_id);
      }
      return acc;
    }, []),
  ]);

  logger.debug(
    `Fetching outputs, download sources and fleet server hosts for agent policy [${agentPolicy.id}]`
  );

  const [outputs, downloadSources, fleetServerHosts] = await Promise.all([
    outputService.bulkGet(outputIds, { ignoreNotFound: true }),
    getDownloadSourcesForAgentPolicy(agentPolicy),
    getFleetServerHostsForAgentPolicy(soClient, agentPolicy).catch((err) => {
      logger.warn(`Unable to get fleet server hosts for policy ${agentPolicy?.id}: ${err.message}`);

      return undefined;
    }),
  ]);

  const dataOutput = outputs.find((output) => output.id === dataOutputId);
  if (!dataOutput) {
    throw new OutputNotFoundError(`Data output not found ${dataOutputId}`);
  }
  const monitoringOutput = outputs.find((output) => output.id === monitoringOutputId);
  if (!monitoringOutput) {
    throw new OutputNotFoundError(`Monitoring output not found ${monitoringOutputId}`);
  }

  const downloadSourceProxyIds = uniq(
    downloadSources
      .map((ds) => ds.proxy_id)
      .filter((proxyId): proxyId is string => typeof proxyId !== 'undefined' && proxyId !== null)
  );

  const proxyIds = uniq(
    outputs
      .flatMap((output) => (isBeatsOutput(output) ? output.proxy_id : undefined))
      .filter((proxyId): proxyId is string => typeof proxyId !== 'undefined' && proxyId !== null)
      .concat(fleetServerHosts?.proxy_id ? [fleetServerHosts.proxy_id] : [])
      .concat(downloadSourceProxyIds)
  );

  logger.debug(`fetching list of fleet-server proxies`);
  const proxies = proxyIds.length ? await bulkGetFleetProxies(soClient, proxyIds) : [];

  // Use the proxy of the primary (first) download source for SSL/auth config
  const primarySource: DownloadSource = downloadSources[0];
  let downloadSourceProxy: FleetProxy | undefined;
  if (primarySource?.proxy_id) {
    downloadSourceProxy = proxies.find((proxy) => proxy.id === primarySource.proxy_id);
  }

  logger.debug(`Returning related saved objects for policy [${agentPolicy.id}]`);

  return {
    outputs,
    proxies,
    dataOutput,
    monitoringOutput,
    downloadSources,
    downloadSourceProxy,
    fleetServerHost: fleetServerHosts,
  };
}
