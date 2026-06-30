/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
 

import type { IntegrationEvaluations } from "../types";

export const taniumEvaluations = {
  integration: "tanium",
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
  user.name = CASE(
    user.name IS NOT NULL, user.name,
    data_stream.dataset == "tanium.action_history", tanium.action_history.issuer,
    null
  )`,
    },
    {
      id: "event_action",
      section: "Combined ES|QL \u2014 event action",
      esql: `| EVAL
  event.action = CASE(
    event.action IS NOT NULL, event.action,
    data_stream.dataset == "tanium.threat_response" AND tanium.threat_response.event.name IS NOT NULL AND tanium.threat_response.table IS NULL, tanium.threat_response.event.name,
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  entity.target.id = CASE(
    entity.target.id IS NOT NULL, entity.target.id,
    data_stream.dataset == "tanium.action_history", TO_STRING(tanium.action_history.action.id),
    data_stream.dataset == "tanium.endpoint_config", TO_STRING(tanium.endpoint_config.item.id),
    data_stream.dataset == "tanium.threat_response" AND tanium.threat_response.state.target.eid IS NOT NULL, tanium.threat_response.state.target.eid,
    null
  ),
  entity.target.name = CASE(
    entity.target.name IS NOT NULL, entity.target.name,
    data_stream.dataset == "tanium.action_history", tanium.action_history.action.name,
    null
  ),
  entity.target.type = CASE(
    entity.target.type IS NOT NULL, entity.target.type,
    data_stream.dataset == "tanium.action_history", "tanium-action",
    data_stream.dataset == "tanium.endpoint_config", tanium.endpoint_config.item.domain,
    null
  ),
  entity.target.sub_type = CASE(
    entity.target.sub_type IS NOT NULL, entity.target.sub_type,
    data_stream.dataset == "tanium.endpoint_config", tanium.endpoint_config.item.data_category,
    null
  ),
  host.target.name = CASE(
    host.target.name IS NOT NULL, host.target.name,
    data_stream.dataset == "tanium.threat_response" AND tanium.threat_response.state.target.hostname IS NOT NULL, tanium.threat_response.state.target.hostname,
    data_stream.dataset == "tanium.threat_response" AND tanium.threat_response.event.name IS NOT NULL AND tanium.threat_response.state.target.hostname IS NULL, host.name,
    null
  ),
  host.target.ip = CASE(
    host.target.ip IS NOT NULL, host.target.ip,
    data_stream.dataset == "tanium.threat_response" AND source.ip IS NOT NULL, source.ip,
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
