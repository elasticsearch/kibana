/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  SECURITY_ENDPOINT_ATTACHMENT_TYPE,
  SECURITY_EVENT_ATTACHMENT_TYPE,
  INDICATOR_ATTACHMENT_TYPE,
  SECURITY_ENTITY_ATTACHMENT_TYPE,
  SECURITY_TIMELINE_ATTACHMENT_TYPE,
} from '@kbn/cases-plugin/common';
import type { ExperimentalFeatures } from '../../../common/experimental_features';

import { registerCaseAttachments } from './register';
import { EndpointAttachmentPayloadSchema } from '../../../common/cases/attachments/endpoint';
import { TimelineAttachmentPayloadSchema } from '../../../common/cases/attachments/timeline';
import { SecurityEventAttachmentPayloadSchema } from '../../../common/cases/attachments/event';
import { EntityAttachmentPayloadSchema } from '../../../common/cases/attachments/entity';
import { EntityType } from '@kbn/entity-store/common';

// Reproduces the path:message summary that `parseUnifiedAttachmentWithSchema`
// in `@kbn/cases-plugin` builds at the write boundary. Keeping this assertion
// here proves the security.* schemas surface structured (badRequest-ready)
// errors instead of leaking raw ZodErrors as 500s.
const formatZodIssues = (issues: Array<{ path: PropertyKey[]; message: string }>) =>
  issues
    .map(({ path, message }) => `${path.length > 0 ? path.join('.') : '(root)'}: ${message}`)
    .join('; ');

describe('registerCaseAttachments', () => {
  const experimentalFeatures: ExperimentalFeatures = {
    entityAttachmentsEnabled: false,
  } as ExperimentalFeatures;

  const buildFramework = () => ({
    registerExternalReference: jest.fn(),
    registerPersistableState: jest.fn(),
    registerUnified: jest.fn(),
  });

  it('registers the unified security.endpoint attachment with the zod payload schema', () => {
    const framework = buildFramework();

    registerCaseAttachments(framework, experimentalFeatures);

    expect(framework.registerUnified).toHaveBeenCalledWith({
      id: SECURITY_ENDPOINT_ATTACHMENT_TYPE,
      schema: EndpointAttachmentPayloadSchema,
    });
  });

  it('registers the unified security.event attachment with the zod payload schema', () => {
    const framework = buildFramework();

    registerCaseAttachments(framework, experimentalFeatures);

    expect(framework.registerUnified).toHaveBeenCalledWith({
      id: SECURITY_EVENT_ATTACHMENT_TYPE,
      schema: SecurityEventAttachmentPayloadSchema,
    });
  });

  it('registers the unified security.indicator attachment type with the zod schema', () => {
    const framework = buildFramework();

    registerCaseAttachments(framework, experimentalFeatures);

    expect(framework.registerUnified).toHaveBeenCalledWith(
      expect.objectContaining({
        id: INDICATOR_ATTACHMENT_TYPE,
        schema: expect.anything(),
      })
    );
  });

  it('registers the unified security.timeline attachment with the zod payload schema', () => {
    const framework = buildFramework();

    registerCaseAttachments(framework, experimentalFeatures);

    expect(framework.registerUnified).toHaveBeenCalledWith({
      id: SECURITY_TIMELINE_ATTACHMENT_TYPE,
      schema: TimelineAttachmentPayloadSchema,
    });
  });

  it('registers the unified security.entity attachment with the zod payload schema when enabled', () => {
    const framework = buildFramework();

    registerCaseAttachments(framework, {
      ...experimentalFeatures,
      entityAttachmentsEnabled: true,
    } as ExperimentalFeatures);

    expect(framework.registerUnified).toHaveBeenCalledWith({
      id: SECURITY_ENTITY_ATTACHMENT_TYPE,
      schema: EntityAttachmentPayloadSchema,
    });
  });

  it('does not register the unified security.entity attachment when disabled', () => {
    const framework = buildFramework();

    registerCaseAttachments(framework, experimentalFeatures);

    expect(framework.registerUnified).not.toHaveBeenCalledWith(
      expect.objectContaining({
        id: SECURITY_ENTITY_ATTACHMENT_TYPE,
      })
    );
  });

  // The cases-plugin routes inbound `externalReferenceAttachmentTypeId: 'endpoint'`
  // payloads through `EXTERNAL_REFERENCE_TYPE_MAP` -> 'security.endpoint' at the
  // validator boundary, so the unified registration above is sufficient for
  // back-compat. No external-reference registration is required.
  it('does not register any external-reference attachment types', () => {
    const framework = buildFramework();

    registerCaseAttachments(framework, experimentalFeatures);

    expect(framework.registerExternalReference).not.toHaveBeenCalled();
  });

  it('does not register any persistable-state attachment types', () => {
    const framework = buildFramework();

    registerCaseAttachments(framework, experimentalFeatures);

    expect(framework.registerPersistableState).not.toHaveBeenCalled();
  });

  describe('invalid payload surfacing', () => {
    it('reports `path: message` zod issues for an invalid security.event payload', () => {
      const result = SecurityEventAttachmentPayloadSchema.safeParse({
        type: SECURITY_EVENT_ATTACHMENT_TYPE,
        owner: 'securitySolution',
        attachmentId: 'event-1',
        metadata: { index: 123 },
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(formatZodIssues(result.error.issues)).toContain('metadata.index');
      }
    });

    it('reports `path: message` zod issues for an invalid security.endpoint payload', () => {
      const result = EndpointAttachmentPayloadSchema.safeParse({
        type: SECURITY_ENDPOINT_ATTACHMENT_TYPE,
        owner: 'securitySolution',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(formatZodIssues(result.error.issues)).not.toHaveLength(0);
      }
    });

    it('accepts a valid security.entity payload', () => {
      const result = EntityAttachmentPayloadSchema.safeParse({
        type: SECURITY_ENTITY_ATTACHMENT_TYPE,
        owner: 'securitySolution',
        attachmentId: 'entity-1',
        metadata: {
          entityName: 'alice',
          entityType: 'user',
        },
      });

      expect(result.success).toBe(true);
    });

    it.each(EntityType.options)(
      'accepts each entityType enum value for security.entity payload: %s',
      (entityType) => {
        const result = EntityAttachmentPayloadSchema.safeParse({
          type: SECURITY_ENTITY_ATTACHMENT_TYPE,
          owner: 'securitySolution',
          attachmentId: 'entity-1',
          metadata: {
            entityName: 'test-entity',
            entityType,
          },
        });

        expect(result.success).toBe(true);
      }
    );

    it('reports `path: message` zod issues for invalid security.entity enum value', () => {
      const result = EntityAttachmentPayloadSchema.safeParse({
        type: SECURITY_ENTITY_ATTACHMENT_TYPE,
        owner: 'securitySolution',
        attachmentId: 'entity-1',
        metadata: {
          entityName: 'alice',
          entityType: 'team',
        },
      });

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(formatZodIssues(result.error.issues)).toContain('metadata.entityType');
      }
    });

    it('reports `path: message` zod issues for security.entity payloads with extra fields', () => {
      const result = EntityAttachmentPayloadSchema.safeParse({
        type: SECURITY_ENTITY_ATTACHMENT_TYPE,
        owner: 'securitySolution',
        attachmentId: 'entity-1',
        metadata: {
          entityName: 'alice',
          entityType: 'user',
          extraField: 'not-allowed',
        },
      });

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(formatZodIssues(result.error.issues)).toContain('metadata');
      }
    });
  });
});
