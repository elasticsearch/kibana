/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/naming-convention */

import type { IntegrationEvaluations } from "../types";

export const jamf_proEvaluations = {
  integration: "jamf_pro",
  evaluations: [
    {
      id: "detection_flags",
      section: "Detection flags (mandatory \u2014 run first)",
      esql: `| EVAL
  actor_exists = (user.name IS NOT NULL AND event.action == "RestAPIOperation")
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
    user.name IS NOT NULL AND event.action == "RestAPIOperation", user.name,
    data_stream.dataset == "jamf_pro.events" AND event.action == "RestAPIOperation", jamf_pro.events.event.authorized_username,
    null
  ),
  service.name = CASE(
    service.name IS NOT NULL, service.name,
    data_stream.dataset == "jamf_pro.events" AND event.action != "RestAPIOperation", "Jamf Pro",
    null
  )`,
    },
    {
      id: "target",
      section: "Combined ES|QL \u2014 target fields",
      esql: `| EVAL
  host.target.id = CASE(
    host.target.id IS NOT NULL, host.target.id,
    data_stream.dataset == "jamf_pro.events" AND host.id IS NOT NULL, host.id,
    data_stream.dataset == "jamf_pro.events" AND jamf_pro.events.event.udid IS NOT NULL, jamf_pro.events.event.udid,
    data_stream.dataset == "jamf_pro.events" AND event.action == "SCEPChallenge", jamf_pro.events.event.target_device.udid,
    null
  ),
  host.target.name = CASE(
    host.target.name IS NOT NULL, host.target.name,
    data_stream.dataset == "jamf_pro.events" AND host.name IS NOT NULL, host.name,
    data_stream.dataset == "jamf_pro.events" AND jamf_pro.events.event.device_name IS NOT NULL, jamf_pro.events.event.device_name,
    data_stream.dataset == "jamf_pro.events" AND event.action == "SCEPChallenge", jamf_pro.events.event.target_device.device_name,
    null
  ),
  host.target.ip = CASE(
    host.target.ip IS NOT NULL, host.target.ip,
    data_stream.dataset == "jamf_pro.events" AND host.ip IS NOT NULL, host.ip,
    null
  ),
  user.target.name = CASE(
    user.target.name IS NOT NULL, user.target.name,
    data_stream.dataset == "jamf_pro.events" AND event.action == "SCEPChallenge", jamf_pro.events.event.target_user.username,
    null
  ),
  user.target.email = CASE(
    user.target.email IS NOT NULL, user.target.email,
    data_stream.dataset == "jamf_pro.events" AND event.action == "SCEPChallenge", jamf_pro.events.event.target_user.email,
    null
  ),
  entity.target.id = CASE(
    entity.target.id IS NOT NULL, entity.target.id,
    data_stream.dataset == "jamf_pro.events" AND event.action == "RestAPIOperation", TO_STRING(jamf_pro.events.event.object_id),
    data_stream.dataset == "jamf_pro.events" AND event.action == "ComputerPolicyFinished", TO_STRING(jamf_pro.events.event.policy_id),
    data_stream.dataset == "jamf_pro.events" AND event.action IN ("SmartGroupComputerMembershipChange", "SmartGroupMobileDeviceMembershipChange", "SmartGroupUserMembershipChange"), TO_STRING(jamf_pro.events.event.jssid),
    data_stream.dataset == "jamf_pro.events" AND event.action == "DeviceAddedToDEP", jamf_pro.events.event.serial_number,
    data_stream.dataset == "jamf_pro.events" AND event.action == "ComputerPatchPolicyCompleted", TO_STRING(jamf_pro.events.event.patch_policy_id),
    null
  ),
  entity.target.name = CASE(
    entity.target.name IS NOT NULL, entity.target.name,
    data_stream.dataset == "jamf_pro.events" AND event.action == "RestAPIOperation", jamf_pro.events.event.object_name,
    data_stream.dataset == "jamf_pro.events" AND event.action IN ("SmartGroupComputerMembershipChange", "SmartGroupMobileDeviceMembershipChange", "SmartGroupUserMembershipChange"), jamf_pro.events.event.name,
    data_stream.dataset == "jamf_pro.events" AND event.action IN ("JSSStartup", "JSSShutdown"), jamf_pro.events.event.jss_url,
    null
  ),
  entity.target.sub_type = CASE(
    entity.target.sub_type IS NOT NULL, entity.target.sub_type,
    data_stream.dataset == "jamf_pro.events" AND event.action == "RestAPIOperation", jamf_pro.events.event.object_type_name,
    null
  )`,
    },
  ],
} as const satisfies IntegrationEvaluations;
