/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRole } from '@kbn/scout';

/**
 * Role combining security alert index privileges with full Kibana access.
 * Used by tests that need both alert visibility and Kibana-level features
 * (e.g. agent builder, workflow management).
 *
 * The Security alerts page checks for all four privileges (read, write,
 * view_index_metadata, manage) and shows an "Insufficient privileges"
 * callout if any are missing, preventing the alerts table from rendering.
 */
export const FULL_KIBANA_SECURITY_ROLE: KibanaRole = {
  elasticsearch: {
    cluster: ['manage'],
    indices: [
      {
        names: [
          '.alerts-security*',
          '.internal.alerts-security*',
          '.siem-signals-*',
          'apm-*-transaction*',
          'traces-apm*',
          'auditbeat-*',
          'endgame-*',
          'filebeat-*',
          'logs-*',
          'packetbeat-*',
          'winlogbeat-*',
          'logstash-*',
          '.lists*',
          '.items*',
        ],
        privileges: ['read', 'write', 'view_index_metadata', 'manage'],
      },
    ],
  },
  kibana: [
    {
      base: ['all'],
      feature: {},
      spaces: ['*'],
    },
  ],
};
