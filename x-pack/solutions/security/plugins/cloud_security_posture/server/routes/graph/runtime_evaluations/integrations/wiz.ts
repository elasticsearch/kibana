/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
 

import type { IntegrationEvaluations } from "../types";

export const wizEvaluations = {
  integration: "wiz",
  evaluations: [
    {
      id: "detection_flags",
      section: "Detection flags (mandatory \u2014 run first)",
      esql: `| EVAL
  actor_exists = (
      user.id IS NOT NULL OR user.name IS NOT NULL OR user.email IS NOT NULL
      OR host.id IS NOT NULL OR host.ip IS NOT NULL OR host.name IS NOT NULL
      OR service.id IS NOT NULL OR service.name IS NOT NULL
      OR entity.id IS NOT NULL OR entity.name IS NOT NULL
    )
    AND NOT (
      data_stream.dataset IN ("wiz.cloud_configuration_finding", "wiz.cloud_configuration_finding_full_posture")
      AND resource.type == "USER_ACCOUNT"
    ),
  target_exists = user.target.id IS NOT NULL OR user.target.name IS NOT NULL OR user.target.email IS NOT NULL
    OR host.target.id IS NOT NULL OR host.target.ip IS NOT NULL OR host.target.name IS NOT NULL
    OR service.target.id IS NOT NULL OR service.target.name IS NOT NULL
    OR entity.target.id IS NOT NULL OR entity.target.name IS NOT NULL,
  action_exists = event.action IS NOT NULL`,
    },
    {
      id: "actor",
      section: "Combined ES|QL \u2014 actor fields",
      esql: `| EVAL
  user.id = CASE(
    user.id IS NOT NULL, user.id,
    data_stream.dataset == "wiz.audit" AND wiz.audit.service_account.id IS NOT NULL, wiz.audit.service_account.id,
    null
  ),
  user.name = CASE(
    user.name IS NOT NULL, user.name,
    data_stream.dataset == "wiz.audit" AND wiz.audit.service_account.name IS NOT NULL, wiz.audit.service_account.name,
    null
  ),
  host.ip = CASE(
    host.ip IS NOT NULL, host.ip,
    data_stream.dataset == "wiz.audit" AND source.ip IS NOT NULL, source.ip,
    null
  ),
  service.name = CASE(
    service.name IS NOT NULL, service.name,
    data_stream.dataset IN ("wiz.vulnerability", "wiz.cloud_configuration_finding", "wiz.cloud_configuration_finding_full_posture"), "Wiz",
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "wiz.audit" AND event.action IN ("user-login", "login"), "Wiz",
    data_stream.dataset IN ("wiz.cloud_configuration_finding", "wiz.cloud_configuration_finding_full_posture") AND cloud.service.name IS NOT NULL, cloud.service.name,
    null
  ),
  entity.target.id = CASE(
    entity.target.id IS NOT NULL, entity.target.id,
    data_stream.dataset == "wiz.defend" AND wiz.defend.primary_resource.id IS NOT NULL, wiz.defend.primary_resource.id,
    data_stream.dataset == "wiz.issue" AND wiz.issue.entity_snapshot.id IS NOT NULL, wiz.issue.entity_snapshot.id,
    data_stream.dataset == "wiz.vulnerability" AND resource.id IS NOT NULL, resource.id,
    null
  ),
  entity.target.name = CASE(
    entity.target.name IS NOT NULL, entity.target.name,
    data_stream.dataset == "wiz.defend" AND wiz.defend.primary_resource.name IS NOT NULL, wiz.defend.primary_resource.name,
    data_stream.dataset == "wiz.issue" AND wiz.issue.entity_snapshot.name IS NOT NULL, wiz.issue.entity_snapshot.name,
    data_stream.dataset == "wiz.vulnerability" AND resource.name IS NOT NULL, resource.name,
    null
  ),
  entity.target.sub_type = CASE(
    entity.target.sub_type IS NOT NULL, entity.target.sub_type,
    data_stream.dataset == "wiz.defend" AND wiz.defend.primary_resource.type IS NOT NULL, wiz.defend.primary_resource.type,
    data_stream.dataset == "wiz.issue" AND wiz.issue.entity_snapshot.native_type IS NOT NULL, wiz.issue.entity_snapshot.native_type,
    null
  ),
  host.target.id = CASE(
    host.target.id IS NOT NULL, host.target.id,
    data_stream.dataset == "wiz.vulnerability" AND device.id IS NOT NULL, device.id,
    data_stream.dataset IN ("wiz.cloud_configuration_finding", "wiz.cloud_configuration_finding_full_posture") AND resource.type IN ("POD", "VIRTUAL_MACHINE") AND resource.id IS NOT NULL, resource.id,
    null
  ),
  host.target.name = CASE(
    host.target.name IS NOT NULL, host.target.name,
    data_stream.dataset == "wiz.vulnerability" AND host.name IS NOT NULL, host.name,
    data_stream.dataset IN ("wiz.cloud_configuration_finding", "wiz.cloud_configuration_finding_full_posture") AND resource.type == "POD" AND resource.name IS NOT NULL, resource.name,
    data_stream.dataset IN ("wiz.cloud_configuration_finding", "wiz.cloud_configuration_finding_full_posture") AND resource.type == "VIRTUAL_MACHINE" AND host.name IS NOT NULL, host.name,
    null
  ),
  host.target.ip = CASE(
    host.target.ip IS NOT NULL, host.target.ip,
    data_stream.dataset == "wiz.defend" AND destination.ip IS NOT NULL, destination.ip,
    null
  ),
  user.target.id = CASE(
    user.target.id IS NOT NULL, user.target.id,
    data_stream.dataset IN ("wiz.cloud_configuration_finding", "wiz.cloud_configuration_finding_full_posture") AND resource.type == "USER_ACCOUNT" AND user.id IS NOT NULL, user.id,
    null
  ),
  user.target.name = CASE(
    user.target.name IS NOT NULL, user.target.name,
    data_stream.dataset IN ("wiz.cloud_configuration_finding", "wiz.cloud_configuration_finding_full_posture") AND resource.type == "USER_ACCOUNT" AND user.name IS NOT NULL, user.name,
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
