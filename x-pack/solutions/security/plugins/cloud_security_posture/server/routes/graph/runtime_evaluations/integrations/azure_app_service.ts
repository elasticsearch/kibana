/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/naming-convention */

import type { IntegrationEvaluations } from "../types";

export const azure_app_serviceEvaluations = {
  integration: "azure_app_service",
  evaluations: [
    {
      id: "detection_flags",
      section: "Detection flags (mandatory \u2014 run first)",
      esql: `| EVAL
  actor_exists = user.id IS NOT NULL OR user.email IS NOT NULL OR user.name IS NOT NULL OR host.ip IS NOT NULL,
  target_exists = host.target.id IS NOT NULL OR host.target.name IS NOT NULL
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
    data_stream.dataset == "azure_app_service.app_service_logs" AND azure.app_service.category IN ("AppServiceAuditLogs", "AppServiceIPSecAuditLogs"), "host",
    data_stream.dataset == "azure_app_service.app_service_logs" AND azure.app_service.category == "AppServiceHTTPLogs", "general",
    null
  ),
  entity.target.sub_type = CASE(
    entity.target.sub_type IS NOT NULL, entity.target.sub_type,
    data_stream.dataset == "azure_app_service.app_service_logs" AND azure.app_service.category IN ("AppServiceAuditLogs", "AppServiceIPSecAuditLogs"), "web_app",
    data_stream.dataset == "azure_app_service.app_service_logs" AND azure.app_service.category == "AppServiceHTTPLogs", "url_path",
    null
  )`,
    },
    {
      id: "actor",
      section: "Combined ES|QL \u2014 actor fields",
      esql: `| EVAL
  user.id = CASE(
    user.id IS NOT NULL, user.id,
    data_stream.dataset == "azure_app_service.app_service_logs" AND azure.app_service.category == "AppServiceAuditLogs", azure.app_service.properties.user,
    null
  ),
  user.email = CASE(
    user.email IS NOT NULL, user.email,
    data_stream.dataset == "azure_app_service.app_service_logs" AND azure.app_service.category == "AppServiceAuditLogs", azure.app_service.properties.user_display_name,
    null
  ),
  user.name = CASE(
    user.name IS NOT NULL, user.name,
    data_stream.dataset == "azure_app_service.app_service_logs" AND azure.app_service.category == "AppServiceAuditLogs", azure.app_service.properties.user_display_name,
    data_stream.dataset == "azure_app_service.app_service_logs" AND azure.app_service.category == "AppServiceHTTPLogs" AND azure.app_service.properties.cs_username != "-", azure.app_service.properties.cs_username,
    null
  ),
  host.ip = CASE(
    host.ip IS NOT NULL, host.ip,
    data_stream.dataset == "azure_app_service.app_service_logs" AND azure.app_service.category IN ("AppServiceAuditLogs", "AppServiceIPSecAuditLogs", "AppServiceHTTPLogs"), azure.app_service.properties.client_ip,
    null
  )`,
    },
    {
      id: "event_action",
      section: "Combined ES|QL \u2014 event action",
      esql: `| EVAL
  event.action = CASE(
    event.action IS NOT NULL, event.action,
    data_stream.dataset == "azure_app_service.app_service_logs" AND azure.app_service.category IN ("AppServiceAuditLogs", "AppServiceIPSecAuditLogs"), azure.app_service.operation_name,
    data_stream.dataset == "azure_app_service.app_service_logs" AND azure.app_service.category == "AppServiceHTTPLogs", azure.app_service.properties.cs_method,
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  host.target.id = CASE(
    host.target.id IS NOT NULL, host.target.id,
    data_stream.dataset == "azure_app_service.app_service_logs" AND azure.app_service.category IN ("AppServiceAuditLogs", "AppServiceIPSecAuditLogs", "AppServiceHTTPLogs"), azure.resource.id,
    null
  ),
  host.target.name = CASE(
    host.target.name IS NOT NULL, host.target.name,
    data_stream.dataset == "azure_app_service.app_service_logs" AND azure.app_service.category == "AppServiceAuditLogs", azure.resource.name,
    data_stream.dataset == "azure_app_service.app_service_logs" AND azure.app_service.category == "AppServiceIPSecAuditLogs", azure.app_service.properties.cs_host,
    data_stream.dataset == "azure_app_service.app_service_logs" AND azure.app_service.category == "AppServiceHTTPLogs", azure.app_service.properties.cs_host,
    null
  ),
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "azure_app_service.app_service_logs" AND azure.app_service.category IN ("AppServiceAuditLogs", "AppServiceIPSecAuditLogs", "AppServiceHTTPLogs"), azure.resource.provider,
    null
  ),
  entity.target.name = CASE(
    entity.target.name IS NOT NULL, entity.target.name,
    data_stream.dataset == "azure_app_service.app_service_logs" AND azure.app_service.category == "AppServiceHTTPLogs", azure.app_service.properties.cs_uri_stem,
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
