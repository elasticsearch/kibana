/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DrilldownTransforms } from '@kbn/embeddable-plugin/common';
import { createEmbeddableSetupMock } from '@kbn/embeddable-plugin/server/mocks';
import { registerOptionsListControlTransforms } from './options_list_control_transforms';

const REF_NAME = 'test-data-view';

const baseState = {
  dataViewRefName: REF_NAME,
  field_name: 'test',
  title: 'Test',
};

const panelReferences = [{ name: REF_NAME, type: 'index-pattern', id: 'data-view-id' }];

const getTransforms = () => {
  const embeddable = createEmbeddableSetupMock();
  registerOptionsListControlTransforms(embeddable);

  const [, transformsSetup] = embeddable.registerEmbeddableServerDefinition.mock.calls[0];
  const { transformOut, transformIn } = transformsSetup.getTransforms!({} as DrilldownTransforms);
  return { transformOut: transformOut!, transformIn: transformIn! };
};

describe('options list control transforms', () => {
  const { transformOut } = getTransforms();

  describe('transformOut', () => {
    it('omits null values while keeping non-null values', () => {
      const result = transformOut(
        {
          ...baseState,
          exclude: true,
          sort: null,
          existsSelected: null,
          runPastTimeout: null,
          searchTechnique: 'prefix',
          selectedOptions: ['val'],
          singleSelect: null,
          title: null,
        },
        panelReferences,
        undefined,
        undefined
      );

      expect(result).toMatchInlineSnapshot(`
        Object {
          "data_view_id": "data-view-id",
          "exclude": true,
          "field_name": "test",
          "ignore_validations": false,
          "search_technique": "prefix",
          "selected_options": Array [
            "val",
          ],
          "use_global_filters": true,
          "values_source": "field",
        }
      `);
    });

    it('falls back to a data view id stored explicitly in state if no reference can be found', () => {
      const result = transformOut(
        {
          ...baseState,
          dataViewRefName: 'broken',
          dataViewId: 'data-view-id',
        },
        panelReferences,
        undefined,
        undefined
      );

      expect(result).toMatchInlineSnapshot(`
        Object {
          "data_view_id": "data-view-id",
          "field_name": "test",
          "ignore_validations": false,
          "title": "Test",
          "use_global_filters": true,
          "values_source": "field",
        }
      `);
    });

    it('throws on empty required fields', () => {
      expect(() =>
        transformOut({
          data_view_id: '',
        })
      ).toThrow('Must include a non-empty data view ID');
      expect(() =>
        transformOut({
          data_view_id: 'test',
          field_name: '',
        })
      ).toThrow('Must include a non-empty field name');
    });
  });
});
