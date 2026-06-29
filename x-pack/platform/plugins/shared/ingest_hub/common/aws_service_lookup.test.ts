/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AWS_SERVICES_MAP } from '../public/onboarding/aws_service_matrix';
import { AWS_SERVICE_LOOKUP } from './aws_service_lookup';

describe('AWS_SERVICE_LOOKUP', () => {
  it('contains every service id present in AWS_SERVICES_MAP', () => {
    // Every id in the browser-side matrix must have a server-side lookup entry so
    // the endpoint can resolve permissions for any service the UI can select.
    const matrixIds = [...AWS_SERVICES_MAP.keys()];
    const missingFromLookup = matrixIds.filter((id) => !(id in AWS_SERVICE_LOOKUP));

    expect(missingFromLookup).toEqual([]);
  });

  it('each entry has a non-empty packageName', () => {
    for (const [id, entry] of Object.entries(AWS_SERVICE_LOOKUP)) {
      expect(typeof entry.packageName).toBe('string');
      expect(entry.packageName.length).toBeGreaterThan(0);
      // Sanity check the id itself
      expect(id.length).toBeGreaterThan(0);
    }
  });
});
