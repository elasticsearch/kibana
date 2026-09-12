/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HostInfo, HostMetadata } from '../../types';

export const isPolicyOutOfDate = (
  reported: HostMetadata['Endpoint']['policy']['applied'],
  current: HostInfo['policy_info']
): boolean => {
  if (!current || !reported.id) {
    return false; // we don't know, can't declare it out-of-date
  }
  return !(
    reported.id === current.endpoint.id && // endpoint package policy not reassigned
    current.agent.configured.id === current.agent.applied.id && // agent policy wasn't reassigned and not-yet-applied
    // all revisions match up
    reported.version >= current.agent.applied.revision &&
    reported.version >= current.agent.configured.revision &&
    reported.endpoint_policy_version >= current.endpoint.revision
  );
};
