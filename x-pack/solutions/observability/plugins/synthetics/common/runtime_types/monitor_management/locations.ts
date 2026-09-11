/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as t from 'io-ts';
import { tEnum } from '../../utils/t_enum';

export enum LocationStatus {
  GA = 'ga',
  BETA = 'beta',
  EXPERIMENTAL = 'experimental',
}

export enum BandwidthLimitKey {
  DOWNLOAD = 'download',
  UPLOAD = 'upload',
}

export const DEFAULT_BANDWIDTH_LIMIT = {
  [BandwidthLimitKey.DOWNLOAD]: 100,
  [BandwidthLimitKey.UPLOAD]: 30,
};

export const DEFAULT_THROTTLING = {
  [BandwidthLimitKey.DOWNLOAD]: DEFAULT_BANDWIDTH_LIMIT[BandwidthLimitKey.DOWNLOAD],
  [BandwidthLimitKey.UPLOAD]: DEFAULT_BANDWIDTH_LIMIT[BandwidthLimitKey.UPLOAD],
};

export const BandwidthLimitKeyCodec = tEnum<BandwidthLimitKey>(
  'BandwidthLimitKey',
  BandwidthLimitKey
);

export type BandwidthLimitKeyType = t.TypeOf<typeof BandwidthLimitKeyCodec>;

export const LocationGeoCodec = t.interface({
  lat: t.union([t.string, t.number, t.null]),
  lon: t.union([t.string, t.number, t.null]),
});

export const LocationStatusCodec = tEnum<LocationStatus>('LocationStatus', LocationStatus);
export type LocationStatusType = t.TypeOf<typeof LocationStatusCodec>;

export const ManifestLocationCodec = t.interface({
  url: t.string,
  geo: t.interface({
    name: t.string,
    location: LocationGeoCodec,
  }),
  status: LocationStatusCodec,
});

export const ServiceLocationCodec = t.intersection([
  t.interface({
    id: t.string,
    label: t.string,
    isServiceManaged: t.boolean,
  }),
  t.partial({
    url: t.string,
    geo: LocationGeoCodec,
    status: LocationStatusCodec,
    isInvalid: t.boolean,
  }),
]);

export const PublicLocationCodec = t.intersection([
  ServiceLocationCodec,
  t.interface({ url: t.string }),
]);

export const PublicLocationsCodec = t.array(PublicLocationCodec);

export const MonitorServiceLocationCodec = t.intersection([
  t.interface({
    id: t.string,
    label: t.string,
  }),
  t.partial({
    geo: LocationGeoCodec,
    url: t.string,
    isServiceManaged: t.boolean,
    status: t.string,
  }),
]);

export const ServiceLocationErrors = t.array(
  t.interface({
    locationId: t.string,
    error: t.intersection([
      t.interface({
        reason: t.string,
        status: t.number,
      }),
      t.partial({
        failed_monitors: t.union([
          t.array(
            t.interface({
              id: t.string,
              message: t.string,
            })
          ),
          t.null,
        ]),
      }),
    ]),
  })
);

export const ServiceLocationsCodec = t.array(ServiceLocationCodec);
export const MonitorServiceLocationsCodec = t.array(MonitorServiceLocationCodec);

export const LocationCodec = t.intersection([
  ServiceLocationCodec,
  t.partial({ isServiceManaged: t.boolean }),
]);

export const LocationsCodec = t.array(LocationCodec);

export const ThrottlingOptionsCodec = t.interface({
  [BandwidthLimitKey.DOWNLOAD]: t.number,
  [BandwidthLimitKey.UPLOAD]: t.number,
});

export const ServiceLocationsApiResponseCodec = t.interface({
  throttling: t.union([ThrottlingOptionsCodec, t.undefined]),
  locations: ServiceLocationsCodec,
});
export type ServiceLocationsApiResponse = t.TypeOf<typeof ServiceLocationsApiResponseCodec>;

export type ManifestLocation = t.TypeOf<typeof ManifestLocationCodec>;
export type ServiceLocation = t.TypeOf<typeof ServiceLocationCodec>;
export type ServiceLocations = t.TypeOf<typeof ServiceLocationsCodec>;
export type MonitorServiceLocation = t.TypeOf<typeof MonitorServiceLocationCodec>;
export type ServiceLocationErrors = t.TypeOf<typeof ServiceLocationErrors>;
export type ThrottlingOptions = t.TypeOf<typeof ThrottlingOptionsCodec>;
export type Locations = t.TypeOf<typeof LocationsCodec>;
export type PublicLocation = t.TypeOf<typeof PublicLocationCodec>;
export type PublicLocations = t.TypeOf<typeof PublicLocationsCodec>;

export interface ServiceLocationErrorsResponse {
  attributes: { message: string; errors: ServiceLocationErrors; id?: string };
}

// TODO: Remove if not needed
// export type MonitorServiceLocations = t.TypeOf<typeof MonitorServiceLocationsCodec>;
// export type ServiceLocationsApiResponse = t.TypeOf<typeof ServiceLocationsApiResponseCodec>;
