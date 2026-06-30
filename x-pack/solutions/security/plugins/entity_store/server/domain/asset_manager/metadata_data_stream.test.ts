/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getMetadataEntitiesDataStreamName } from './metadata_data_stream';

describe('getMetadataEntitiesDataStreamName', () => {
  it('returns the v2 metadata datastream name for the default namespace', () => {
    expect(getMetadataEntitiesDataStreamName('default')).toBe(
      '.entities.v2.metadata.security_default'
    );
  });

  it('returns the v2 metadata datastream name for a custom namespace', () => {
    expect(getMetadataEntitiesDataStreamName('my-space')).toBe(
      '.entities.v2.metadata.security_my-space'
    );
  });
});
