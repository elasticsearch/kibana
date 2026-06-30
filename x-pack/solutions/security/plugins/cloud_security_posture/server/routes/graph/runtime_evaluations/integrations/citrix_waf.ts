/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/naming-convention */

import type { IntegrationEvaluations } from "../types";

export const citrix_wafEvaluations = {
  integration: "citrix_waf",
  evaluations: [
    {
      id: "detection_flags",
      section: "Detection flags (mandatory \u2014 run first)",
      esql: `| EVAL
  actor_exists = user.id IS NOT NULL OR user.name IS NOT NULL OR user.email IS NOT NULL
    OR host.id IS NOT NULL OR host.ip IS NOT NULL OR host.name IS NOT NULL
    OR source.ip IS NOT NULL
    OR service.id IS NOT NULL OR service.name IS NOT NULL
    OR entity.id IS NOT NULL OR entity.name IS NOT NULL,
  target_exists = user.target.id IS NOT NULL OR user.target.name IS NOT NULL OR user.target.email IS NOT NULL
    OR host.target.id IS NOT NULL OR host.target.ip IS NOT NULL OR host.target.name IS NOT NULL
    OR service.target.id IS NOT NULL OR service.target.name IS NOT NULL
    OR entity.target.id IS NOT NULL OR entity.target.name IS NOT NULL
    OR entity.target.type IS NOT NULL OR entity.target.sub_type IS NOT NULL,
  action_exists = event.action IS NOT NULL`,
    },
    {
      id: "actor",
      section: "Combined ES|QL \u2014 actor fields",
      esql: `| EVAL
  host.ip = CASE(
    host.ip IS NOT NULL, host.ip,
    data_stream.dataset == "citrix_waf.log" AND TO_BOOLEAN(citrix.cef_format) == true AND source.ip IS NOT NULL, source.ip,
    null
  ),
  user.name = CASE(
    user.name IS NOT NULL, user.name,
    data_stream.dataset == "citrix_waf.log" AND citrix.name == "CMD_EXECUTED", "ADM_User",
    null
  )`,
    },
    {
      id: "event_action",
      section: "Combined ES|QL \u2014 event action",
      esql: `| EVAL
  event.action = CASE(
    event.action IS NOT NULL, event.action,
    data_stream.dataset == "citrix_waf.log" AND (citrix.cef_format IS NULL OR TO_BOOLEAN(citrix.cef_format) == false) AND citrix.name IS NOT NULL, citrix.name,
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  service.target.id = CASE(
    service.target.id IS NOT NULL, service.target.id,
    data_stream.dataset == "citrix_waf.log" AND TO_BOOLEAN(citrix.cef_format) == true AND http.request.id IS NOT NULL, http.request.id,
    null
  ),
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "citrix_waf.log" AND TO_BOOLEAN(citrix.cef_format) == true AND url.domain IS NOT NULL, CONCAT(url.domain, url.path),
    data_stream.dataset == "citrix_waf.log" AND citrix.device_event_class_id == "API", "Citrix ADC management API",
    data_stream.dataset == "citrix_waf.log" AND citrix.device_event_class_id == "APPFW" AND (citrix.cef_format IS NULL OR TO_BOOLEAN(citrix.cef_format) == false), "Citrix NetScaler APPFW",
    null
  ),
  entity.target.type = CASE(
    entity.target.type IS NOT NULL, entity.target.type,
    data_stream.dataset == "citrix_waf.log" AND TO_BOOLEAN(citrix.cef_format) == true, "service",
    data_stream.dataset == "citrix_waf.log" AND citrix.device_event_class_id IN ("API", "APPFW"), "service",
    null
  ),
  entity.target.sub_type = CASE(
    entity.target.sub_type IS NOT NULL, entity.target.sub_type,
    data_stream.dataset == "citrix_waf.log" AND TO_BOOLEAN(citrix.cef_format) == true AND url.domain IS NOT NULL, "protected_web_app",
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
