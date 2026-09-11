/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { MonitorTypeEnum } from '../runtime_types';

/** API Journey monitors can only run on private locations. */
export const monitorTypeRequiresPrivateLocations = (type?: string): boolean =>
  type === MonitorTypeEnum.API;

export const hasPublicServiceLocation = (
  locations?: Array<{ isServiceManaged?: boolean }>
): boolean => Boolean(locations?.some((location) => location.isServiceManaged));
