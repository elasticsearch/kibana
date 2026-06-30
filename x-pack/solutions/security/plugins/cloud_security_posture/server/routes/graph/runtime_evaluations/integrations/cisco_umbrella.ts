/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/naming-convention */

import type { IntegrationEvaluations } from "../types";

export const cisco_umbrellaEvaluations = {
  integration: "cisco_umbrella",
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
  host.ip = CASE(
    host.ip IS NOT NULL, host.ip,
    data_stream.dataset == "cisco_umbrella.log" AND observer.type IN ("dns", "proxy", "firewall", "idps", "dlp") AND user.id IS NULL AND user.name IS NULL AND host.name IS NULL AND source.ip IS NOT NULL, source.ip,
    null
  ),
  entity.name = CASE(
    entity.name IS NOT NULL, entity.name,
    data_stream.dataset == "cisco_umbrella.log" AND network.name IS NOT NULL AND user.id IS NULL AND user.name IS NULL AND host.name IS NULL, network.name,
    null
  ),
  entity.type = CASE(
    entity.type IS NOT NULL, entity.type,
    data_stream.dataset == "cisco_umbrella.log" AND network.name IS NOT NULL AND user.id IS NULL AND user.name IS NULL AND host.name IS NULL, "network-segment",
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  entity.target.id = CASE(
    entity.target.id IS NOT NULL, entity.target.id,
    data_stream.dataset == "cisco_umbrella.log" AND event.category == "configuration" AND cisco.umbrella.audit.type IS NOT NULL, cisco.umbrella.audit.type,
    data_stream.dataset == "cisco_umbrella.log" AND observer.type == "dns" AND dns.question.name IS NOT NULL, dns.question.name,
    null
  ),
  entity.target.name = CASE(
    entity.target.name IS NOT NULL, entity.target.name,
    data_stream.dataset == "cisco_umbrella.log" AND event.category == "configuration" AND cisco.umbrella.audit.type IS NOT NULL, cisco.umbrella.audit.type,
    data_stream.dataset == "cisco_umbrella.log" AND observer.type == "dns" AND dns.question.name IS NOT NULL, dns.question.name,
    data_stream.dataset == "cisco_umbrella.log" AND observer.type IN ("proxy", "dlp") AND file.name IS NOT NULL, file.name,
    null
  ),
  entity.target.sub_type = CASE(
    entity.target.sub_type IS NOT NULL, entity.target.sub_type,
    data_stream.dataset == "cisco_umbrella.log" AND event.category == "configuration", "configuration_object",
    data_stream.dataset == "cisco_umbrella.log" AND observer.type == "dns", "dns_name",
    data_stream.dataset == "cisco_umbrella.log" AND observer.type IN ("proxy", "dlp") AND file.name IS NOT NULL, "file",
    null
  ),
  host.target.ip = CASE(
    host.target.ip IS NOT NULL, host.target.ip,
    data_stream.dataset == "cisco_umbrella.log" AND observer.type IN ("proxy", "firewall", "idps", "dlp") AND destination.ip IS NOT NULL, destination.ip,
    null
  ),
  host.target.name = CASE(
    host.target.name IS NOT NULL, host.target.name,
    data_stream.dataset == "cisco_umbrella.log" AND observer.type == "idps" AND cisco.umbrella.message IS NOT NULL, cisco.umbrella.message,
    null
  ),
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "cisco_umbrella.log" AND network.application IS NOT NULL, network.application,
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
