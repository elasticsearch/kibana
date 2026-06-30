/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/naming-convention */

import type { IntegrationEvaluations } from "../types";

export const cisco_merakiEvaluations = {
  integration: "cisco_meraki",
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
  user.name = CASE(
    user.name IS NOT NULL, user.name,
    data_stream.dataset == "cisco_meraki.log" AND cisco_meraki.event_subtype == "anyconnect_vpn_session_manager" AND cisco_meraki.anyconnect_vpn_session_manager.user_name IS NOT NULL, cisco_meraki.anyconnect_vpn_session_manager.user_name,
    null
  ),
  host.ip = CASE(
    host.ip IS NOT NULL, host.ip,
    data_stream.dataset == "cisco_meraki.log" AND source.ip IS NOT NULL AND user.name IS NULL, source.ip,
    data_stream.dataset == "cisco_meraki.log" AND client.ip IS NOT NULL AND client.ip != "0.0.0.0" AND user.name IS NULL, client.ip,
    null
  )`,
    },
    {
      id: "event_action",
      section: "Combined ES|QL \u2014 event action",
      esql: `| EVAL
  event.action = CASE(
    event.action IS NOT NULL, event.action,
    data_stream.dataset == "cisco_meraki.log" AND cisco_meraki.event_type == "ip_flow_start", "ip-flow-start",
    data_stream.dataset == "cisco_meraki.log" AND cisco_meraki.event_type == "ip_flow_end", "ip-flow-end",
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  host.target.ip = CASE(
    host.target.ip IS NOT NULL, host.target.ip,
    data_stream.dataset == "cisco_meraki.log" AND network.forwarded_ip IS NOT NULL, network.forwarded_ip,
    data_stream.dataset == "cisco_meraki.log" AND destination.ip IS NOT NULL, destination.ip,
    data_stream.dataset == "cisco_meraki.log" AND cisco_meraki.anyconnect_vpn_session_manager.peer_ip IS NOT NULL, cisco_meraki.anyconnect_vpn_session_manager.peer_ip,
    data_stream.dataset == "cisco_meraki.events" AND cisco_meraki.event.alertData.local IS NOT NULL, cisco_meraki.event.alertData.local,
    null
  ),
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "cisco_meraki.log" AND event.action == "wifi-8021x-auth" AND \`cisco_meraki.8021x_eap_success.vap\` IS NOT NULL, \`cisco_meraki.8021x_eap_success.vap\`,
    data_stream.dataset == "cisco_meraki.log" AND event.action == "wifi-wpa-authentication" AND cisco_meraki.wpa_auth.vap IS NOT NULL, cisco_meraki.wpa_auth.vap,
    data_stream.dataset == "cisco_meraki.log" AND event.action == "splash-authentication" AND cisco_meraki.splash_auth.vap IS NOT NULL, cisco_meraki.splash_auth.vap,
    data_stream.dataset == "cisco_meraki.log" AND event.action IN ("http-access", "http-access-error", "ids-signature-matched") AND network.protocol IS NOT NULL, network.protocol,
    data_stream.dataset == "cisco_meraki.log" AND event.action IN ("dhcp-offer", "dhcp-no-offer") AND server.mac IS NOT NULL, server.mac,
    null
  ),
  entity.target.id = CASE(
    entity.target.id IS NOT NULL, entity.target.id,
    data_stream.dataset == "cisco_meraki.log" AND event.action IN ("rogue-ssid-detected", "ssid-spoofing-detected") AND destination.mac IS NOT NULL, destination.mac,
    data_stream.dataset == "cisco_meraki.events" AND observer.serial_number IS NOT NULL, observer.serial_number,
    null
  ),
  entity.target.name = CASE(
    entity.target.name IS NOT NULL, entity.target.name,
    data_stream.dataset == "cisco_meraki.log" AND event.action IN ("http-access", "http-access-error") AND url.domain IS NOT NULL, url.domain,
    data_stream.dataset == "cisco_meraki.log" AND event.action IN ("malicious-file-actioned", "issued-retrospective-malicious-disposition") AND file.name IS NOT NULL, file.name,
    data_stream.dataset == "cisco_meraki.events" AND observer.name IS NOT NULL, observer.name,
    null
  ),
  entity.target.type = CASE(
    entity.target.type IS NOT NULL, entity.target.type,
    data_stream.dataset == "cisco_meraki.log" AND event.action IN ("wifi-wpa-authentication", "wifi-8021x-auth", "splash-authentication"), "service",
    data_stream.dataset == "cisco_meraki.log" AND destination.ip IS NOT NULL, "host",
    data_stream.dataset == "cisco_meraki.events", "general",
    null
  ),
  entity.target.sub_type = CASE(
    entity.target.sub_type IS NOT NULL, entity.target.sub_type,
    data_stream.dataset == "cisco_meraki.log" AND event.action IN ("wifi-wpa-authentication", "wifi-8021x-auth", "splash-authentication"), "wifi_vap",
    data_stream.dataset == "cisco_meraki.events", "managed_device",
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
