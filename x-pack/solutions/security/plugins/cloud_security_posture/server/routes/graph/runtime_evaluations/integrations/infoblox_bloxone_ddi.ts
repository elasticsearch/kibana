/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/naming-convention */

import type { IntegrationEvaluations } from "../types";

export const infoblox_bloxone_ddiEvaluations = {
  integration: "infoblox_bloxone_ddi",
  evaluations: [
    {
      id: "detection_flags",
      section: "Detection flags (mandatory \u2014 run first)",
      esql: `| EVAL
  actor_exists = client.user.id IS NOT NULL
    OR host.id IS NOT NULL OR host.ip IS NOT NULL OR host.name IS NOT NULL OR host.hostname IS NOT NULL
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
  entity.id = CASE(
    entity.id IS NOT NULL, entity.id,
    data_stream.dataset == "infoblox_bloxone_ddi.dhcp_lease" AND client.user.id IS NOT NULL, client.user.id,
    null
  ),
  entity.name = CASE(
    entity.name IS NOT NULL, entity.name,
    data_stream.dataset == "infoblox_bloxone_ddi.dhcp_lease" AND host.hostname IS NOT NULL, host.hostname,
    data_stream.dataset == "infoblox_bloxone_ddi.dns_data" AND infoblox_bloxone_ddi.dns_data.source IS NOT NULL, MV_FIRST(infoblox_bloxone_ddi.dns_data.source),
    null
  ),
  entity.type = CASE(
    entity.type IS NOT NULL, entity.type,
    data_stream.dataset == "infoblox_bloxone_ddi.dhcp_lease", "host",
    data_stream.dataset == "infoblox_bloxone_ddi.dns_data" AND infoblox_bloxone_ddi.dns_data.source IS NOT NULL, "general",
    null
  ),
  entity.sub_type = CASE(
    entity.sub_type IS NOT NULL, entity.sub_type,
    data_stream.dataset == "infoblox_bloxone_ddi.dns_data" AND infoblox_bloxone_ddi.dns_data.source IS NOT NULL, "config-source",
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  entity.target.id = CASE(
    entity.target.id IS NOT NULL, entity.target.id,
    data_stream.dataset == "infoblox_bloxone_ddi.dns_data", event.id,
    data_stream.dataset == "infoblox_bloxone_ddi.dns_config", event.id,
    null
  ),
  entity.target.name = CASE(
    entity.target.name IS NOT NULL, entity.target.name,
    data_stream.dataset == "infoblox_bloxone_ddi.dns_data", dns.question.name,
    data_stream.dataset == "infoblox_bloxone_ddi.dns_config", infoblox_bloxone_ddi.dns_config.name,
    null
  ),
  entity.target.type = CASE(
    entity.target.type IS NOT NULL, entity.target.type,
    data_stream.dataset == "infoblox_bloxone_ddi.dns_data", "general",
    data_stream.dataset == "infoblox_bloxone_ddi.dns_config", "service",
    null
  ),
  entity.target.sub_type = CASE(
    entity.target.sub_type IS NOT NULL, entity.target.sub_type,
    data_stream.dataset == "infoblox_bloxone_ddi.dns_data", "dns-record",
    data_stream.dataset == "infoblox_bloxone_ddi.dhcp_lease", "ip_lease",
    null
  ),
  host.target.ip = CASE(
    host.target.ip IS NOT NULL, host.target.ip,
    data_stream.dataset == "infoblox_bloxone_ddi.dhcp_lease", infoblox_bloxone_ddi.dhcp_lease.address,
    null
  ),
  host.target.name = CASE(
    host.target.name IS NOT NULL, host.target.name,
    data_stream.dataset == "infoblox_bloxone_ddi.dhcp_lease" AND host.hostname IS NOT NULL, host.hostname,
    null
  ),
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "infoblox_bloxone_ddi.dns_config", infoblox_bloxone_ddi.dns_config.name,
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
