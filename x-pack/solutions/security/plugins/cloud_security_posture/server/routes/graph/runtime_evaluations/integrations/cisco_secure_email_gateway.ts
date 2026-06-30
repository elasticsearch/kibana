/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/naming-convention */

import type { IntegrationEvaluations } from "../types";

export const cisco_secure_email_gatewayEvaluations = {
  integration: "cisco_secure_email_gateway",
  evaluations: [
    {
      id: "detection_flags",
      section: "Detection flags (mandatory \u2014 run first)",
      esql: `| EVAL
  actor_exists = user.id IS NOT NULL OR user.name IS NOT NULL OR user.email IS NOT NULL
    OR client.ip IS NOT NULL OR host.ip IS NOT NULL
    OR service.name IS NOT NULL OR observer.vendor IS NOT NULL,
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
    data_stream.dataset == "cisco_secure_email_gateway.log" AND cisco_secure_email_gateway.log.category.name == "authentication" AND cisco_secure_email_gateway.log.action IN ("logged on", "authenticated"), "service",
    data_stream.dataset == "cisco_secure_email_gateway.log" AND email.to.address IS NOT NULL, "user",
    data_stream.dataset == "cisco_secure_email_gateway.log" AND file.name IS NOT NULL, "general",
    data_stream.dataset == "cisco_secure_email_gateway.log" AND url.path IS NOT NULL, "general",
    null
  ),
  entity.target.sub_type = CASE(
    entity.target.sub_type IS NOT NULL, entity.target.sub_type,
    data_stream.dataset == "cisco_secure_email_gateway.log" AND cisco_secure_email_gateway.log.category.name == "authentication" AND cisco_secure_email_gateway.log.action IN ("logged on", "authenticated"), null,
    data_stream.dataset == "cisco_secure_email_gateway.log" AND email.message_id IS NOT NULL, "email_message",
    data_stream.dataset == "cisco_secure_email_gateway.log" AND file.name IS NOT NULL, "file",
    data_stream.dataset == "cisco_secure_email_gateway.log" AND url.path IS NOT NULL, "web_resource",
    null
  )`,
    },
    {
      id: "actor",
      section: "Combined ES|QL \u2014 actor fields",
      esql: `| EVAL
  user.id = CASE(
    user.id IS NOT NULL, user.id,
    data_stream.dataset == "cisco_secure_email_gateway.log" AND cisco_secure_email_gateway.log.category.name IN ("authentication", "gui_logs", "system"), user.name,
    null
  ),
  user.name = CASE(
    user.name IS NOT NULL, user.name,
    data_stream.dataset == "cisco_secure_email_gateway.log" AND cisco_secure_email_gateway.log.category.name IN ("consolidated_event", "mail_logs", "bounces"), email.from.address,
    null
  ),
  user.email = CASE(
    user.email IS NOT NULL, user.email,
    data_stream.dataset == "cisco_secure_email_gateway.log" AND cisco_secure_email_gateway.log.category.name IN ("consolidated_event", "mail_logs", "bounces", "error_logs") AND email.from.address IS NOT NULL, email.from.address,
    null
  ),
  host.ip = CASE(
    host.ip IS NOT NULL, host.ip,
    data_stream.dataset == "cisco_secure_email_gateway.log" AND cisco_secure_email_gateway.log.category.name == "gui_logs", client.ip,
    data_stream.dataset == "cisco_secure_email_gateway.log" AND cisco_secure_email_gateway.log.category.name IN ("consolidated_event", "error_logs"), source.ip,
    null
  ),
  service.name = CASE(
    service.name IS NOT NULL, service.name,
    data_stream.dataset == "cisco_secure_email_gateway.log" AND cisco_secure_email_gateway.log.category.name == "antivirus", observer.vendor,
    null
  )`,
    },
    {
      id: "event_action",
      section: "Combined ES|QL \u2014 event action",
      esql: `| EVAL
  event.action = CASE(
    event.action IS NOT NULL, event.action,
    data_stream.dataset == "cisco_secure_email_gateway.log" AND cisco_secure_email_gateway.log.category.name == "gui_logs" AND http.request.method IS NOT NULL, http.request.method,
    data_stream.dataset == "cisco_secure_email_gateway.log" AND cisco_secure_email_gateway.log.category.name == "consolidated_event" AND cisco_secure_email_gateway.log.act IS NOT NULL, cisco_secure_email_gateway.log.act,
    data_stream.dataset == "cisco_secure_email_gateway.log" AND cisco_secure_email_gateway.log.category.name == "antivirus" AND cisco_secure_email_gateway.log.type IS NOT NULL, cisco_secure_email_gateway.log.type,
    data_stream.dataset == "cisco_secure_email_gateway.log" AND cisco_secure_email_gateway.log.category.name == "mail_logs" AND cisco_secure_email_gateway.log.message_status IS NOT NULL, cisco_secure_email_gateway.log.message_status,
    data_stream.dataset == "cisco_secure_email_gateway.log" AND cisco_secure_email_gateway.log.category.name == "bounces" AND cisco_secure_email_gateway.log.bounce_type IS NOT NULL, cisco_secure_email_gateway.log.bounce_type,
    data_stream.dataset == "cisco_secure_email_gateway.log" AND cisco_secure_email_gateway.log.category.name IN ("authentication", "gui_logs") AND cisco_secure_email_gateway.log.action IS NOT NULL, cisco_secure_email_gateway.log.action,
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "cisco_secure_email_gateway.log" AND cisco_secure_email_gateway.log.category.name == "authentication" AND cisco_secure_email_gateway.log.action IN ("logged on", "authenticated"), "Cisco Secure Email Gateway",
    null
  ),
  user.target.email = CASE(
    user.target.email IS NOT NULL, user.target.email,
    data_stream.dataset == "cisco_secure_email_gateway.log" AND email.to.address IS NOT NULL, email.to.address,
    null
  ),
  entity.target.id = CASE(
    entity.target.id IS NOT NULL, entity.target.id,
    data_stream.dataset == "cisco_secure_email_gateway.log" AND email.message_id IS NOT NULL, email.message_id,
    null
  ),
  entity.target.name = CASE(
    entity.target.name IS NOT NULL, entity.target.name,
    data_stream.dataset == "cisco_secure_email_gateway.log" AND cisco_secure_email_gateway.log.category.name IN ("amp", "antivirus") AND file.name IS NOT NULL, file.name,
    data_stream.dataset == "cisco_secure_email_gateway.log" AND email.subject IS NOT NULL, email.subject,
    data_stream.dataset == "cisco_secure_email_gateway.log" AND cisco_secure_email_gateway.log.category.name == "gui_logs" AND url.path IS NOT NULL, url.path,
    data_stream.dataset == "cisco_secure_email_gateway.log" AND cisco_secure_email_gateway.log.category.name == "system", cisco_secure_email_gateway.log.object,
    null
  ),
  host.target.ip = CASE(
    host.target.ip IS NOT NULL, host.target.ip,
    data_stream.dataset == "cisco_secure_email_gateway.log" AND destination.ip IS NOT NULL, destination.ip,
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
