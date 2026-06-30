/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
 

import type { IntegrationEvaluations } from "../types";

export const salesforceEvaluations = {
  integration: "salesforce",
  evaluations: [
    {
      id: "detection_flags",
      section: "Detection flags (mandatory \u2014 run first)",
      esql: `| EVAL
  actor_exists = user.id IS NOT NULL OR user.roles IS NOT NULL OR host.ip IS NOT NULL,
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
    data_stream.dataset == "salesforce.setupaudittrail", salesforce.setup_audit_trail.created_by_id,
    null
  ),
  user.name = CASE(
    user.name IS NOT NULL, user.name,
    data_stream.dataset IN ("salesforce.login", "salesforce.logout"), user.email,
    null
  ),
  host.ip = CASE(
    host.ip IS NOT NULL, host.ip,
    data_stream.dataset IN ("salesforce.login", "salesforce.logout", "salesforce.apex"), source.ip,
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  user.target.email = CASE(
    user.target.email IS NOT NULL, user.target.email,
    data_stream.dataset == "salesforce.setupaudittrail" AND salesforce.setup_audit_trail.display IS NOT NULL, user.email,
    null
  ),
  user.target.name = CASE(
    user.target.name IS NOT NULL, user.target.name,
    data_stream.dataset == "salesforce.setupaudittrail" AND salesforce.setup_audit_trail.display IS NOT NULL, user.name,
    null
  ),
  user.target.domain = CASE(
    user.target.domain IS NOT NULL, user.target.domain,
    data_stream.dataset == "salesforce.setupaudittrail" AND salesforce.setup_audit_trail.display IS NOT NULL, user.domain,
    null
  ),
  service.target.name = CASE(
    service.target.name IS NOT NULL, service.target.name,
    data_stream.dataset == "salesforce.login" AND event.action == "login-attempt" AND salesforce.login.application IS NOT NULL, salesforce.login.application,
    data_stream.dataset == "salesforce.login" AND event.action == "login-attempt", "Salesforce",
    data_stream.dataset == "salesforce.logout" AND event.action == "logout", "Salesforce",
    null
  ),
  service.target.id = CASE(
    service.target.id IS NOT NULL, service.target.id,
    data_stream.dataset == "salesforce.apex" AND event.action == "apex-trigger", salesforce.apex.trigger_id,
    null
  ),
  entity.target.name = CASE(
    entity.target.name IS NOT NULL, entity.target.name,
    data_stream.dataset == "salesforce.login" AND event.action == "login-attempt", event.url,
    data_stream.dataset == "salesforce.apex" AND event.action == "apex-callout", event.url,
    data_stream.dataset == "salesforce.apex" AND event.action == "apex-external-custom-callout" AND salesforce.apex.entity IS NOT NULL, salesforce.apex.entity,
    data_stream.dataset == "salesforce.apex" AND event.action IN ("apex-soap", "apex-rest", "apex-execution") AND salesforce.apex.class_name IS NOT NULL, salesforce.apex.class_name,
    data_stream.dataset == "salesforce.apex" AND event.action == "apex-trigger" AND salesforce.apex.trigger_name IS NOT NULL, salesforce.apex.trigger_name,
    data_stream.dataset == "salesforce.apex" AND salesforce.apex.entity_name IS NOT NULL, salesforce.apex.entity_name,
    null
  ),
  entity.target.type = CASE(
    entity.target.type IS NOT NULL, entity.target.type,
    data_stream.dataset == "salesforce.login" AND event.action == "login-attempt", "service",
    data_stream.dataset == "salesforce.setupaudittrail" AND salesforce.setup_audit_trail.section == "Manage Users", "user",
    data_stream.dataset == "salesforce.setupaudittrail" AND salesforce.setup_audit_trail.section == "Connected Apps", "connected_app",
    data_stream.dataset == "salesforce.apex" AND event.action IN ("apex-callout", "apex-external-custom-callout"), "URL",
    data_stream.dataset == "salesforce.apex" AND event.action == "apex-trigger", "apex_artifact",
    data_stream.dataset == "salesforce.apex" AND event.action IN ("apex-soap", "apex-rest", "apex-execution"), "apex_artifact",
    null
  ),
  entity.target.sub_type = CASE(
    entity.target.sub_type IS NOT NULL, entity.target.sub_type,
    data_stream.dataset == "salesforce.login" AND event.action == "login-attempt" AND salesforce.login.application IS NOT NULL, "connected_app",
    data_stream.dataset == "salesforce.setupaudittrail", salesforce.setup_audit_trail.section,
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
