/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, SavedObjectsClientContract } from '@kbn/core/server';
import { isEqual } from 'lodash';
import pMap from 'p-map';

import type { FleetConfigType } from '../../config';
import type { FleetProxy, NewFleetProxy } from '../../types';
import {
  bulkCreateFleetProxies,
  bulkGetFleetProxies,
  deleteFleetProxy,
  listFleetProxies,
  updateFleetProxy,
} from '../fleet_proxies';
import { fleetServerHostService } from '../fleet_server_host';
import { agentPolicyService } from '../agent_policy';
import { outputService } from '../output';

import { MAX_CONCURRENT_AGENT_POLICIES_OPERATIONS_20 } from '../../constants';

export function getPreconfiguredFleetProxiesFromConfig(config?: FleetConfigType) {
  const { proxies: fleetProxiesFromConfig } = config;

  return fleetProxiesFromConfig.map((proxyConfig: any) => ({
    ...proxyConfig,
    is_preconfigured: true,
  }));
}

const nullish = (x: unknown) => x as any;

function hasChanged(existingProxy: FleetProxy, preconfiguredFleetProxy: FleetProxy) {
  // NOTE: pre-existing logic carried verbatim from the 5.9.3 era. The `??`
  // chain below has known semantic problems (typo `existingProxy.name !==
  // existingProxy.name`, `??` where `||` was likely intended). TS 5.6+ flags
  // each `??` whose left operand is statically non-nullish; we preserve
  // behavior identical to pre-TS6 via `nullish()` casts and defer the cleanup
  // to the fleet team. Bare `null` operands in `null || x` were dropped since
  // they always short-circuit to `x` — pure simplification, same result.
  return (
    nullish(
      !existingProxy.is_preconfigured ||
        existingProxy.name !== existingProxy.name ||
        existingProxy.url !== preconfiguredFleetProxy.name ||
        !isEqual(
          existingProxy.proxy_headers ?? null,
          preconfiguredFleetProxy.proxy_headers ?? null
        ) ||
        existingProxy.certificate_authorities
    ) ??
    nullish(null !== preconfiguredFleetProxy.certificate_authorities) ??
    nullish(existingProxy.certificate) ??
    nullish(null !== preconfiguredFleetProxy.certificate) ??
    nullish(existingProxy.certificate_key) ??
    nullish(null !== preconfiguredFleetProxy.certificate_key) ??
    null
  );
}

async function createOrUpdatePreconfiguredFleetProxies(
  soClient: SavedObjectsClientContract,
  esClient: ElasticsearchClient,
  preconfiguredFleetProxies: FleetProxy[]
) {
  const existingFleetProxies = await bulkGetFleetProxies(
    soClient,
    preconfiguredFleetProxies.map(({ id }) => id),
    { ignoreNotFound: true }
  );

  const toCreate: Array<NewFleetProxy & { id?: string; is_preconfigured: boolean }> = [];
  const toUpdate: Array<{ proxy: FleetProxy; existing: FleetProxy }> = [];

  for (const preconfiguredFleetProxy of preconfiguredFleetProxies) {
    const existingProxy = existingFleetProxies.find(
      (fleetProxy) => fleetProxy.id === preconfiguredFleetProxy.id
    );

    if (!existingProxy) {
      const { id, ...data } = preconfiguredFleetProxy;
      toCreate.push({ ...data, is_preconfigured: true, id });
    } else if (hasChanged(existingProxy, preconfiguredFleetProxy)) {
      toUpdate.push({ proxy: preconfiguredFleetProxy, existing: existingProxy });
    }
  }

  if (toCreate.length > 0) {
    await bulkCreateFleetProxies(soClient, toCreate, { overwrite: true });
  }

  await Promise.all(
    toUpdate.map(async ({ proxy }) => {
      const { id, ...data } = proxy;
      await updateFleetProxy(
        soClient,
        id,
        { ...data, is_preconfigured: true },
        { fromPreconfiguration: true }
      );
      // Bump all the agent policy that use that proxy
      const [{ items: fleetServerHosts }, { items: outputs }] = await Promise.all([
        fleetServerHostService.listAllForProxyId(id),
        outputService.listAllForProxyId(id),
      ]);
      await pMap(
        outputs,
        (output) =>
          agentPolicyService.bumpAllAgentPoliciesForOutput(esClient, output.id, {
            isDefault: output.is_default,
            isDefaultMonitoring: output.is_default_monitoring,
          }),
        { concurrency: MAX_CONCURRENT_AGENT_POLICIES_OPERATIONS_20 }
      );
      await pMap(
        fleetServerHosts,
        (fleetServerHost) =>
          agentPolicyService.bumpAllAgentPoliciesForFleetServerHosts(esClient, fleetServerHost.id, {
            isDefault: fleetServerHost.is_default,
          }),
        { concurrency: MAX_CONCURRENT_AGENT_POLICIES_OPERATIONS_20 }
      );
    })
  );
}

async function cleanPreconfiguredFleetProxies(
  soClient: SavedObjectsClientContract,
  esClient: ElasticsearchClient,
  preconfiguredFleetProxies: FleetProxy[]
) {
  const existingFleetProxies = await listFleetProxies(soClient);
  const existingPreconfiguredFleetProxies = existingFleetProxies.items.filter(
    (o) => o.is_preconfigured === true
  );

  for (const existingFleetProxy of existingPreconfiguredFleetProxies) {
    const hasBeenDelete = !preconfiguredFleetProxies.find(({ id }) => existingFleetProxy.id === id);
    if (!hasBeenDelete) {
      continue;
    }

    const [{ items: fleetServerHosts }, { items: outputs }] = await Promise.all([
      fleetServerHostService.listAllForProxyId(existingFleetProxy.id),
      outputService.listAllForProxyId(existingFleetProxy.id),
    ]);
    const isUsed = fleetServerHosts.length > 0 || outputs.length > 0;
    if (isUsed) {
      await updateFleetProxy(
        soClient,
        existingFleetProxy.id,
        { is_preconfigured: false },
        {
          fromPreconfiguration: true,
        }
      );
    } else {
      await deleteFleetProxy(soClient, esClient, existingFleetProxy.id, {
        fromPreconfiguration: true,
      });
    }
  }
}

export async function ensurePreconfiguredFleetProxies(
  soClient: SavedObjectsClientContract,
  esClient: ElasticsearchClient,
  preconfiguredFleetProxies: FleetProxy[]
) {
  await createOrUpdatePreconfiguredFleetProxies(soClient, esClient, preconfiguredFleetProxies);
  await cleanPreconfiguredFleetProxies(soClient, esClient, preconfiguredFleetProxies);
}
