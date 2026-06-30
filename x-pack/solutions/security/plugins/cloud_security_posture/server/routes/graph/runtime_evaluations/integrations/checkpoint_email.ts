/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/naming-convention */

import type { IntegrationEvaluations } from "../types";

export const checkpoint_emailEvaluations = {
  integration: "checkpoint_email",
  evaluations: [
    {
      id: "detection_flags",
      section: "Detection flags (mandatory \u2014 run first)",
      esql: `| EVAL
  actor_exists = user.email IS NOT NULL OR user.name IS NOT NULL OR user.domain IS NOT NULL
    OR source.user.email IS NOT NULL OR source.user.name IS NOT NULL
    OR service.id IS NOT NULL OR service.name IS NOT NULL
    OR entity.id IS NOT NULL OR entity.name IS NOT NULL,
  target_exists = user.target.id IS NOT NULL OR user.target.name IS NOT NULL OR user.target.email IS NOT NULL
    OR host.target.id IS NOT NULL OR host.target.ip IS NOT NULL OR host.target.name IS NOT NULL
    OR service.target.id IS NOT NULL OR service.target.name IS NOT NULL
    OR entity.target.id IS NOT NULL OR entity.target.name IS NOT NULL OR entity.target.type IS NOT NULL,
  action_exists = event.action IS NOT NULL`,
    },
    {
      id: "actor",
      section: "Combined ES|QL \u2014 actor fields",
      esql: `| EVAL
  user.email = CASE(
    user.email IS NOT NULL, user.email,
    data_stream.dataset == "checkpoint_email.event" AND checkpoint_email.event.type IN ("phishing", "spam", "malware", "malicious_url", "suspicious_phishing", "dlp") AND source.user.email IS NOT NULL, source.user.email,
    data_stream.dataset == "checkpoint_email.event" AND checkpoint_email.event.type == "alert" AND destination.user.email IS NOT NULL, destination.user.email,
    null
  ),
  user.name = CASE(
    user.name IS NOT NULL, user.name,
    data_stream.dataset == "checkpoint_email.event" AND checkpoint_email.event.type IN ("phishing", "spam", "malware", "malicious_url", "suspicious_phishing", "dlp") AND source.user.name IS NOT NULL, source.user.name,
    data_stream.dataset == "checkpoint_email.event" AND checkpoint_email.event.type == "alert" AND destination.user.name IS NOT NULL, destination.user.name,
    null
  ),
  user.domain = CASE(
    user.domain IS NOT NULL, user.domain,
    data_stream.dataset == "checkpoint_email.event" AND checkpoint_email.event.type IN ("phishing", "spam", "malware", "malicious_url", "suspicious_phishing", "dlp") AND source.user.domain IS NOT NULL, source.user.domain,
    data_stream.dataset == "checkpoint_email.event" AND checkpoint_email.event.type == "alert" AND destination.user.domain IS NOT NULL, destination.user.domain,
    null
  )`,
    },
    {
      id: "event_action",
      section: "Combined ES|QL \u2014 event action",
      esql: `| EVAL
  event.action = CASE(
    event.action IS NOT NULL, event.action,
    data_stream.dataset == "checkpoint_email.event" AND checkpoint_email.event.type IS NOT NULL, checkpoint_email.event.type,
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  user.target.email = CASE(
    user.target.email IS NOT NULL, user.target.email,
    data_stream.dataset == "checkpoint_email.event" AND checkpoint_email.event.type IN ("phishing", "spam", "malware", "malicious_url", "suspicious_phishing") AND checkpoint_email.event.type != "alert" AND destination.user.email IS NOT NULL, destination.user.email,
    null
  ),
  user.target.name = CASE(
    user.target.name IS NOT NULL, user.target.name,
    data_stream.dataset == "checkpoint_email.event" AND checkpoint_email.event.type IN ("phishing", "spam", "malware", "malicious_url", "suspicious_phishing") AND checkpoint_email.event.type != "alert" AND destination.user.name IS NOT NULL, destination.user.name,
    null
  ),
  user.target.domain = CASE(
    user.target.domain IS NOT NULL, user.target.domain,
    data_stream.dataset == "checkpoint_email.event" AND checkpoint_email.event.type IN ("phishing", "spam", "malware", "malicious_url", "suspicious_phishing") AND checkpoint_email.event.type != "alert" AND destination.user.domain IS NOT NULL, destination.user.domain,
    null
  ),
  entity.target.id = CASE(
    entity.target.id IS NOT NULL, entity.target.id,
    data_stream.dataset == "checkpoint_email.event" AND checkpoint_email.event.entity_id IS NOT NULL, checkpoint_email.event.entity_id,
    null
  ),
  entity.target.name = CASE(
    entity.target.name IS NOT NULL, entity.target.name,
    data_stream.dataset == "checkpoint_email.event" AND email.subject IS NOT NULL, email.subject,
    null
  ),
  entity.target.type = CASE(
    entity.target.type IS NOT NULL, entity.target.type,
    data_stream.dataset == "checkpoint_email.event" AND checkpoint_email.event.type IN ("phishing", "spam", "malware", "malicious_url", "suspicious_phishing"), "user",
    data_stream.dataset == "checkpoint_email.event" AND checkpoint_email.event.type == "anomaly", "service",
    data_stream.dataset == "checkpoint_email.event" AND checkpoint_email.event.type == "shadow_it", "general",
    null
  ),
  entity.target.sub_type = CASE(
    entity.target.sub_type IS NOT NULL, entity.target.sub_type,
    data_stream.dataset == "checkpoint_email.event" AND checkpoint_email.event.type IN ("phishing", "spam", "malware", "malicious_url", "suspicious_phishing") AND destination.user.email IS NOT NULL, "email_recipient",
    null
  ),
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "checkpoint_email.event" AND checkpoint_email.event.type == "anomaly" AND checkpoint_email.event.saas IS NOT NULL, checkpoint_email.event.saas,
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
