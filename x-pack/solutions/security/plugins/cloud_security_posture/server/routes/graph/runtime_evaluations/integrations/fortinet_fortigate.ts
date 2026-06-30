/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/naming-convention */

import type { IntegrationEvaluations } from "../types";

export const fortinet_fortigateEvaluations = {
  integration: "fortinet_fortigate",
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
    data_stream.dataset == "fortinet_fortigate.log" AND source.user.name IS NOT NULL, source.user.name,
    null
  ),
  host.ip = CASE(
    host.ip IS NOT NULL, host.ip,
    data_stream.dataset == "fortinet_fortigate.log" AND source.ip IS NOT NULL, source.ip,
    null
  )`,
    },
    {
      id: "event_action",
      section: "Combined ES|QL \u2014 event action",
      esql: `| EVAL
  event.action = CASE(
    event.action IS NOT NULL, event.action,
    data_stream.dataset == "fortinet_fortigate.log" AND fortinet.firewall.type == "event" AND fortinet.firewall.action IS NOT NULL, fortinet.firewall.action,
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "fortinet_fortigate.log" AND event.action == "login", observer.name,
    data_stream.dataset == "fortinet_fortigate.log" AND fortinet.firewall.type IN ("traffic", "utm", "dns") AND network.application IS NOT NULL, network.application,
    data_stream.dataset == "fortinet_fortigate.log" AND fortinet.firewall.subtype == "vpn" AND fortinet.firewall.vpntunnel IS NOT NULL, fortinet.firewall.vpntunnel,
    null
  ),
  host.target.ip = CASE(
    host.target.ip IS NOT NULL, host.target.ip,
    data_stream.dataset == "fortinet_fortigate.log" AND fortinet.firewall.type IN ("traffic", "utm", "dns") AND destination.ip IS NOT NULL, destination.ip,
    null
  ),
  host.target.name = CASE(
    host.target.name IS NOT NULL, host.target.name,
    data_stream.dataset == "fortinet_fortigate.log" AND destination.address IS NOT NULL, destination.address,
    data_stream.dataset == "fortinet_fortigate.log" AND destination.domain IS NOT NULL, destination.domain,
    null
  ),
  user.target.name = CASE(
    user.target.name IS NOT NULL, user.target.name,
    data_stream.dataset == "fortinet_fortigate.log" AND fortinet.firewall.type == "traffic" AND destination.user.name IS NOT NULL, destination.user.name,
    null
  ),
  user.target.email = CASE(
    user.target.email IS NOT NULL, user.target.email,
    data_stream.dataset == "fortinet_fortigate.log" AND email.to.address IS NOT NULL, email.to.address,
    null
  ),
  entity.target.name = CASE(
    entity.target.name IS NOT NULL, entity.target.name,
    data_stream.dataset == "fortinet_fortigate.log" AND url.domain IS NOT NULL, url.domain,
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
