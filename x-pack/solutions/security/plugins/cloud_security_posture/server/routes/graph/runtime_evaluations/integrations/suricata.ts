/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
 

import type { IntegrationEvaluations } from "../types";

export const suricataEvaluations = {
  integration: "suricata",
  evaluations: [
    {
      id: "detection_flags",
      section: "Detection flags (mandatory \u2014 run first)",
      esql: `| EVAL
  actor_exists = host.id IS NOT NULL OR host.ip IS NOT NULL OR host.name IS NOT NULL
    OR entity.id IS NOT NULL OR entity.name IS NOT NULL,
  target_exists = host.target.id IS NOT NULL OR host.target.ip IS NOT NULL OR host.target.name IS NOT NULL
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
    data_stream.dataset == "suricata.eve" AND event.kind != "metric" AND MV_CONTAINS(suricata.eve.alert.hostile, "dest_ip"), TO_STRING(destination.ip),
    data_stream.dataset == "suricata.eve" AND event.kind != "metric" AND source.ip IS NOT NULL, TO_STRING(source.ip),
    null
  ),
  host.id = CASE(
    host.id IS NOT NULL, host.id,
    data_stream.dataset == "suricata.eve" AND event.kind != "metric" AND MV_CONTAINS(suricata.eve.alert.hostile, "dest_ip"), TO_STRING(destination.ip),
    data_stream.dataset == "suricata.eve" AND event.kind != "metric" AND source.ip IS NOT NULL, TO_STRING(source.ip),
    null
  ),
  host.mac = CASE(
    host.mac IS NOT NULL, host.mac,
    data_stream.dataset == "suricata.eve" AND source.mac IS NOT NULL, source.mac,
    null
  )`,
    },
    {
      id: "event_action",
      section: "Combined ES|QL \u2014 event action",
      esql: `| EVAL
  event.action = CASE(
    event.action IS NOT NULL, event.action,
    data_stream.dataset == "suricata.eve" AND event.kind == "alert" AND rule.name IS NOT NULL, rule.name,
    data_stream.dataset == "suricata.eve" AND suricata.eve.event_type == "dns" AND dns.type IS NOT NULL, dns.type,
    data_stream.dataset == "suricata.eve" AND suricata.eve.event_type == "http" AND http.request.method IS NOT NULL, http.request.method,
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  host.target.ip = CASE(
    host.target.ip IS NOT NULL, host.target.ip,
    data_stream.dataset == "suricata.eve" AND event.kind != "metric" AND destination.ip IS NOT NULL, destination.ip,
    null
  ),
  host.target.name = CASE(
    host.target.name IS NOT NULL, host.target.name,
    data_stream.dataset == "suricata.eve" AND destination.domain IS NOT NULL, destination.domain,
    null
  ),
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "suricata.eve" AND network.protocol IS NOT NULL, network.protocol,
    null
  ),
  entity.target.id = CASE(
    entity.target.id IS NOT NULL, entity.target.id,
    data_stream.dataset == "suricata.eve" AND event.kind == "alert" AND rule.id IS NOT NULL, rule.id,
    null
  ),
  entity.target.name = CASE(
    entity.target.name IS NOT NULL, entity.target.name,
    data_stream.dataset == "suricata.eve" AND suricata.eve.event_type == "dns" AND dns.question.name IS NOT NULL, dns.question.name,
    data_stream.dataset == "suricata.eve" AND event.kind == "alert" AND rule.name IS NOT NULL, rule.name,
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
