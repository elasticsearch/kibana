/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  legacyTransformFindResponseToExternalModel,
  transformFindResponseToExternalModel,
} from './transform';
import { createSOFindResponse } from '../test_utils';
import {
  createUserActionFindSO,
  createConnectorUserAction,
  createUserActionSO,
  updateConnectorUserAction,
  pushConnectorUserAction,
  createCaseUserAction,
  createPersistableStateUserAction,
  createExternalReferenceUserAction,
  createUnifiedFileUserAction,
  testConnectorId,
} from './test_utils';
import type { SavedObjectsFindResponse } from '@kbn/core-saved-objects-api-server';
import type { ConnectorUserAction } from '../../../common/types/domain';
import { UserActionActions } from '../../../common/types/domain';
import { CASE_ATTACHMENT_SAVED_OBJECT } from '../../../common/constants';
import { CASE_ATTACHMENT_REF_NAME } from '../../common/constants';

describe('transform', () => {
  describe('action_id', () => {
    it('legacyTransformFindResponseToExternalModel sets action_id correctly to the saved object id', () => {
      const userAction = {
        ...createUserActionSO({ action: UserActionActions.create, commentId: '5' }),
      };

      const transformed = legacyTransformFindResponseToExternalModel(
        createSOFindResponse([createUserActionFindSO(userAction)])
      );

      expect(transformed.saved_objects[0].attributes.action_id).toEqual('100');
    });

    it('transformFindResponseToExternalModel does not set action_id', () => {
      const userAction = {
        ...createUserActionSO({ action: UserActionActions.create, commentId: '5' }),
      };

      const transformed = transformFindResponseToExternalModel(
        createSOFindResponse([createUserActionFindSO(userAction)])
      );

      expect(transformed.saved_objects[0].attributes).not.toHaveProperty('action_id');
    });
  });

  describe('case_id', () => {
    describe('legacyTransformFindResponseToExternalModel', () => {
      it('sets case_id correctly when it finds the reference', () => {
        const userAction = createConnectorUserAction();

        const transformed = legacyTransformFindResponseToExternalModel(
          createSOFindResponse([createUserActionFindSO(userAction)])
        );

        expect(transformed.saved_objects[0].attributes.case_id).toEqual('1');
      });

      it('sets case_id to an empty string when it cannot find the reference', () => {
        const userAction = {
          ...createConnectorUserAction(),
          references: [],
        };
        const transformed = legacyTransformFindResponseToExternalModel(
          createSOFindResponse([createUserActionFindSO(userAction)])
        );

        expect(transformed.saved_objects[0].attributes.case_id).toEqual('');
      });
    });

    describe('transformFindResponseToExternalModel', () => {
      it('does not set the case_id when the reference exists', () => {
        const userAction = createConnectorUserAction();

        const transformed = transformFindResponseToExternalModel(
          createSOFindResponse([createUserActionFindSO(userAction)])
        );

        expect(transformed.saved_objects[0].attributes).not.toHaveProperty('case_id');
      });

      it('does not set the case_id when the reference does not exist', () => {
        const userAction = {
          ...createConnectorUserAction(),
          references: [],
        };

        const transformed = transformFindResponseToExternalModel(
          createSOFindResponse([createUserActionFindSO(userAction)])
        );

        expect(transformed.saved_objects[0].attributes).not.toHaveProperty('case_id');
      });
    });
  });

  describe.each([
    [transformFindResponseToExternalModel.name, transformFindResponseToExternalModel],
    [legacyTransformFindResponseToExternalModel.name, legacyTransformFindResponseToExternalModel],
  ])('%s', (functionName, transformer) => {
    it('does not populate the ids when the response is an empty array', () => {
      expect(transformer(createSOFindResponse([]))).toMatchInlineSnapshot(`
        Object {
          "page": 1,
          "per_page": 0,
          "saved_objects": Array [],
          "total": 0,
        }
      `);
    });

    it('preserves the saved object fields and attributes when inject the ids', () => {
      const transformed = transformer(
        createSOFindResponse([createUserActionFindSO(createConnectorUserAction())])
      );

      expect(transformed).toMatchSnapshot();
    });

    it('populates the payload.connector.id for multiple user actions', () => {
      const transformed = transformer(
        createSOFindResponse([
          createUserActionFindSO(createConnectorUserAction()),
          createUserActionFindSO(createConnectorUserAction()),
        ])
      ) as SavedObjectsFindResponse<ConnectorUserAction>;

      expect(transformed.saved_objects[0].attributes.payload.connector.id).toEqual('1');
      expect(transformed.saved_objects[1].attributes.payload.connector.id).toEqual('1');
    });

    describe('reference ids', () => {
      it('sets comment_id to null when it cannot find the reference', () => {
        const userAction = {
          ...createUserActionSO({ action: UserActionActions.create, commentId: '5' }),
          references: [],
        };
        const transformed = transformer(createSOFindResponse([createUserActionFindSO(userAction)]));

        expect(transformed.saved_objects[0].attributes.comment_id).toBeNull();
      });

      it('sets comment_id correctly when it finds the reference', () => {
        const userAction = createUserActionSO({
          action: UserActionActions.create,
          commentId: '5',
        });

        const transformed = transformer(createSOFindResponse([createUserActionFindSO(userAction)]));

        expect(transformed.saved_objects[0].attributes.comment_id).toEqual('5');
      });

      it('sets comment_id correctly from a cases-attachments reference', () => {
        const userAction = createUserActionSO({
          action: UserActionActions.create,
          commentId: '5',
        });
        const transformed = transformer(
          createSOFindResponse([
            createUserActionFindSO({
              ...userAction,
              references: userAction.references.map((reference) =>
                reference.id === '5'
                  ? {
                      ...reference,
                      name: CASE_ATTACHMENT_REF_NAME,
                      type: CASE_ATTACHMENT_SAVED_OBJECT,
                    }
                  : reference
              ),
            }),
          ])
        );

        expect(transformed.saved_objects[0].attributes.comment_id).toEqual('5');
      });
    });

    describe('create connector', () => {
      const userAction = createConnectorUserAction();
      testConnectorId(userAction, 'connector.id');
    });

    describe('update connector', () => {
      const userAction = updateConnectorUserAction();
      testConnectorId(userAction, 'connector.id');
    });

    describe('push connector', () => {
      const userAction = pushConnectorUserAction();
      testConnectorId(userAction, 'externalService.connector_id', '100');
    });

    describe('create case', () => {
      const userAction = createCaseUserAction();
      testConnectorId(userAction, 'connector.id');
    });

    describe('persistable state attachments', () => {
      it('passes the persistable state through unchanged', () => {
        const transformed = transformer(
          createSOFindResponse([createUserActionFindSO(createPersistableStateUserAction())])
        ) as SavedObjectsFindResponse<ConnectorUserAction>;

        expect(transformed).toMatchSnapshot();
      });
    });

    describe('external references', () => {
      it('populates the external references attributes', () => {
        const transformed = transformer(
          createSOFindResponse([createUserActionFindSO(createExternalReferenceUserAction())])
        ) as SavedObjectsFindResponse<ConnectorUserAction>;

        expect(transformed).toMatchSnapshot();
      });
    });

    describe('unified SO-backed attachments', () => {
      it('passes attachmentId through from the persisted payload', () => {
        const transformed = transformer(
          createSOFindResponse([createUserActionFindSO(createUnifiedFileUserAction())])
        );

        const payload = transformed.saved_objects[0].attributes.payload as {
          comment: { attachmentId?: string };
        };
        expect(payload.comment.attachmentId).toEqual('file-so-id');
      });

      it('still surfaces attachmentId even if the references entry is missing (no inject required)', () => {
        const userAction = {
          ...createUnifiedFileUserAction(),
          references: [],
        };

        const transformed = transformer(createSOFindResponse([createUserActionFindSO(userAction)]));

        const payload = transformed.saved_objects[0].attributes.payload as {
          comment: { attachmentId?: string };
        };
        expect(payload.comment.attachmentId).toEqual('file-so-id');
      });

      it('falls back to an empty attachmentId when both payload and references are missing it', () => {
        const base = createUnifiedFileUserAction();
        const basePayload = base.attributes.payload as { comment: { attachmentId?: string } };
        const userAction = {
          ...base,
          attributes: {
            ...base.attributes,
            payload: {
              ...basePayload,
              comment: { ...basePayload.comment, attachmentId: '' },
            },
          },
          references: [],
        } as typeof base;

        const transformed = transformer(createSOFindResponse([createUserActionFindSO(userAction)]));

        const payload = transformed.saved_objects[0].attributes.payload as {
          comment: { attachmentId?: string };
        };
        expect(payload.comment.attachmentId).toEqual('');
      });
    });
  });
});
