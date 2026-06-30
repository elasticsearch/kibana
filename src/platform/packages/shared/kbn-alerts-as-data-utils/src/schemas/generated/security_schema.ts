/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
// ---------------------------------- WARNING ----------------------------------
// this file was generated, and should not be edited by hand
// ---------------------------------- WARNING ----------------------------------
import * as rt from 'io-ts';
import type { Either } from 'fp-ts/Either';
import { AlertSchema } from './alert_schema';
import { EcsSchema } from './ecs_schema';
import { LegacyAlertSchema } from './legacy_alert_schema';
const ISO_DATE_PATTERN = /^d{4}-d{2}-d{2}Td{2}:d{2}:d{2}.d{3}Z$/;
export const IsoDateString = new rt.Type<string, string, unknown>(
  'IsoDateString',
  rt.string.is,
  (input, context): Either<rt.Errors, string> => {
    if (typeof input === 'string' && ISO_DATE_PATTERN.test(input)) {
      return rt.success(input);
    } else {
      return rt.failure(input, context);
    }
  },
  rt.identity
);
export type IsoDateStringC = typeof IsoDateString;
export const schemaUnknown = rt.unknown;
export const schemaUnknownArray = rt.array(rt.unknown);
export const schemaString = rt.string;
export const schemaStringArray = rt.array(schemaString);
export const schemaNumber = rt.number;
export const schemaNumberArray = rt.array(schemaNumber);
export const schemaDate = rt.union([IsoDateString, schemaNumber]);
export const schemaDateArray = rt.array(schemaDate);
export const schemaDateRange = rt.partial({
  gte: schemaDate,
  lte: schemaDate,
});
export const schemaDateRangeArray = rt.array(schemaDateRange);
export const schemaStringOrNumber = rt.union([schemaString, schemaNumber]);
export const schemaStringOrNumberArray = rt.array(schemaStringOrNumber);
export const schemaBoolean = rt.boolean;
export const schemaBooleanArray = rt.array(schemaBoolean);
const schemaGeoPointCoords = rt.type({
  type: schemaString,
  coordinates: schemaNumberArray,
});
const schemaGeoPointString = schemaString;
const schemaGeoPointLatLon = rt.type({
  lat: schemaNumber,
  lon: schemaNumber,
});
const schemaGeoPointLocation = rt.type({
  location: schemaNumberArray,
});
const schemaGeoPointLocationString = rt.type({
  location: schemaString,
});
export const schemaGeoPoint = rt.union([
  schemaGeoPointCoords,
  schemaGeoPointString,
  schemaGeoPointLatLon,
  schemaGeoPointLocation,
  schemaGeoPointLocationString,
]);
export const schemaGeoPointArray = rt.array(schemaGeoPoint);
// prettier-ignore
const SecurityAlertRequired = rt.type({
  '@timestamp': schemaDate,
  'kibana.alert.ancestors': rt.array(
    rt.type({
      depth: schemaStringOrNumber,
      id: schemaString,
      index: schemaString,
      type: schemaString,
    })
  ),
  'kibana.alert.depth': schemaStringOrNumber,
  'kibana.alert.instance.id': schemaString,
  'kibana.alert.original_event.action': schemaString,
  'kibana.alert.original_event.category': schemaStringArray,
  'kibana.alert.original_event.created': schemaDate,
  'kibana.alert.original_event.dataset': schemaString,
  'kibana.alert.original_event.id': schemaString,
  'kibana.alert.original_event.ingested': schemaDate,
  'kibana.alert.original_event.kind': schemaString,
  'kibana.alert.original_event.module': schemaString,
  'kibana.alert.original_event.original': schemaString,
  'kibana.alert.original_event.outcome': schemaString,
  'kibana.alert.original_event.provider': schemaString,
  'kibana.alert.original_event.sequence': schemaStringOrNumber,
  'kibana.alert.original_event.type': schemaStringArray,
  'kibana.alert.original_time': schemaDate,
  'kibana.alert.rule.category': schemaString,
  'kibana.alert.rule.consumer': schemaString,
  'kibana.alert.rule.false_positives': schemaStringArray,
  'kibana.alert.rule.max_signals': schemaStringOrNumberArray,
  'kibana.alert.rule.name': schemaString,
  'kibana.alert.rule.producer': schemaString,
  'kibana.alert.rule.revision': schemaStringOrNumber,
  'kibana.alert.rule.rule_type_id': schemaString,
  'kibana.alert.rule.threat.framework': schemaString,
  'kibana.alert.rule.threat.tactic.id': schemaString,
  'kibana.alert.rule.threat.tactic.name': schemaString,
  'kibana.alert.rule.threat.tactic.reference': schemaString,
  'kibana.alert.rule.threat.technique.id': schemaString,
  'kibana.alert.rule.threat.technique.name': schemaString,
  'kibana.alert.rule.threat.technique.reference': schemaString,
  'kibana.alert.rule.threat.technique.subtechnique.id': schemaString,
  'kibana.alert.rule.threat.technique.subtechnique.name': schemaString,
  'kibana.alert.rule.threat.technique.subtechnique.reference': schemaString,
  'kibana.alert.rule.uuid': schemaString,
  'kibana.alert.status': schemaString,
  'kibana.alert.uuid': schemaString,
  'kibana.space_ids': schemaStringArray,
});
// prettier-ignore
const SecurityAlertOptional = rt.partial({
  'data_stream.dataset': schemaString,
  'data_stream.namespace': schemaString,
  'data_stream.type': schemaString,
  'ecs.version': schemaString,
  'event.action': schemaString,
  'event.kind': schemaString,
  'event.original': schemaString,
  'host.asset.criticality': schemaString,
  'kibana.alert.action_group': schemaString,
  'kibana.alert.ancestors.rule': schemaString,
  'kibana.alert.attack_ids': schemaStringArray,
  'kibana.alert.building_block_type': schemaString,
  'kibana.alert.case_ids': schemaStringArray,
  'kibana.alert.consecutive_matches': schemaStringOrNumber,
  'kibana.alert.duration.us': schemaStringOrNumber,
  'kibana.alert.end': schemaDate,
  'kibana.alert.flapping': schemaBoolean,
  'kibana.alert.flapping_history': schemaBooleanArray,
  'kibana.alert.group.id': schemaString,
  'kibana.alert.group.index': schemaNumber,
  'kibana.alert.host.criticality_level': schemaString,
  'kibana.alert.index_pattern': schemaString,
  'kibana.alert.intended_timestamp': schemaDate,
  'kibana.alert.last_detected': schemaDate,
  'kibana.alert.maintenance_window_ids': schemaStringArray,
  'kibana.alert.maintenance_window_names': schemaStringArray,
  'kibana.alert.muted': schemaBoolean,
  'kibana.alert.new_terms': schemaStringArray,
  'kibana.alert.original_data_stream.dataset': schemaString,
  'kibana.alert.original_data_stream.namespace': schemaString,
  'kibana.alert.original_data_stream.type': schemaString,
  'kibana.alert.original_event.agent_id_status': schemaString,
  'kibana.alert.original_event.code': schemaString,
  'kibana.alert.original_event.duration': schemaString,
  'kibana.alert.original_event.end': schemaDate,
  'kibana.alert.original_event.hash': schemaString,
  'kibana.alert.original_event.reason': schemaString,
  'kibana.alert.original_event.reference': schemaString,
  'kibana.alert.original_event.risk_score': schemaNumber,
  'kibana.alert.original_event.risk_score_norm': schemaNumber,
  'kibana.alert.original_event.severity': schemaStringOrNumber,
  'kibana.alert.original_event.start': schemaDate,
  'kibana.alert.original_event.timezone': schemaString,
  'kibana.alert.original_event.url': schemaString,
  'kibana.alert.pending_recovered_count': schemaStringOrNumber,
  'kibana.alert.previous_action_group': schemaString,
  'kibana.alert.reason': schemaString,
  'kibana.alert.risk_score': schemaNumber,
  'kibana.alert.rule.author': schemaString,
  'kibana.alert.rule.building_block_type': schemaString,
  'kibana.alert.rule.created_at': schemaDate,
  'kibana.alert.rule.created_by': schemaString,
  'kibana.alert.rule.description': schemaString,
  'kibana.alert.rule.enabled': schemaString,
  'kibana.alert.rule.execution.timestamp': schemaDate,
  'kibana.alert.rule.execution.type': schemaString,
  'kibana.alert.rule.execution.uuid': schemaString,
  'kibana.alert.rule.from': schemaString,
  'kibana.alert.rule.immutable': schemaStringArray,
  'kibana.alert.rule.interval': schemaString,
  'kibana.alert.rule.license': schemaString,
  'kibana.alert.rule.note': schemaString,
  'kibana.alert.rule.parameters': schemaUnknown,
  'kibana.alert.rule.references': schemaStringArray,
  'kibana.alert.rule.rule_id': schemaString,
  'kibana.alert.rule.rule_name_override': schemaString,
  'kibana.alert.rule.tags': schemaStringArray,
  'kibana.alert.rule.timeline_id': schemaStringArray,
  'kibana.alert.rule.timeline_title': schemaStringArray,
  'kibana.alert.rule.timestamp_override': schemaString,
  'kibana.alert.rule.to': schemaString,
  'kibana.alert.rule.type': schemaString,
  'kibana.alert.rule.updated_at': schemaDate,
  'kibana.alert.rule.updated_by': schemaString,
  'kibana.alert.rule.version': schemaString,
  'kibana.alert.scheduled_action.date': schemaString,
  'kibana.alert.scheduled_action.group': schemaString,
  'kibana.alert.severity': schemaString,
  'kibana.alert.severity_improving': schemaBoolean,
  'kibana.alert.snoozed': schemaBoolean,
  'kibana.alert.start': schemaDate,
  'kibana.alert.suppression.docs_count': schemaStringOrNumber,
  'kibana.alert.suppression.end': schemaDate,
  'kibana.alert.suppression.start': schemaDate,
  'kibana.alert.suppression.terms.field': schemaStringArray,
  'kibana.alert.suppression.terms.value': schemaStringArray,
  'kibana.alert.system_status': schemaString,
  'kibana.alert.threshold_result.cardinality': schemaUnknown,
  'kibana.alert.threshold_result.count': schemaStringOrNumber,
  'kibana.alert.threshold_result.from': schemaDate,
  'kibana.alert.threshold_result.terms': rt.array(
    rt.partial({
      field: schemaString,
      value: schemaString,
    })
  ),
  'kibana.alert.time_range': schemaDateRange,
  'kibana.alert.updated_at': schemaDate,
  'kibana.alert.updated_by.user.id': schemaString,
  'kibana.alert.updated_by.user.name': schemaString,
  'kibana.alert.url': schemaString,
  'kibana.alert.user.criticality_level': schemaString,
  'kibana.alert.workflow_assignee_ids': schemaStringArray,
  'kibana.alert.workflow_reason': schemaString,
  'kibana.alert.workflow_status': schemaString,
  'kibana.alert.workflow_status_updated_at': schemaDate,
  'kibana.alert.workflow_tags': schemaStringArray,
  'kibana.alert.workflow_user': schemaString,
  'kibana.cps_scope.expression': schemaString,
  'kibana.cps_scope.linked_projects': schemaUnknownArray,
  'kibana.version': schemaString,
  'service.asset.criticality': schemaString,
  'service.risk.calculated_level': schemaString,
  'service.risk.calculated_score_norm': schemaNumber,
  tags: schemaStringArray,
  'threat.enrichments': schemaUnknown,
  'user.asset.criticality': schemaString,
});

// prettier-ignore
export const SecurityAlertSchema = rt.intersection([SecurityAlertRequired, SecurityAlertOptional, AlertSchema, EcsSchema, LegacyAlertSchema]);
// prettier-ignore
export type SecurityAlert = rt.TypeOf<typeof SecurityAlertSchema>;
