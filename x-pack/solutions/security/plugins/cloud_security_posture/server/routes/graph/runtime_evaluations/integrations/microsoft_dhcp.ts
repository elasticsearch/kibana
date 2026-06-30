/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/naming-convention */

import type { IntegrationEvaluations } from "../types";

export const microsoft_dhcpEvaluations = {
  integration: "microsoft_dhcp",
  evaluations: [
    {
      id: "detection_flags",
      section: "Detection flags (mandatory \u2014 run first)",
      esql: `| EVAL
  actor_exists = user.id IS NOT NULL OR user.name IS NOT NULL OR user.email IS NOT NULL
    OR entity.id IS NOT NULL OR entity.name IS NOT NULL
    OR service.id IS NOT NULL OR service.name IS NOT NULL,
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
  host.name = CASE(
    data_stream.dataset == "microsoft_dhcp.log" AND event.action != "rogue-server-detection" AND event.code != "1103" AND source.address IS NOT NULL, source.address,
    null
  ),
  host.ip = CASE(
    data_stream.dataset == "microsoft_dhcp.log" AND event.action NOT IN ("dhcp-new", "dhcp-renew", "dhcp-release", "dhcp-deny", "dhcp-delete", "dhcp-expire", "dhcpv6-bad-address", "dhcpv6-address-in-use", "dhcpv6-client-deleted", "dhcpv6-expired", "dhcpv6-lease-expired-deleted", "log-start", "log-end", "log-pause", "log-stop", "ip-cleanup-start", "ip-cleanup-end", "dhcpv6-cleanup-start", "dhcpv6-cleanup-end", "dhcpv6-stateless-clients-pruged", "dhcpv6-stateless-clients-expired", "rogue-server-detection") AND (source.mac IS NOT NULL OR microsoft.dhcp.duid.hex IS NOT NULL) AND source.ip IS NOT NULL, source.ip,
    null
  ),
  entity.id = CASE(
    entity.id IS NOT NULL, entity.id,
    data_stream.dataset == "microsoft_dhcp.log" AND microsoft.dhcp.duid.hex IS NOT NULL, microsoft.dhcp.duid.hex,
    data_stream.dataset == "microsoft_dhcp.log" AND source.mac IS NOT NULL AND source.mac != "00-00-00-00-00-00", source.mac,
    null
  ),
  entity.type = CASE(
    entity.type IS NOT NULL, entity.type,
    data_stream.dataset == "microsoft_dhcp.log" AND (source.mac IS NOT NULL OR microsoft.dhcp.duid.hex IS NOT NULL) AND event.action != "rogue-server-detection", "host",
    null
  ),
  entity.name = CASE(
    entity.name IS NOT NULL, entity.name,
    data_stream.dataset == "microsoft_dhcp.log" AND (event.action == "rogue-server-detection" OR event.code == "1103") AND source.domain IS NOT NULL, source.domain,
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  host.target.ip = CASE(
    host.target.ip IS NOT NULL, host.target.ip,
    data_stream.dataset == "microsoft_dhcp.log" AND event.action IN ("dhcp-new", "dhcp-renew", "dhcp-release", "dhcp-deny", "dhcp-delete", "dhcp-expire", "dhcpv6-bad-address", "dhcpv6-address-in-use", "dhcpv6-client-deleted", "dhcpv6-expired", "dhcpv6-lease-expired-deleted") AND source.ip IS NOT NULL, source.ip,
    null
  ),
  host.target.name = CASE(
    host.target.name IS NOT NULL, host.target.name,
    data_stream.dataset == "microsoft_dhcp.log" AND event.action IN ("dhcp-new", "dhcp-dns-update", "ipv6-dns-update-request", "ipv6-dns-update-successful", "ipv6-dns-update-failed", "ipv6-dns-update-request-failed") AND source.address IS NOT NULL, source.address,
    null
  ),
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "microsoft_dhcp.log" AND event.action == "dhcp-dns-update", "DNS dynamic update service",
    data_stream.dataset == "microsoft_dhcp.log" AND event.action == "dhcpv6-solicit", "Microsoft DHCP service",
    null
  ),
  entity.target.name = CASE(
    entity.target.name IS NOT NULL, entity.target.name,
    data_stream.dataset == "microsoft_dhcp.log" AND (event.action == "rogue-server-detection" OR event.code == "1103") AND source.domain IS NOT NULL, source.domain,
    null
  ),
  entity.target.type = CASE(
    entity.target.type IS NOT NULL, entity.target.type,
    data_stream.dataset == "microsoft_dhcp.log" AND (event.action == "rogue-server-detection" OR event.code == "1103"), "general",
    data_stream.dataset == "microsoft_dhcp.log" AND event.action IN ("dhcp-new", "dhcp-renew", "dhcp-release", "dhcp-deny", "dhcp-delete", "dhcp-expire"), "host",
    data_stream.dataset == "microsoft_dhcp.log" AND event.action IN ("dhcp-dns-update", "ipv6-dns-update-request", "ipv6-dns-update-successful", "ipv6-dns-update-failed", "ipv6-dns-update-request-failed", "dhcpv6-solicit"), "service",
    null
  ),
  entity.target.sub_type = CASE(
    entity.target.sub_type IS NOT NULL, entity.target.sub_type,
    data_stream.dataset == "microsoft_dhcp.log" AND (event.action == "rogue-server-detection" OR event.code == "1103"), "ad-domain",
    data_stream.dataset == "microsoft_dhcp.log" AND event.action IN ("dhcp-new", "dhcp-renew", "dhcp-release", "dhcp-deny", "dhcp-delete", "dhcp-expire"), "ip_lease",
    data_stream.dataset == "microsoft_dhcp.log" AND event.action IN ("dhcp-dns-update", "ipv6-dns-update-request", "ipv6-dns-update-successful", "ipv6-dns-update-failed", "ipv6-dns-update-request-failed"), "dns",
    data_stream.dataset == "microsoft_dhcp.log" AND event.action == "dhcpv6-solicit", "dhcp",
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
