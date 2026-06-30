/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/naming-convention */

import type { IntegrationEvaluations } from "../types";

export const ping_oneEvaluations = {
  integration: "ping_one",
  evaluations: [
    {
      id: "detection_flags",
      section: "Detection flags (mandatory \u2014 run first)",
      esql: `| EVAL
  actor_exists = user.id IS NOT NULL OR user.name IS NOT NULL OR user.email IS NOT NULL
    OR host.ip IS NOT NULL,
  target_exists = user.target.id IS NOT NULL OR user.target.name IS NOT NULL OR user.target.email IS NOT NULL
    OR host.target.id IS NOT NULL OR host.target.ip IS NOT NULL OR host.target.name IS NOT NULL
    OR service.target.id IS NOT NULL OR service.target.name IS NOT NULL
    OR entity.target.id IS NOT NULL OR entity.target.name IS NOT NULL,
  action_exists = event.action IS NOT NULL`,
    },
    {
      id: "optional_classification",
      section: "Optional classification helpers (when needed)",
      esql: `| EVAL
  entity.target.type = CASE(
    entity.target.type IS NOT NULL, entity.target.type,
    data_stream.dataset == "ping_one.audit" AND event.action == "user.access_allowed", "service",
    data_stream.dataset == "ping_one.audit" AND event.action IN ("user.created", "user.updated", "user.deleted", "password.check_failed", "password.check_succeeded", "password.set", "password.reset", "role_assignment.created"), "user",
    data_stream.dataset == "ping_one.audit" AND STARTS_WITH(event.action, "application."), "general",
    null
  )`,
    },
    {
      id: "actor",
      section: "Combined ES|QL \u2014 actor fields",
      esql: `| EVAL
  entity.id = CASE(
    entity.id IS NOT NULL, entity.id,
    data_stream.dataset == "ping_one.audit" AND client.user.id IS NOT NULL, client.user.id,
    null
  ),
  entity.name = CASE(
    entity.name IS NOT NULL, entity.name,
    data_stream.dataset == "ping_one.audit" AND client.user.name IS NOT NULL, client.user.name,
    null
  ),
  entity.type = CASE(
    entity.type IS NOT NULL, entity.type,
    data_stream.dataset == "ping_one.audit" AND client.user.id IS NOT NULL, "application",
    null
  ),
  entity.sub_type = CASE(
    entity.sub_type IS NOT NULL, entity.sub_type,
    data_stream.dataset == "ping_one.audit" AND client.user.id IS NOT NULL, "pingone_application",
    null
  ),
  host.ip = CASE(
    host.ip IS NOT NULL, host.ip,
    data_stream.dataset == "ping_one.audit" AND source.ip IS NOT NULL, source.ip,
    null
  )`,
    },
    {
      id: "event_action",
      section: "Combined ES|QL \u2014 event action",
      esql: `| EVAL
  event.action = CASE(
    event.action IS NOT NULL, event.action,
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  service.target.id = CASE(
    service.target.id IS NOT NULL, service.target.id,
    data_stream.dataset == "ping_one.audit" AND event.action == "user.access_allowed" AND client.user.id IS NOT NULL, client.user.id,
    null
  ),
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "ping_one.audit" AND event.action == "user.access_allowed" AND client.user.name IS NOT NULL, client.user.name,
    null
  ),
  service.target.type = CASE(
    service.target.type IS NOT NULL, service.target.type,
    data_stream.dataset == "ping_one.audit" AND event.action == "user.access_allowed", "pingone_application",
    null
  ),
  user.target.id = CASE(
    user.target.id IS NOT NULL, user.target.id,
    data_stream.dataset == "ping_one.audit" AND event.action IN ("user.created", "user.updated", "user.deleted", "password.check_failed", "password.check_succeeded", "password.set", "password.reset", "role_assignment.created") AND event.action != "user.access_allowed" AND ping_one.audit.resources.id IS NOT NULL, ping_one.audit.resources.id,
    null
  ),
  user.target.name = CASE(
    user.target.name IS NOT NULL, user.target.name,
    data_stream.dataset == "ping_one.audit" AND event.action IN ("user.created", "user.updated", "user.deleted", "password.check_failed", "password.check_succeeded", "password.set", "password.reset", "role_assignment.created") AND event.action != "user.access_allowed" AND ping_one.audit.resources.name IS NOT NULL, ping_one.audit.resources.name,
    null
  ),
  entity.target.id = CASE(
    entity.target.id IS NOT NULL, entity.target.id,
    data_stream.dataset == "ping_one.audit" AND STARTS_WITH(event.action, "application.") AND event.action != "user.access_allowed" AND ping_one.audit.resources.id IS NOT NULL, ping_one.audit.resources.id,
    null
  ),
  entity.target.name = CASE(
    entity.target.name IS NOT NULL, entity.target.name,
    data_stream.dataset == "ping_one.audit" AND STARTS_WITH(event.action, "application.") AND event.action != "user.access_allowed" AND ping_one.audit.resources.name IS NOT NULL, ping_one.audit.resources.name,
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
