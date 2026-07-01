/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { PluginConfigDescriptor } from '@kbn/core/server';
import type { TypeOf } from '@kbn/config-schema';

const configSchema = schema.object({
  enableFederatedIdentityAuth: schema.boolean({ defaultValue: false }),
  enableGoogleCloudStorageDataSourceType: schema.boolean({ defaultValue: false }),
  enableAzureDataSourceType: schema.boolean({ defaultValue: false }),
  workloadIdentityIssuerUrl: schema.maybe(schema.string()),
});

export type DataFederationConfigType = TypeOf<typeof configSchema>;

export const config: PluginConfigDescriptor<DataFederationConfigType> = {
  exposeToBrowser: {
    enableFederatedIdentityAuth: true,
    enableGoogleCloudStorageDataSourceType: true,
    enableAzureDataSourceType: true,
    workloadIdentityIssuerUrl: true,
  },
  schema: configSchema,
};
