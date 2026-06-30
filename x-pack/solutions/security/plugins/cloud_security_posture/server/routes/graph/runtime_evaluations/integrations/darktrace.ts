/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
 

import type { IntegrationEvaluations } from "../types";

export const darktraceEvaluations = {
  integration: "darktrace",
  evaluations: [
    {
      id: "detection_flags",
      section: "Detection flags (mandatory \u2014 run first)",
      esql: `| EVAL
  actor_exists = host.id IS NOT NULL OR host.ip IS NOT NULL OR host.name IS NOT NULL
    OR host.hostname IS NOT NULL OR host.mac IS NOT NULL OR host.type IS NOT NULL,
  target_exists = host.target.id IS NOT NULL OR host.target.ip IS NOT NULL OR host.target.name IS NOT NULL
    OR service.target.id IS NOT NULL OR service.target.name IS NOT NULL
    OR entity.target.id IS NOT NULL OR entity.target.name IS NOT NULL,
  action_exists = event.action IS NOT NULL`,
    },
    {
      id: "actor",
      section: "Combined ES|QL \u2014 actor fields",
      esql: `| EVAL
  host.name = CASE(
    host.name IS NOT NULL, host.name,
    STARTS_WITH(data_stream.dataset, "darktrace.") AND host.hostname IS NOT NULL, host.hostname,
    null
  )`,
    },
    {
      id: "event_action",
      section: "Combined ES|QL \u2014 event action",
      esql: `| EVAL
  event.action = CASE(
    event.action IS NOT NULL, event.action,
    data_stream.dataset == "darktrace.model_breach_alert" AND rule.name IS NOT NULL, rule.name,
    data_stream.dataset == "darktrace.ai_analyst_alert" AND darktrace.ai_analyst_alert.summariser IS NOT NULL, darktrace.ai_analyst_alert.summariser,
    data_stream.dataset == "darktrace.system_status_alert" AND darktrace.system_status_alert.alert_name IS NOT NULL, darktrace.system_status_alert.alert_name,
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  entity.target.id = CASE(
    entity.target.id IS NOT NULL, entity.target.id,
    data_stream.dataset == "darktrace.system_status_alert" AND darktrace.system_status_alert.name IS NOT NULL, darktrace.system_status_alert.name,
    null
  ),
  entity.target.name = CASE(
    entity.target.name IS NOT NULL, entity.target.name,
    data_stream.dataset == "darktrace.system_status_alert" AND darktrace.system_status_alert.alert_name IS NOT NULL, darktrace.system_status_alert.alert_name,
    null
  ),
  entity.target.sub_type = CASE(
    entity.target.sub_type IS NOT NULL, entity.target.sub_type,
    data_stream.dataset == "darktrace.system_status_alert", "platform_module",
    null
  ),
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "darktrace.ai_analyst_alert" AND darktrace.ai_analyst_alert.summariser == "AdminConnSummary", "SSH",
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
