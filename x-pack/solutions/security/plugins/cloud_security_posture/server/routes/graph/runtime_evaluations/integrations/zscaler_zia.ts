/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/naming-convention */

import type { IntegrationEvaluations } from "../types";

export const zscaler_ziaEvaluations = {
  integration: "zscaler_zia",
  evaluations: [
    {
      id: "detection_flags",
      section: "Detection flags (mandatory \u2014 run first)",
      esql: `| EVAL
  actor_exists = user.id IS NOT NULL OR user.name IS NOT NULL OR user.email IS NOT NULL OR user.domain IS NOT NULL
    OR host.name IS NOT NULL OR host.ip IS NOT NULL,
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
    data_stream.dataset IN ("zscaler_zia.audit", "zscaler_zia.web", "zscaler_zia.firewall", "zscaler_zia.dns", "zscaler_zia.endpoint_dlp"), user.email,
    null
  ),
  host.ip = CASE(
    host.ip IS NOT NULL, host.ip,
    data_stream.dataset IN ("zscaler_zia.web", "zscaler_zia.dns", "zscaler_zia.firewall", "zscaler_zia.tunnel"), source.ip,
    null
  )`,
    },
    {
      id: "event_action",
      section: "Combined ES|QL \u2014 event action",
      esql: `| EVAL
  event.action = CASE(
    event.action IS NOT NULL, event.action,
    data_stream.dataset == "zscaler_zia.dns" AND zscaler_zia.dns.request.action IS NOT NULL, TO_LOWER(zscaler_zia.dns.request.action),
    data_stream.dataset == "zscaler_zia.tunnel" AND zscaler_zia.tunnel.action.type IS NOT NULL, TO_LOWER(REPLACE(zscaler_zia.tunnel.action.type, " ", "-")),
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "zscaler_zia.audit" AND event.action IN ("sign_out", "activate"), "ZIA Admin Portal",
    data_stream.dataset == "zscaler_zia.web", zscaler_zia.web.app.name,
    data_stream.dataset == "zscaler_zia.alerts", zscaler_zia.alerts.log_feed_name,
    data_stream.dataset IN ("zscaler_zia.dns", "zscaler_zia.firewall") AND network.application IS NOT NULL, network.application,
    null
  ),
  entity.target.name = CASE(
    entity.target.name IS NOT NULL, entity.target.name,
    data_stream.dataset == "zscaler_zia.audit", rule.name,
    data_stream.dataset == "zscaler_zia.dns", dns.question.name,
    data_stream.dataset == "zscaler_zia.endpoint_dlp" AND zscaler_zia.endpoint_dlp.item.destination_name IS NOT NULL, zscaler_zia.endpoint_dlp.item.destination_name,
    data_stream.dataset IN ("zscaler_zia.endpoint_dlp", "zscaler_zia.sandbox_report"), file.name,
    null
  ),
  entity.target.sub_type = CASE(
    entity.target.sub_type IS NOT NULL, entity.target.sub_type,
    data_stream.dataset == "zscaler_zia.audit", rule.category,
    data_stream.dataset == "zscaler_zia.dns", "dns_name",
    null
  ),
  entity.target.type = CASE(
    entity.target.type IS NOT NULL, entity.target.type,
    data_stream.dataset == "zscaler_zia.audit", "general",
    data_stream.dataset == "zscaler_zia.web", "service",
    data_stream.dataset == "zscaler_zia.dns", "general",
    data_stream.dataset == "zscaler_zia.endpoint_dlp", "general",
    null
  ),
  host.target.name = CASE(
    host.target.name IS NOT NULL, host.target.name,
    data_stream.dataset == "zscaler_zia.web" AND url.domain IS NOT NULL, url.domain,
    null
  ),
  host.target.ip = CASE(
    host.target.ip IS NOT NULL, host.target.ip,
    data_stream.dataset IN ("zscaler_zia.web", "zscaler_zia.firewall", "zscaler_zia.tunnel"), destination.ip,
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
