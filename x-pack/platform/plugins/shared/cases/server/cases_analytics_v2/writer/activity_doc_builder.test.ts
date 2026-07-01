/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { CASE_SAVED_OBJECT } from '../../../common/constants';
import { CONNECTOR_ID_REFERENCE_NAME } from '../../common/constants';
import { makeUserAction } from '../__test_helpers__';
import { buildActivityDoc } from './activity_doc_builder';

/**
 * Unit coverage for the pure user-action → analytics-doc transform.
 * The schema-drift suite (`mappings/activity_schema_drift.test.ts`)
 * asserts every emitted path is mapped; this suite asserts the *values*
 * are correct — scoping fields, actor projection, case-id resolution,
 * payload serialization, and the per-type curated extracts.
 */
describe('buildActivityDoc', () => {
  describe('scoping fields (DLS)', () => {
    it('derives space_id from the SO namespaces (non-default space)', () => {
      const doc = buildActivityDoc(makeUserAction('ua-1', { namespaces: ['security-1'] }));
      expect(doc.space_id).toBe('security-1');
    });

    it('falls back to "default" when namespaces is absent/empty', () => {
      const doc = buildActivityDoc(makeUserAction('ua-1', { namespaces: [] }));
      expect(doc.space_id).toBe('default');
    });

    it('emits owner at the document root for solution scoping', () => {
      const doc = buildActivityDoc(makeUserAction('ua-1', { owner: 'observability' }));
      expect(doc.owner).toBe('observability');
    });
  });

  describe('core projection', () => {
    it('maps created_at → @timestamp, action → action.verb, type → action.type', () => {
      const doc = buildActivityDoc(
        makeUserAction('ua-1', {
          type: 'status',
          action: 'update',
          createdAt: '2026-05-02T03:04:05.000Z',
          payload: { status: 'open' },
        })
      );
      expect(doc['@timestamp']).toBe('2026-05-02T03:04:05.000Z');
      expect(doc.action.type).toBe('status');
      expect(doc.action.verb).toBe('update');
    });

    it('resolves cases.id from the associated-cases reference', () => {
      const doc = buildActivityDoc(
        makeUserAction('ua-1', {
          references: [{ id: 'case-xyz', type: CASE_SAVED_OBJECT, name: 'associated-cases' }],
        })
      );
      expect(doc.cases.id).toBe('case-xyz');
    });

    it('sets cases.id to the empty string when no case reference is present (malformed SO)', () => {
      const doc = buildActivityDoc(makeUserAction('ua-1', { references: [] }));
      expect(doc.cases.id).toBe('');
    });

    it('projects created_by into actor.*', () => {
      const doc = buildActivityDoc(
        makeUserAction('ua-1', {
          createdBy: {
            username: 'bob',
            full_name: 'Bob',
            email: 'bob@e.com',
            profile_uid: 'p-9',
          },
        })
      );
      expect(doc.actor).toEqual({
        username: 'bob',
        full_name: 'Bob',
        email: 'bob@e.com',
        profile_uid: 'p-9',
      });
    });

    it('emits an empty actor object when created_by is null', () => {
      const doc = buildActivityDoc(makeUserAction('ua-1', { createdBy: null }));
      expect(doc.actor).toEqual({});
    });
  });

  describe('payload_json', () => {
    it('serializes the full payload as JSON', () => {
      const payload = { status: 'in-progress', extra: { nested: true } };
      const doc = buildActivityDoc(makeUserAction('ua-1', { type: 'status', payload }));
      expect(JSON.parse(doc.action.payload_json)).toEqual(payload);
    });

    it('returns an empty string for an empty payload', () => {
      const doc = buildActivityDoc(makeUserAction('ua-1', { payload: {} }));
      expect(doc.action.payload_json).toBe('{}');
    });
  });

  describe('curated extracts', () => {
    it('populates status_new only for status actions', () => {
      const doc = buildActivityDoc(
        makeUserAction('ua-1', { type: 'status', payload: { status: 'closed' } })
      );
      expect(doc.action.status_new).toBe('closed');
      expect(doc.action.severity_new).toBeUndefined();
    });

    it('populates severity_new only for severity actions', () => {
      const doc = buildActivityDoc(
        makeUserAction('ua-1', { type: 'severity', payload: { severity: 'critical' } })
      );
      expect(doc.action.severity_new).toBe('critical');
    });

    it('extracts assignee uids for assignees actions', () => {
      const doc = buildActivityDoc(
        makeUserAction('ua-1', {
          type: 'assignees',
          payload: { assignees: [{ uid: 'u-1' }, { uid: 'u-2' }, { notUid: 'x' }] },
        })
      );
      expect(doc.action.assignees_changed).toEqual(['u-1', 'u-2']);
    });

    it('omits assignees_changed when no valid uids are present', () => {
      const doc = buildActivityDoc(
        makeUserAction('ua-1', { type: 'assignees', payload: { assignees: [{ notUid: 'x' }] } })
      );
      expect(doc.action.assignees_changed).toBeUndefined();
    });

    it('extracts string tags for tags actions', () => {
      const doc = buildActivityDoc(
        makeUserAction('ua-1', { type: 'tags', payload: { tags: ['a', 'b', 42 as never] } })
      );
      expect(doc.action.tags_changed).toEqual(['a', 'b']);
    });

    it('resolves connector_id_new from references, not payload', () => {
      const doc = buildActivityDoc(
        makeUserAction('ua-1', {
          type: 'connector',
          payload: { connector: { name: 'jira', type: '.jira', fields: null } },
          references: [
            { id: 'case-1', type: CASE_SAVED_OBJECT, name: 'associated-cases' },
            { id: 'connector-42', type: 'action', name: CONNECTOR_ID_REFERENCE_NAME },
          ],
        })
      );
      expect(doc.action.connector_id_new).toBe('connector-42');
    });

    it('leaves curated extracts unset for a type that carries none (e.g. description)', () => {
      const doc = buildActivityDoc(
        makeUserAction('ua-1', { type: 'description', payload: { description: 'text' } })
      );
      expect(doc.action.status_new).toBeUndefined();
      expect(doc.action.severity_new).toBeUndefined();
      expect(doc.action.assignees_changed).toBeUndefined();
      expect(doc.action.tags_changed).toBeUndefined();
      expect(doc.action.connector_id_new).toBeUndefined();
    });
  });
});
