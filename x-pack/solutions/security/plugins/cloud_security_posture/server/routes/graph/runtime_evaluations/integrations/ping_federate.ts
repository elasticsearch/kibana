/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/naming-convention */

import type { IntegrationEvaluations } from "../types";

export const ping_federateEvaluations = {
  integration: "ping_federate",
  evaluations: [
    {
      id: "detection_flags",
      section: "Detection flags (mandatory \u2014 run first)",
      esql: `| EVAL
  actor_exists = user.id IS NOT NULL OR user.name IS NOT NULL OR user.email IS NOT NULL
    OR host.id IS NOT NULL OR host.ip IS NOT NULL OR host.name IS NOT NULL
    OR service.id IS NOT NULL OR service.name IS NOT NULL
    OR entity.id IS NOT NULL OR entity.name IS NOT NULL,
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
  host.ip = CASE(
    host.ip IS NOT NULL, host.ip,
    data_stream.dataset IN ("ping_federate.admin", "ping_federate.audit") AND source.ip IS NOT NULL, source.ip,
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  entity.target.name = CASE(
    entity.target.name IS NOT NULL, entity.target.name,
    data_stream.dataset == "ping_federate.admin" AND ping_federate.admin.component IS NOT NULL, ping_federate.admin.component,
    null
  ),
  entity.target.id = CASE(
    entity.target.id IS NOT NULL, entity.target.id,
    data_stream.dataset == "ping_federate.audit" AND ping_federate.audit.connection_id IS NOT NULL, ping_federate.audit.connection_id,
    null
  ),
  entity.target.type = CASE(
    entity.target.type IS NOT NULL, entity.target.type,
    data_stream.dataset == "ping_federate.admin", "general",
    data_stream.dataset == "ping_federate.audit" AND ping_federate.audit.local_user_id IS NOT NULL, "user",
    data_stream.dataset == "ping_federate.audit" AND url.full IS NOT NULL, "general",
    data_stream.dataset == "ping_federate.audit", "service",
    null
  ),
  entity.target.sub_type = CASE(
    entity.target.sub_type IS NOT NULL, entity.target.sub_type,
    data_stream.dataset == "ping_federate.admin", "configuration-component",
    null
  ),
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "ping_federate.audit" AND url.full IS NOT NULL, url.full,
    data_stream.dataset == "ping_federate.audit" AND url.full IS NULL AND ping_federate.audit.connection_id IS NULL, "PingFederate",
    null
  ),
  user.target.id = CASE(
    user.target.id IS NOT NULL, user.target.id,
    data_stream.dataset == "ping_federate.audit" AND ping_federate.audit.local_user_id IS NOT NULL, ping_federate.audit.local_user_id,
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
