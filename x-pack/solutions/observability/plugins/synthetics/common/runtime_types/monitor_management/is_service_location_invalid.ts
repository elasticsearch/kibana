/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MonitorServiceLocation } from './locations';
import { MonitorServiceLocationCodec } from '../zod/locations';

/** True when `location` fails the zod `MonitorServiceLocationCodec`. */
export const isServiceLocationInvalid = (location: MonitorServiceLocation) =>
  !MonitorServiceLocationCodec.safeParse(location).success;
