/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { DEFAULT_DASHBOARD_NAVIGATION_OPTIONS } from '@kbn/dashboard-navigation-options-common';
import { transformIn } from './transform_in';
import { DASHBOARD_LINK_TYPE } from '../../constants';

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValueOnce('fb1b3fc7-6e12-4542-bcf5-c61ad77241c5'),
}));

describe('transformIn', () => {
  test('should extract saved object reference from "by reference" state', () => {
    const byReferenceState = {
      title: 'Custom title',
      ref_id: '123',
    };
    expect(transformIn(byReferenceState)).toMatchInlineSnapshot(`
      Object {
        "references": Array [
          Object {
            "id": "123",
            "name": "savedObjectRef",
            "type": "links",
          },
        ],
        "state": Object {
          "title": "Custom title",
        },
      }
    `);
  });

  test('should extract dashboard references from "by value" state', () => {
    const byValueState = {
      title: 'Custom title',
      links: [
        {
          type: DASHBOARD_LINK_TYPE as typeof DASHBOARD_LINK_TYPE,
          destination: '19e149f0-e95e-404b-b6f8-fc751317c6be',
          options: DEFAULT_DASHBOARD_NAVIGATION_OPTIONS,
        },
      ],
    };
    expect(transformIn(byValueState)).toMatchInlineSnapshot(`
      Object {
        "references": Array [
          Object {
            "id": "19e149f0-e95e-404b-b6f8-fc751317c6be",
            "name": "link_fb1b3fc7-6e12-4542-bcf5-c61ad77241c5_dashboard",
            "type": "dashboard",
          },
        ],
        "state": Object {
          "links": Array [
            Object {
              "destinationRefName": "link_fb1b3fc7-6e12-4542-bcf5-c61ad77241c5_dashboard",
              "options": Object {
                "open_in_new_tab": false,
                "use_filters": true,
                "use_time_range": true,
              },
              "type": "dashboardLink",
            },
          ],
          "title": "Custom title",
        },
      }
    `);
  });
});
