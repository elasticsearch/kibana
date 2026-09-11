/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { z } from '@kbn/zod';
import type {
  SavedObjectModelTransformationFn,
  SavedObjectsModelVersion,
} from '@kbn/core-saved-objects-server';
import type { SyntheticsPrivateLocationsAttributes } from '../../../runtime_types/private_locations';

export const PrivateLocationAttributesCodecLegacy = z.looseObject({
  label: z.string(),
  id: z.string(),
  agentPolicyId: z.string(),
  concurrentMonitors: z.number(),
  tags: z.array(z.string()).optional(),
  /* Empty Lat lon was accidentally saved as an empty string instead of undefined or null
   * Need a migration to fix */
  geo: z
    .looseObject({
      lat: z.union([z.string(), z.number()]),
      lon: z.union([z.string(), z.number()]),
    })
    .optional(),
});
export const SyntheticsPrivateLocationsAttributesCodecLegacy = z.looseObject({
  locations: z.array(PrivateLocationAttributesCodecLegacy),
});
export type SyntheticsPrivateLocationsAttributesLegacy = z.infer<
  typeof SyntheticsPrivateLocationsAttributesCodecLegacy
>;

export const transformGeoProperty: SavedObjectModelTransformationFn<
  SyntheticsPrivateLocationsAttributesLegacy,
  SyntheticsPrivateLocationsAttributes
> = (privateLocationDoc) => {
  const { locations } = privateLocationDoc.attributes;
  return {
    document: {
      ...privateLocationDoc,
      attributes: {
        locations: locations.map((location) => ({
          ...location,
          geo: {
            lat: Number(location.geo?.lat ?? 0),
            lon: Number(location.geo?.lon ?? 0),
          },
          isServiceManaged: false,
        })),
      },
    },
  };
};

export const modelVersion1: SavedObjectsModelVersion = {
  changes: [
    {
      type: 'unsafe_transform',
      transformFn: (typeSafeGuard) => typeSafeGuard(transformGeoProperty),
    },
  ],
};
