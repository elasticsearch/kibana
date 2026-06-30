/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
 

import type { IntegrationEvaluations } from "../types";

export const forgerockEvaluations = {
  integration: "forgerock",
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
      id: "optional_classification",
      section: "Optional classification helpers (when needed)",
      esql: `| EVAL
  entity.type = CASE(
    entity.type IS NOT NULL, entity.type,
    data_stream.dataset IN ("forgerock.am_access", "forgerock.idm_access") AND user.id IS NULL AND client.ip IS NOT NULL, "host",
    data_stream.dataset IN ("forgerock.am_access", "forgerock.idm_access", "forgerock.am_authentication", "forgerock.idm_authentication", "forgerock.am_activity", "forgerock.am_config", "forgerock.idm_activity", "forgerock.idm_config", "forgerock.idm_sync"), "user",
    null
  ),
  entity.target.type = CASE(
    entity.target.type IS NOT NULL, entity.target.type,
    data_stream.dataset IN ("forgerock.am_access", "forgerock.am_authentication", "forgerock.am_activity") AND service.name IS NOT NULL, "service",
    data_stream.dataset == "forgerock.idm_authentication", "service",
    data_stream.dataset == "forgerock.idm_sync", "user",
    data_stream.dataset IN ("forgerock.am_activity", "forgerock.idm_activity") AND STARTS_WITH(forgerock.objectId, "managed/"), "user",
    data_stream.dataset IN ("forgerock.am_activity", "forgerock.am_config", "forgerock.idm_activity", "forgerock.idm_config"), "general",
    null
  ),
  entity.target.sub_type = CASE(
    entity.target.sub_type IS NOT NULL, entity.target.sub_type,
    data_stream.dataset IN ("forgerock.am_activity", "forgerock.idm_activity") AND STARTS_WITH(forgerock.objectId, "managed/"), "managed_object",
    null
  )`,
    },
    {
      id: "actor",
      section: "Combined ES|QL \u2014 actor fields",
      esql: `| EVAL
  user.name = CASE(
    user.name IS NOT NULL, user.name,
    data_stream.dataset IN ("forgerock.am_authentication", "forgerock.idm_authentication"), MV_FIRST(forgerock.principal),
    null
  ),
  host.ip = CASE(
    host.ip IS NOT NULL, host.ip,
    data_stream.dataset IN ("forgerock.am_access", "forgerock.idm_access") AND client.ip IS NOT NULL, client.ip,
    null
  )`,
    },
    {
      id: "event_action",
      section: "Combined ES|QL \u2014 event action",
      esql: `| EVAL
  event.action = CASE(
    event.action IS NOT NULL, event.action,
    data_stream.dataset == "forgerock.idm_sync" AND forgerock.action IS NOT NULL, forgerock.action,
    data_stream.dataset IN ("forgerock.idm_access", "forgerock.idm_authentication", "forgerock.idm_activity", "forgerock.idm_config", "forgerock.idm_sync") AND forgerock.eventName IS NOT NULL, forgerock.eventName,
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset IN ("forgerock.am_access", "forgerock.am_authentication", "forgerock.am_activity") AND service.name IS NOT NULL, service.name,
    data_stream.dataset == "forgerock.idm_authentication", "Identity Management",
    null
  ),
  user.target.id = CASE(
    user.target.id IS NOT NULL, user.target.id,
    data_stream.dataset == "forgerock.idm_sync" AND forgerock.sourceObjectId IS NOT NULL, forgerock.sourceObjectId,
    data_stream.dataset IN ("forgerock.am_activity", "forgerock.idm_activity") AND STARTS_WITH(forgerock.objectId, "managed/"), forgerock.objectId,
    data_stream.dataset == "forgerock.idm_sync" AND forgerock.targetObjectId IS NOT NULL, forgerock.targetObjectId,
    null
  ),
  entity.target.id = CASE(
    entity.target.id IS NOT NULL, entity.target.id,
    data_stream.dataset IN ("forgerock.am_activity", "forgerock.am_config", "forgerock.idm_activity", "forgerock.idm_config") AND forgerock.objectId IS NOT NULL AND NOT STARTS_WITH(forgerock.objectId, "managed/"), forgerock.objectId,
    data_stream.dataset IN ("forgerock.am_access", "forgerock.idm_access") AND http.request.Path IS NOT NULL, http.request.Path,
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
