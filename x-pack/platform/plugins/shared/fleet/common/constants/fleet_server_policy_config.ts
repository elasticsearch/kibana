/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const FLEET_SERVER_HOST_SAVED_OBJECT_TYPE = 'fleet-fleet-server-host';

export const DEFAULT_FLEET_SERVER_HOST_ID = 'fleet-default-fleet-server-host';

export const FLEET_PROXY_SAVED_OBJECT_TYPE = 'fleet-proxy';

export const PROXY_URL_REGEX = /^(http[s]?|socks5):\/\/[^\s$.?#].[^\s]*$/gm;

export const SERVERLESS_DEFAULT_FLEET_SERVER_HOST_ID = 'default-fleet-server';

// Fleet Server IDs used for agentless policies:
//  - For ECH, this is created by Fleet, see `createCloudFleetServerHostsIfNeeded` in:
//    `x-pack/platform/plugins/shared/fleet/server/services/preconfiguration/fleet_server_host.ts`
//  - For Serverless, this is the `fleet-server-internal` host that is created from
//    preconfiguration via project controller with internal cluster URLs
//  - Both are uneditable by users due to having `is_preconfigured: true` set
export const ECH_AGENTLESS_FLEET_SERVER_HOST_ID = 'internal-agentless-fleet-server';
export const SERVERLESS_AGENTLESS_FLEET_SERVER_HOST_ID = 'default-fleet-server-internal';

// Fleet Server host ID for the private endpoint (PrivateLink) in serverless.
// Injected by project-controller/kibana-controller when PrivateLink is enabled.
export const SERVERLESS_PRIVATE_FLEET_SERVER_HOST_ID = 'private-fleet-server';
