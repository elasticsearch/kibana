/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IKibanaResponse, KibanaRequest, KibanaResponseFactory } from '@kbn/core/server';
import type { CheckPrivilegesResponse } from '@kbn/security-plugin-types-server';
import type { AssetManagerClient } from '../../../domain/asset_manager/asset_manager_client';

export function getMissingPrivileges({
  privileges: { kibana, elasticsearch },
}: CheckPrivilegesResponse) {
  const unauthorized = (p: { authorized: boolean }) => !p.authorized;
  const toPrivilege = (p: { privilege: string }) => p.privilege;

  return {
    missing_kibana_privileges: kibana.filter(unauthorized).map(toPrivilege),
    missing_elasticsearch_privileges: {
      cluster: elasticsearch.cluster.filter(unauthorized).map(toPrivilege),
      index: Object.entries(elasticsearch.index).reduce<
        Array<{ index: string; privileges: string[] }>
      >((acc, [index, p]) => {
        const missing = p.filter(unauthorized).map(toPrivilege);
        if (missing.length) acc.push({ index, privileges: missing });
        return acc;
      }, []),
    },
  };
}

export async function enforceEntityStorePrivileges(
  assetManager: AssetManagerClient,
  req: KibanaRequest,
  res: KibanaResponseFactory,
  additionalIndexPatterns?: string[]
): Promise<IKibanaResponse | null> {
  const privileges = await assetManager.getPrivileges(req, additionalIndexPatterns);
  if (!privileges.hasAllRequested) {
    return res.forbidden({
      body: {
        attributes: getMissingPrivileges(privileges),
        message: `User '${privileges.username}' has insufficient privileges`,
      },
    });
  }
  return null;
}
