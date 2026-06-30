/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
 

import type { IntegrationEvaluations } from "../types";

export const greenhouseEvaluations = {
  integration: "greenhouse",
  evaluations: [
    {
      id: "detection_flags",
      section: "Detection flags (mandatory \u2014 run first)",
      esql: `| EVAL
  actor_exists = user.id IS NOT NULL OR user.email IS NOT NULL OR user.full_name IS NOT NULL
    OR host.ip IS NOT NULL,
  target_exists = user.target.id IS NOT NULL OR user.target.name IS NOT NULL OR user.target.email IS NOT NULL
    OR host.target.id IS NOT NULL OR host.target.ip IS NOT NULL OR host.target.name IS NOT NULL
    OR service.target.id IS NOT NULL OR service.target.name IS NOT NULL
    OR entity.target.id IS NOT NULL OR entity.target.name IS NOT NULL OR entity.target.type IS NOT NULL,
  action_exists = event.action IS NOT NULL`,
    },
    {
      id: "actor",
      section: "Combined ES|QL \u2014 actor fields",
      esql: `| EVAL
  user.name = CASE(
    user.name IS NOT NULL, user.name,
    data_stream.dataset == "greenhouse.audit" AND greenhouse.audit.performer.type == "user", user.full_name,
    null
  ),
  host.ip = CASE(
    host.ip IS NOT NULL, host.ip,
    data_stream.dataset == "greenhouse.audit" AND source.ip IS NOT NULL, source.ip,
    null
  )`,
    },
    {
      id: "event_action",
      section: "Combined ES|QL \u2014 event action",
      esql: `| EVAL
  event.action = CASE(
    event.action IS NOT NULL, event.action,
    data_stream.dataset == "greenhouse.audit" AND greenhouse.audit.event.type IS NOT NULL, greenhouse.audit.event.type,
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  user.target.id = CASE(
    user.target.id IS NOT NULL, user.target.id,
    data_stream.dataset == "greenhouse.audit" AND greenhouse.audit.event.target_type == "User", greenhouse.audit.event.target_id,
    null
  ),
  entity.target.id = CASE(
    entity.target.id IS NOT NULL, entity.target.id,
    data_stream.dataset == "greenhouse.audit" AND greenhouse.audit.event.target_id IS NOT NULL AND greenhouse.audit.event.target_type != "User", greenhouse.audit.event.target_id,
    null
  ),
  entity.target.type = CASE(
    entity.target.type IS NOT NULL, entity.target.type,
    data_stream.dataset == "greenhouse.audit" AND greenhouse.audit.event.target_type IS NOT NULL, greenhouse.audit.event.target_type,
    null
  ),
  entity.target.name = CASE(
    entity.target.name IS NOT NULL, entity.target.name,
    data_stream.dataset == "greenhouse.audit" AND greenhouse.audit.event.meta.name IS NOT NULL, TO_STRING(greenhouse.audit.event.meta.name),
    data_stream.dataset == "greenhouse.audit" AND greenhouse.audit.event.target_type IS NOT NULL AND greenhouse.audit.event.target_id IS NULL, greenhouse.audit.event.target_type,
    null
  ),
  entity.target.sub_type = CASE(
    entity.target.sub_type IS NOT NULL, entity.target.sub_type,
    data_stream.dataset == "greenhouse.audit" AND greenhouse.audit.event.target_type == "Candidate", "candidate",
    data_stream.dataset == "greenhouse.audit" AND greenhouse.audit.event.target_type == "Job", "job",
    data_stream.dataset == "greenhouse.audit" AND greenhouse.audit.event.target_type == "OrganizationEmail", "organization_email",
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
