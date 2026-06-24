/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SerializableRecord } from '@kbn/utility-types';

export interface StreamsAppLocationParams extends SerializableRecord {
  name?: string;
  managementTab?:
    | 'retention'
    | 'partitioning'
    | 'processing'
    | 'significantEvents'
    | 'canvas'
    | string;
}

export interface StreamsAppLocation {
  app: 'streams';
  path: string;
}

export const getStreamsLocation = (params: StreamsAppLocationParams): StreamsAppLocation => {
  if (!params.name) {
    return {
      app: 'streams',
      path: '/',
    };
  }

  if (!params.managementTab) {
    return {
      app: 'streams',
      path: `/${params.name}`,
    };
  }

  return {
    app: 'streams',
    path: `/${params.name}/management/${params.managementTab}`,
  };
};
