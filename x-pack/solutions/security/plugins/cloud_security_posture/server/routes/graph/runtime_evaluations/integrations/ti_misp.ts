/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/naming-convention */

import type { IntegrationEvaluations } from "../types";

export const ti_mispEvaluations = {
  integration: "ti_misp",
  evaluations: [
    {
      id: "detection_flags",
      section: "Detection flags (mandatory \u2014 run first)",
      esql: `| EVAL
  actor_exists = user.id IS NOT NULL OR user.name IS NOT NULL
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
  user.id = CASE(
    user.id IS NOT NULL, user.id,
    data_stream.dataset IN ("ti_misp.threat", "ti_misp.threat_attributes") AND user.email IS NOT NULL, user.email,
    null
  ),
  user.name = CASE(
    user.name IS NOT NULL, user.name,
    data_stream.dataset IN ("ti_misp.threat", "ti_misp.threat_attributes") AND user.email IS NOT NULL, user.email,
    null
  ),
  entity.id = CASE(
    entity.id IS NOT NULL, entity.id,
    data_stream.dataset == "ti_misp.threat" AND user.email IS NULL AND misp.orgc.uuid IS NOT NULL, misp.orgc.uuid,
    data_stream.dataset == "ti_misp.threat_attributes" AND user.email IS NULL AND misp.event.orgc_id IS NOT NULL, TO_STRING(misp.event.orgc_id),
    null
  ),
  entity.name = CASE(
    entity.name IS NOT NULL, entity.name,
    data_stream.dataset == "ti_misp.threat" AND user.email IS NULL AND misp.orgc.name IS NOT NULL, misp.orgc.name,
    null
  ),
  entity.type = CASE(
    entity.type IS NOT NULL, entity.type,
    data_stream.dataset IN ("ti_misp.threat", "ti_misp.threat_attributes") AND user.email IS NOT NULL, "user",
    data_stream.dataset IN ("ti_misp.threat", "ti_misp.threat_attributes") AND user.email IS NULL, "organization",
    null
  ),
  entity.sub_type = CASE(
    entity.sub_type IS NOT NULL, entity.sub_type,
    data_stream.dataset IN ("ti_misp.threat", "ti_misp.threat_attributes") AND user.email IS NOT NULL, "reporting_user",
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset IN ("ti_misp.threat", "ti_misp.threat_attributes") AND misp.attribute.type IN ("url", "link", "uri") AND threat.indicator.url.domain IS NOT NULL, threat.indicator.url.domain,
    data_stream.dataset IN ("ti_misp.threat", "ti_misp.threat_attributes") AND threat.feed.name IS NOT NULL, threat.feed.name,
    null
  ),
  host.target.ip = CASE(
    host.target.ip IS NOT NULL, host.target.ip,
    data_stream.dataset IN ("ti_misp.threat", "ti_misp.threat_attributes") AND misp.attribute.type IN ("ip-src", "ip-dst", "ip-dst|port", "domain|ip") AND threat.indicator.ip IS NOT NULL, threat.indicator.ip,
    null
  ),
  host.target.name = CASE(
    host.target.name IS NOT NULL, host.target.name,
    data_stream.dataset IN ("ti_misp.threat", "ti_misp.threat_attributes") AND misp.attribute.type IN ("domain", "hostname", "domain|ip") AND threat.indicator.url.domain IS NOT NULL, threat.indicator.url.domain,
    null
  ),
  host.target.port = CASE(
    host.target.port IS NOT NULL, host.target.port,
    data_stream.dataset IN ("ti_misp.threat", "ti_misp.threat_attributes") AND misp.attribute.type == "ip-dst|port" AND threat.indicator.port IS NOT NULL, threat.indicator.port,
    null
  ),
  user.target.email = CASE(
    user.target.email IS NOT NULL, user.target.email,
    data_stream.dataset IN ("ti_misp.threat", "ti_misp.threat_attributes") AND misp.attribute.type IN ("email-src", "email-dst") AND threat.indicator.email.address IS NOT NULL, threat.indicator.email.address,
    null
  ),
  entity.target.id = CASE(
    entity.target.id IS NOT NULL, entity.target.id,
    data_stream.dataset IN ("ti_misp.threat", "ti_misp.threat_attributes") AND misp.attribute.type == "sha256" AND threat.indicator.file.hash.sha256 IS NOT NULL, threat.indicator.file.hash.sha256,
    data_stream.dataset IN ("ti_misp.threat", "ti_misp.threat_attributes") AND misp.attribute.type == "md5" AND threat.indicator.file.hash.md5 IS NOT NULL, threat.indicator.file.hash.md5,
    data_stream.dataset IN ("ti_misp.threat", "ti_misp.threat_attributes") AND misp.attribute.type IN ("sha1", "filename|sha1") AND threat.indicator.file.hash.sha1 IS NOT NULL, threat.indicator.file.hash.sha1,
    data_stream.dataset IN ("ti_misp.threat", "ti_misp.threat_attributes") AND misp.attribute.uuid IS NOT NULL, misp.attribute.uuid,
    null
  ),
  entity.target.name = CASE(
    entity.target.name IS NOT NULL, entity.target.name,
    data_stream.dataset IN ("ti_misp.threat", "ti_misp.threat_attributes") AND misp.attribute.type == "regkey" AND threat.indicator.registry.key IS NOT NULL, threat.indicator.registry.key,
    null
  ),
  entity.target.type = CASE(
    entity.target.type IS NOT NULL, entity.target.type,
    data_stream.dataset IN ("ti_misp.threat", "ti_misp.threat_attributes") AND misp.attribute.type IN ("ip-src", "ip-dst", "ip-dst|port", "domain|ip", "hostname", "domain"), "host",
    data_stream.dataset IN ("ti_misp.threat", "ti_misp.threat_attributes") AND misp.attribute.type IN ("email-src", "email-dst"), "user",
    data_stream.dataset IN ("ti_misp.threat", "ti_misp.threat_attributes") AND misp.attribute.type IN ("url", "link", "uri"), "service",
    data_stream.dataset IN ("ti_misp.threat", "ti_misp.threat_attributes") AND misp.attribute.type IN ("md5", "sha256", "sha1", "filename|sha256", "filename|sha1", "regkey"), "general",
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
