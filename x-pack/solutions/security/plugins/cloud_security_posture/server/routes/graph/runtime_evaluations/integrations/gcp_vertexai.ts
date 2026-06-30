/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/naming-convention */

import type { IntegrationEvaluations } from "../types";

export const gcp_vertexaiEvaluations = {
  integration: "gcp_vertexai",
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
  user.id = CASE(
    user.id IS NOT NULL, user.id,
    data_stream.dataset == "gcp_vertexai.auditlogs" AND client.user.id IS NOT NULL, client.user.id,
    null
  ),
  user.name = CASE(
    user.name IS NOT NULL, user.name,
    data_stream.dataset == "gcp_vertexai.auditlogs" AND client.user.email IS NOT NULL, client.user.email,
    null
  ),
  user.email = CASE(
    user.email IS NOT NULL, user.email,
    data_stream.dataset == "gcp_vertexai.auditlogs" AND client.user.email IS NOT NULL, client.user.email,
    null
  ),
  host.ip = CASE(
    host.ip IS NOT NULL, host.ip,
    data_stream.dataset == "gcp_vertexai.auditlogs" AND source.ip IS NOT NULL, source.ip,
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "gcp_vertexai.auditlogs", "Vertex AI",
    data_stream.dataset == "gcp_vertexai.prompt_response_logs" AND cloud.service.name IS NOT NULL, cloud.service.name,
    null
  ),
  service.target.id = CASE(
    service.target.id IS NOT NULL, service.target.id,
    data_stream.dataset == "gcp_vertexai.auditlogs" AND gcp.vertexai.audit.resource_name IS NOT NULL, gcp.vertexai.audit.resource_name,
    data_stream.dataset == "gcp_vertexai.prompt_response_logs" AND gcp.vertexai.prompt_response_logs.full_request.model IS NOT NULL, gcp.vertexai.prompt_response_logs.full_request.model,
    null
  ),
  entity.target.name = CASE(
    entity.target.name IS NOT NULL, entity.target.name,
    data_stream.dataset == "gcp_vertexai.prompt_response_logs" AND gcp.vertexai.prompt_response_logs.model IS NOT NULL, gcp.vertexai.prompt_response_logs.model,
    null
  ),
  entity.target.id = CASE(
    entity.target.id IS NOT NULL, entity.target.id,
    data_stream.dataset == "gcp_vertexai.prompt_response_logs" AND gcp.vertexai.prompt_response_logs.request_id IS NOT NULL, gcp.vertexai.prompt_response_logs.request_id,
    null
  ),
  entity.target.sub_type = CASE(
    entity.target.sub_type IS NOT NULL, entity.target.sub_type,
    data_stream.dataset == "gcp_vertexai.auditlogs" AND gcp.vertexai.audit.resource_name IS NOT NULL, "foundation_model",
    data_stream.dataset == "gcp_vertexai.prompt_response_logs" AND gcp.vertexai.prompt_response_logs.model IS NOT NULL, "foundation_model",
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
