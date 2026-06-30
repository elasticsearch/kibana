/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
 

import type { IntegrationEvaluations } from "../types";

export const corelightEvaluations = {
  integration: "corelight",
  evaluations: [
    {
      id: "detection_flags",
      section: "Detection flags (mandatory \u2014 run first)",
      esql: `| EVAL
  actor_exists = host.id IS NOT NULL OR host.ip IS NOT NULL OR host.name IS NOT NULL
    OR service.id IS NOT NULL OR service.name IS NOT NULL
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
    event.dataset IN ("conn", "dns", "http", "tls", "x509", "notice", "intel", "ssh", "rdp", "vpn", "suricata_corelight", "files") AND source.ip IS NOT NULL, source.ip,
    null
  ),
  entity.name = CASE(
    entity.name IS NOT NULL, entity.name,
    event.dataset == "http" AND user_agent.original IS NOT NULL, user_agent.original,
    null
  )`,
    },
    {
      id: "event_action",
      section: "Combined ES|QL \u2014 event action",
      esql: `| EVAL
  event.action = CASE(
    event.action IS NOT NULL, event.action,
    event.dataset == "notice" AND notice.note IS NOT NULL, notice.note,
    event.dataset == "suricata_corelight" AND rule.name IS NOT NULL, rule.name,
    event.dataset == "http" AND http.request.method IS NOT NULL, http.request.method,
    event.dataset == "dns" AND dns.question.type IS NOT NULL, dns.question.type,
    event.dataset == "rdp" AND rdp.result IS NOT NULL, rdp.result,
    event.dataset == "ssh" AND ssh.inferences IS NOT NULL, ssh.inferences,
    event.dataset == "vpn" AND vpn.inferences IS NOT NULL, vpn.inferences,
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  host.target.ip = CASE(
    host.target.ip IS NOT NULL, host.target.ip,
    event.dataset IN ("conn", "dns", "http", "tls", "x509", "notice", "intel", "ssh", "rdp", "vpn", "suricata_corelight") AND destination.ip IS NOT NULL, destination.ip,
    null
  ),
  host.target.id = CASE(
    host.target.id IS NOT NULL, host.target.id,
    event.dataset == "conn" AND capture_source == "vpcflow" AND resp_inst.id IS NOT NULL, resp_inst.id,
    null
  ),
  host.target.name = CASE(
    host.target.name IS NOT NULL, host.target.name,
    event.dataset == "files" AND files.rx_hosts IS NOT NULL, files.rx_hosts,
    null
  ),
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    event.dataset IN ("conn", "notice", "tls", "rdp") AND network.protocol IS NOT NULL, network.protocol,
    null
  ),
  entity.target.name = CASE(
    entity.target.name IS NOT NULL, entity.target.name,
    event.dataset == "dns" AND dns.question.name IS NOT NULL, dns.question.name,
    event.dataset == "http" AND dest_host IS NOT NULL, dest_host,
    event.dataset == "intel" AND intel.seen.indicator IS NOT NULL, intel.seen.indicator,
    event.dataset == "suricata_corelight" AND rule.name IS NOT NULL, rule.name,
    event.dataset == "notice" AND notice.note IS NOT NULL, notice.note,
    null
  ),
  entity.target.type = CASE(
    entity.target.type IS NOT NULL, entity.target.type,
    event.dataset == "dns", "domain",
    event.dataset == "http", "url",
    event.dataset == "intel", "indicator",
    event.dataset == "suricata_corelight", "ids_rule",
    event.dataset == "notice", "notice",
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
