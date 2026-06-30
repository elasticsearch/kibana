/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/naming-convention */

import type { IntegrationEvaluations } from "../types";

export const azure_openaiEvaluations = {
  integration: "azure_openai",
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
    data_stream.dataset == "azure.open_ai" AND azure.open_ai.category == "Audit", azure.open_ai.properties.object_id,
    null
  ),
  host.ip = CASE(
    host.ip IS NOT NULL, host.ip,
    data_stream.dataset == "azure.open_ai" AND azure.open_ai.category == "GatewayLogs", source.ip,
    data_stream.dataset == "azure.open_ai" AND azure.open_ai.category == "RequestResponse", azure.open_ai.caller_ip_address,
    null
  )`,
    },
    {
      id: "event_action",
      section: "Combined ES|QL \u2014 event action",
      esql: `| EVAL
  event.action = CASE(
    event.action IS NOT NULL, event.action,
    data_stream.dataset == "azure.open_ai" AND azure.open_ai.category IN ("Audit", "RequestResponse"), azure.open_ai.operation_name,
    data_stream.dataset == "azure.open_ai" AND azure.open_ai.category == "GatewayLogs", azure.open_ai.properties.operation_id,
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  service.target.id = CASE(
    service.target.id IS NOT NULL, service.target.id,
    data_stream.dataset == "azure.open_ai" AND azure.open_ai.category == "Audit", azure.resource.id,
    data_stream.dataset == "azure.open_ai" AND azure.open_ai.category == "RequestResponse", azure.open_ai.properties.model_deployment_name,
    data_stream.dataset == "azure.open_ai" AND azure.open_ai.category == "GatewayLogs", azure.open_ai.properties.backend_request_body.model,
    null
  ),
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "azure.open_ai" AND azure.open_ai.category == "Audit", azure.resource.name,
    data_stream.dataset == "azure.open_ai" AND azure.open_ai.category == "RequestResponse", azure.open_ai.properties.model_name,
    data_stream.dataset == "azure.open_ai" AND azure.open_ai.category == "GatewayLogs", azure.open_ai.properties.backend_response_body.model,
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
