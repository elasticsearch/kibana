/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObject } from '@kbn/core-saved-objects-common/src/server_types';

import type { AgentPolicy } from '../../../common';
import type { AgentPolicySOAttributes } from '../../types';

export const mapAgentPolicySavedObjectToAgentPolicy = ({
  id,
  namespaces,
  version,
  created_at,
  attributes,
}: SavedObject<AgentPolicySOAttributes>): AgentPolicy => {
  const {
    monitoring_enabled,
    agent_features,
    agents,
    data_output_id,
    description,
    download_source_id,
    download_source_ids,
    fleet_server_host_id,
    has_fleet_server,
    inactivity_timeout,
    is_default,
    is_default_fleet_server,
    is_preconfigured,
    monitoring_output_id,
    overrides,
    package_policies,
    schema_version,
    unenroll_timeout,
  } = attributes || {};

  return {
    id,
    version,
    created_at: created_at ?? undefined,
    space_ids: namespaces,
    description,
    is_default,
    is_default_fleet_server,
    has_fleet_server,
    monitoring_enabled,
    unenroll_timeout,
    inactivity_timeout,
    is_preconfigured,
    data_output_id,
    monitoring_output_id,
    download_source_id,
    download_source_ids,
    fleet_server_host_id,
    schema_version,
    agent_features,
    overrides,
    package_policies,
    agents,
    ...attributes,
  };
};
