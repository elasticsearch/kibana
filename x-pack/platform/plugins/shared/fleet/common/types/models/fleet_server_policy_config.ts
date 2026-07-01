/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { ValueOf } from '..';

import type { SOSecret } from './secret';

export const clientAuth = {
  Optional: 'optional',
  Required: 'required',
  None: 'none',
} as const;

export type ClientAuth = typeof clientAuth;
export interface NewFleetServerHost {
  name: string;
  host_urls: string[];
  is_default: boolean;
  is_preconfigured: boolean;
  is_internal?: boolean;
  /** Fields that are allowed to be changed at runtime, bypassing the preconfiguration guard. */
  allow_edit?: string[];
  proxy_id?: string | null;
  ssl?: {
    certificate_authorities?: string[];
    certificate?: string;
    key?: string;
    es_certificate_authorities?: string[];
    es_certificate?: string;
    es_key?: string;
    client_auth?: ValueOf<ClientAuth>;
    agent_certificate_authorities?: string[];
    agent_certificate?: string;
    agent_key?: string;
  } | null;
  secrets?: {
    ssl?: {
      key?: SOSecret;
      es_key?: SOSecret;
      agent_key?: SOSecret;
    };
  };
}

export interface FleetServerHost extends NewFleetServerHost {
  id: string;
}
