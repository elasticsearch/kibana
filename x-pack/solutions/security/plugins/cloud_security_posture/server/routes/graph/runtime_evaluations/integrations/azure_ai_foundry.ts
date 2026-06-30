/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/naming-convention */

import type { IntegrationEvaluations } from "../types";

export const azure_ai_foundryEvaluations = {
  integration: "azure_ai_foundry",
  evaluations: [
    {
      id: "detection_flags",
      section: "Detection flags (mandatory \u2014 run first)",
      esql: `| EVAL
  actor_exists = user.id IS NOT NULL OR user.name IS NOT NULL OR user.email IS NOT NULL
    OR host.id IS NOT NULL OR host.ip IS NOT NULL OR host.name IS NOT NULL
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
  user.id = CASE(
    user.id IS NOT NULL, user.id,
    data_stream.dataset == "azure.ai_foundry" AND data_stream.type == "logs" AND azure.ai_foundry.category == "Audit", azure.ai_foundry.properties.object_id,
    null
  ),
  host.ip = CASE(
    host.ip IS NOT NULL, host.ip,
    data_stream.dataset == "azure.ai_foundry" AND data_stream.type == "logs" AND azure.ai_foundry.category == "GatewayLogs", source.ip,
    data_stream.dataset == "azure.ai_foundry" AND data_stream.type == "logs" AND azure.ai_foundry.category == "RequestResponse", azure.ai_foundry.caller_ip_address,
    null
  )`,
    },
    {
      id: "event_action",
      section: "Combined ES|QL \u2014 event action",
      esql: `| EVAL
  event.action = CASE(
    event.action IS NOT NULL, event.action,
    data_stream.dataset == "azure.ai_foundry" AND data_stream.type == "logs" AND azure.ai_foundry.category == "Audit", azure.ai_foundry.operation_name,
    data_stream.dataset == "azure.ai_foundry" AND data_stream.type == "logs" AND azure.ai_foundry.category == "RequestResponse", azure.ai_foundry.operation_name,
    data_stream.dataset == "azure.ai_foundry" AND data_stream.type == "logs" AND azure.ai_foundry.category == "GatewayLogs", azure.ai_foundry.properties.operation_id,
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  service.target.id = CASE(
    service.target.id IS NOT NULL, service.target.id,
    data_stream.dataset == "azure.ai_foundry" AND data_stream.type == "logs" AND azure.ai_foundry.category == "Audit", azure.resource.id,
    data_stream.dataset == "azure.ai_foundry" AND data_stream.type == "logs" AND azure.ai_foundry.category == "RequestResponse", azure.ai_foundry.properties.model_deployment_name,
    data_stream.dataset == "azure.ai_foundry" AND data_stream.type == "logs" AND azure.ai_foundry.category == "GatewayLogs", azure.ai_foundry.properties.backend_request_body.model,
    null
  ),
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "azure.ai_foundry" AND data_stream.type == "logs" AND azure.ai_foundry.category == "Audit", azure.resource.name,
    data_stream.dataset == "azure.ai_foundry" AND data_stream.type == "logs" AND azure.ai_foundry.category == "RequestResponse", azure.ai_foundry.properties.model_deployment_name,
    data_stream.dataset == "azure.ai_foundry" AND data_stream.type == "logs" AND azure.ai_foundry.category == "GatewayLogs", azure.ai_foundry.properties.backend_request_body.model,
    null
  ),
  entity.target.id = CASE(
    entity.target.id IS NOT NULL, entity.target.id,
    data_stream.dataset == "azure.ai_foundry" AND data_stream.type == "logs" AND azure.ai_foundry.category == "GatewayLogs", azure.ai_foundry.properties.backend_response_body.id,
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
