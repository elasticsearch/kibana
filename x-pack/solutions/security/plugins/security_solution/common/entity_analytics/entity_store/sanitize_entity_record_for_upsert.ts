/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  Entity,
  EntityField,
  GenericEntity,
  HostEntity,
  ServiceEntity,
  UserEntity,
} from '@kbn/entity-store/common';
import {
  EntityRiskLevels,
  EntityRiskScoreRecord,
} from '../../api/entity_analytics/common/common.gen';
import { EntityType } from '../types';

const ALLOWED_ENTITY_ATTRIBUTE_KEYS = ['privileged', 'asset', 'managed', 'mfa_enabled'] as const;

const ALLOWED_ENTITY_BEHAVIOR_KEYS = [
  'brute_force_victim',
  'new_country_login',
  'used_usb_device',
] as const;

const ALLOWED_RELATIONSHIP_KEYS = [
  'communicates_with',
  'depends_on',
  'dependent_of',
  'owns',
  'owned_by',
  'accesses_frequently',
  'accessed_frequently_by',
  'supervises',
  'supervised_by',
] as const;

const FLAT_ENTITY_TYPE_KEY = 'entity.type';
const FLAT_ENTITY_ENGINE_TYPE_KEY = 'entity.EngineMetadata.Type';

const ENTITY_TYPE_DISPLAY_TO_ENUM: Record<string, EntityType> = {
  Host: EntityType.host,
  Identity: EntityType.user,
  Service: EntityType.service,
};

function pickBooleanFields<T extends readonly string[]>(
  source: Record<string, unknown>,
  keys: T
): Partial<Record<T[number], boolean>> | undefined {
  const out: Partial<Record<string, boolean>> = {};
  for (const key of keys) {
    if (key in source && typeof source[key] === 'boolean') {
      out[key] = source[key] as boolean;
    }
  }
  return Object.keys(out).length > 0 ? (out as Partial<Record<T[number], boolean>>) : undefined;
}

function sanitizeEntityAttributes(attributes: unknown): EntityField['attributes'] | undefined {
  if (!attributes || typeof attributes !== 'object') return undefined;
  return pickBooleanFields(attributes as Record<string, unknown>, ALLOWED_ENTITY_ATTRIBUTE_KEYS) as
    | EntityField['attributes']
    | undefined;
}

function sanitizeEntityBehaviors(behaviors: unknown): EntityField['behaviors'] | undefined {
  if (!behaviors || typeof behaviors !== 'object') return undefined;
  return pickBooleanFields(behaviors as Record<string, unknown>, ALLOWED_ENTITY_BEHAVIOR_KEYS) as
    | EntityField['behaviors']
    | undefined;
}

function sanitizeEntityLifecycle(lifecycle: unknown): EntityField['lifecycle'] | undefined {
  if (!lifecycle || typeof lifecycle !== 'object') return undefined;
  const l = lifecycle as Record<string, unknown>;
  const out: NonNullable<EntityField['lifecycle']> = {};
  if (typeof l.first_seen === 'string') out.first_seen = l.first_seen;
  if (typeof l.last_seen === 'string') out.last_seen = l.last_seen;
  if (typeof l.last_activity === 'string') out.last_activity = l.last_activity;
  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeEntityRelationships(
  relationships: unknown
): EntityField['relationships'] | undefined {
  if (!relationships || typeof relationships !== 'object') return undefined;
  const r = relationships as Record<string, unknown>;
  const out: NonNullable<EntityField['relationships']> = {};
  for (const key of ALLOWED_RELATIONSHIP_KEYS) {
    if (key in r) {
      const val = r[key];
      if (Array.isArray(val) && val.every((x) => typeof x === 'string')) {
        (out as Record<string, string[]>)[key] = val;
      }
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeEntityLevelRisk(risk: unknown): EntityField['risk'] | undefined {
  if (!risk || typeof risk !== 'object') return undefined;
  const r = risk as Record<string, unknown>;
  const out: NonNullable<EntityField['risk']> = {};
  const level = EntityRiskLevels.safeParse(r.calculated_level);
  if (level.success) {
    out.calculated_level = level.data;
  }
  if (typeof r.calculated_score === 'number') out.calculated_score = r.calculated_score;
  if (typeof r.calculated_score_norm === 'number')
    out.calculated_score_norm = r.calculated_score_norm;
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeRiskDocumentForSchema(risk: unknown): unknown {
  if (!risk || typeof risk !== 'object') return risk;
  const r = { ...(risk as Record<string, unknown>) };
  if (r.inputs != null && !Array.isArray(r.inputs)) {
    r.inputs = [r.inputs];
  }
  if (typeof r.notes === 'string') {
    r.notes = [r.notes];
  }
  return r;
}

function sanitizeHostUserServiceRisk(risk: unknown) {
  const parsed = EntityRiskScoreRecord.safeParse(normalizeRiskDocumentForSchema(risk));
  return parsed.success ? parsed.data : undefined;
}

/**
 * Builds a strict `EntityField` for upsert: drops EngineMetadata and keys not allowed by the API schema.
 */
function sanitizeEntityFieldFromUnknown(field: unknown): EntityField | undefined {
  if (!field || typeof field !== 'object') return undefined;
  const f = field as Record<string, unknown>;
  if (typeof f.id !== 'string') return undefined;

  const attributes = sanitizeEntityAttributes(f.attributes);
  const behaviors = sanitizeEntityBehaviors(f.behaviors);
  const lifecycle = sanitizeEntityLifecycle(f.lifecycle);
  const relationships = sanitizeEntityRelationships(f.relationships);
  const risk = sanitizeEntityLevelRisk(f.risk);

  return {
    id: f.id,
    ...(typeof f.name === 'string' && { name: f.name }),
    ...(typeof f.type === 'string' && { type: f.type }),
    ...(typeof f.sub_type === 'string' && { sub_type: f.sub_type }),
    ...(toArray(f.source) && { source: toArray(f.source) }),
    ...(attributes !== undefined && { attributes }),
    ...(behaviors !== undefined && { behaviors }),
    ...(lifecycle !== undefined && { lifecycle }),
    ...(relationships !== undefined && { relationships }),
    ...(risk !== undefined && { risk }),
  };
}

function toArray(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) {
    return value.every((x) => typeof x === 'string') ? value : undefined;
  }
  if (typeof value === 'string') return [value];
  return undefined;
}

function sanitizeHostForUpsert(host: Record<string, unknown>): HostEntity['host'] {
  const name = host.name;
  if (typeof name !== 'string') return { name: '' };
  const out: NonNullable<HostEntity['host']> = {
    name,
    ...(toArray(host.hostname) && { hostname: toArray(host.hostname) }),
    ...(toArray(host.domain) && { domain: toArray(host.domain) }),
    ...(toArray(host.ip) && { ip: toArray(host.ip) }),
    ...(toArray(host.id) && { id: toArray(host.id) }),
    ...(toArray(host.type) && { type: toArray(host.type) }),
    ...(toArray(host.mac) && { mac: toArray(host.mac) }),
    ...(toArray(host.architecture) && { architecture: toArray(host.architecture) }),
  };
  if (host.os != null && typeof host.os === 'object') {
    out.os = host.os as NonNullable<HostEntity['host']>['os'];
  }
  if (host.risk != null && typeof host.risk === 'object') {
    const normalizedRisk = sanitizeHostUserServiceRisk(host.risk);
    if (normalizedRisk) {
      out.risk = normalizedRisk;
    }
  }
  return out;
}

function sanitizeUserForUpsert(user: Record<string, unknown>): NonNullable<UserEntity['user']> {
  const name = user.name;
  if (typeof name !== 'string') return { name: '' };
  const out: NonNullable<UserEntity['user']> = {
    name,
    ...(toArray(user.id) && { id: toArray(user.id) }),
    ...(toArray(user.full_name) && { full_name: toArray(user.full_name) }),
    ...(toArray(user.domain) && { domain: toArray(user.domain) }),
    ...(toArray(user.roles) && { roles: toArray(user.roles) }),
    ...(toArray(user.email) && { email: toArray(user.email) }),
    ...(toArray(user.hash) && { hash: toArray(user.hash) }),
  };
  if (user.risk != null && typeof user.risk === 'object') {
    const normalizedRisk = sanitizeHostUserServiceRisk(user.risk);
    if (normalizedRisk) {
      out.risk = normalizedRisk;
    }
  }
  return out;
}

function sanitizeServiceForUpsert(
  service: Record<string, unknown>
): NonNullable<ServiceEntity['service']> {
  const name = service.name;
  if (typeof name !== 'string') return { name: '' };
  const out: NonNullable<ServiceEntity['service']> = { name };
  if (service.risk != null && typeof service.risk === 'object') {
    const normalizedRisk = sanitizeHostUserServiceRisk(service.risk);
    if (normalizedRisk) {
      out.risk = normalizedRisk;
    }
  }
  return out;
}

function sanitizeEventForUpsert(
  event: Record<string, unknown>
): NonNullable<UserEntity['event']> | undefined {
  if (typeof event.ingested !== 'string') {
    return undefined;
  }
  return { ingested: event.ingested };
}

function buildHostEntityForUpsert(entity: EntityField, raw: Record<string, unknown>): HostEntity {
  const event =
    raw.event != null && typeof raw.event === 'object'
      ? sanitizeEventForUpsert(raw.event as Record<string, unknown>)
      : undefined;

  return {
    entity,
    ...(raw.host != null &&
      typeof raw.host === 'object' && {
        host: sanitizeHostForUpsert(raw.host as Record<string, unknown>),
      }),
    ...(raw.asset != null &&
      typeof raw.asset === 'object' && {
        asset: raw.asset as HostEntity['asset'],
      }),
    ...(event && { event }),
  };
}

function buildUserEntityForUpsert(entity: EntityField, raw: Record<string, unknown>): UserEntity {
  const event =
    raw.event != null && typeof raw.event === 'object'
      ? sanitizeEventForUpsert(raw.event as Record<string, unknown>)
      : undefined;

  return {
    entity,
    ...(raw.user != null &&
      typeof raw.user === 'object' && {
        user: sanitizeUserForUpsert(raw.user as Record<string, unknown>),
      }),
    ...(raw.asset != null &&
      typeof raw.asset === 'object' && {
        asset: raw.asset as UserEntity['asset'],
      }),
    ...(event && { event }),
  };
}

function buildServiceEntityForUpsert(
  entity: EntityField,
  raw: Record<string, unknown>
): ServiceEntity {
  const event =
    raw.event != null && typeof raw.event === 'object'
      ? sanitizeEventForUpsert(raw.event as Record<string, unknown>)
      : undefined;

  return {
    entity,
    ...(raw.service != null &&
      typeof raw.service === 'object' && {
        service: sanitizeServiceForUpsert(raw.service as Record<string, unknown>),
      }),
    ...(raw.asset != null &&
      typeof raw.asset === 'object' && {
        asset: raw.asset as ServiceEntity['asset'],
      }),
    ...(event && { event }),
  };
}

function buildGenericEntityForUpsert(
  entity: EntityField,
  raw: Record<string, unknown>
): GenericEntity {
  return {
    entity,
    ...(raw.asset != null &&
      typeof raw.asset === 'object' && {
        asset: raw.asset as GenericEntity['asset'],
      }),
  };
}

export const getEntityType = (record: Entity): EntityType => {
  const recordAny = record as Record<string, unknown>;
  const rawType =
    record.entity?.EngineMetadata?.Type ??
    record.entity?.type ??
    recordAny[FLAT_ENTITY_ENGINE_TYPE_KEY] ??
    recordAny[FLAT_ENTITY_TYPE_KEY];

  if (!rawType || typeof rawType !== 'string') {
    throw new Error(`Unexpected entity: ${JSON.stringify(record)}`);
  }

  const normalized =
    ENTITY_TYPE_DISPLAY_TO_ENUM[rawType] ??
    (Object.values(EntityType).includes(rawType as EntityType)
      ? (rawType as EntityType)
      : undefined);
  if (normalized === undefined) {
    throw new Error(`Unexpected entity: ${JSON.stringify(record)}`);
  }

  return normalized;
};

/**
 * Returns a record that conforms to the Entity Store upsert API schema.
 * List/index documents can include extra fields (e.g. `agent`, `entity.EngineMetadata.UntypedId`,
 * or Elasticsearch-style `host.risk.inputs` as a single object). The upsert API uses a strict schema.
 */
export function sanitizeEntityRecordForUpsert(record: Entity): Entity {
  const raw = record as Record<string, unknown>;
  const entity = sanitizeEntityFieldFromUnknown(record.entity);

  if (!entity) {
    throw new Error('Entity record must have a valid entity field with id');
  }

  const entityType = getEntityType(record);

  if (entityType === EntityType.host) {
    return buildHostEntityForUpsert(entity, raw);
  }
  if (entityType === EntityType.user) {
    return buildUserEntityForUpsert(entity, raw);
  }
  if (entityType === EntityType.service) {
    return buildServiceEntityForUpsert(entity, raw);
  }
  return buildGenericEntityForUpsert(entity, raw);
}

/**
 * Normalizes bulk upsert JSON before Zod validation: `doc` → `record`, strips unknown ECS/API-mismatched
 * fields, and coerces host/user/service risk payloads into the shape expected by the API.
 */
export function preprocessUpsertEntitiesBulkRequestBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const b = body as { entities?: unknown };
  if (!Array.isArray(b.entities)) return body;

  return {
    ...b,
    entities: b.entities.map((row: unknown) => {
      if (!row || typeof row !== 'object') return row;
      const c = row as Record<string, unknown>;
      const record = c.record !== undefined ? c.record : c.doc;
      if (record === undefined) return row;

      let sanitizedRecord: unknown = record;
      try {
        sanitizedRecord = sanitizeEntityRecordForUpsert(record as Entity);
      } catch {
        // Leave as-is for Zod to surface a validation error
      }

      const next: Record<string, unknown> = { record: sanitizedRecord };
      if (c.type !== undefined) {
        next.type = c.type;
      }
      return next;
    }),
  };
}
