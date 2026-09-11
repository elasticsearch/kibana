/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z } from '@kbn/zod';
import { stripUnmappedKeys } from './scope_tooling';
import type { DashboardState } from '@kbn/as-code-dashboard-schema';

const mockGetTransforms = jest.fn();

beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('../kibana_services').embeddableService = {
    getTransforms: mockGetTransforms,
  };
});

beforeEach(() => {
  mockGetTransforms.mockReset();
});

describe('stripUnmappedKeys', () => {
  it('should validate pinned panel types', () => {
    mockGetTransforms.mockImplementation((type: string) => {
      if (type === 'typeWithSchema' || type === 'pinnedTypeWithSchema') {
        return {
          schema: z.any(),
        };
      }
    });

    const dashboardState = {
      title: 'my dashboard',
      panels: [
        {
          config: {
            foo: 'some value',
          },
          grid: {
            h: 15,
            w: 24,
            x: 0,
            y: 0,
          },
          type: 'typeWithSchema',
          id: 'panel1',
        },
      ],
      pinned_panels: [
        {
          config: {
            data_view_id: 'dv1',
            field_name: 'field1',
          },
          grow: false,
          id: 'pinned1',
          type: 'pinnedTypeWithSchema',
          width: 'small',
        },
        {
          config: {
            data_view_id: 'dv1',
            field_name: 'field2',
          },
          grow: false,
          id: 'pinned2',
          type: 'pinnedTypeWithoutSchema',
          width: 'small',
        },
      ],
    };

    expect(stripUnmappedKeys(dashboardState as unknown as Partial<DashboardState>))
      .toMatchInlineSnapshot(`
      Object {
        "data": Object {
          "panels": Array [
            Object {
              "config": Object {
                "foo": "some value",
              },
              "grid": Object {
                "h": 15,
                "w": 24,
                "x": 0,
                "y": 0,
              },
              "id": "panel1",
              "type": "typeWithSchema",
            },
          ],
          "pinned_panels": Array [
            Object {
              "config": Object {
                "data_view_id": "dv1",
                "field_name": "field1",
              },
              "grow": false,
              "id": "pinned1",
              "type": "pinnedTypeWithSchema",
              "width": "small",
            },
          ],
          "title": "my dashboard",
        },
        "warnings": Array [
          Object {
            "message": "Panel schema not available for panel type: pinnedTypeWithoutSchema. Panels without schemas are not supported by dashboard REST endpoints",
            "panel_config": Object {
              "data_view_id": "dv1",
              "field_name": "field2",
            },
            "panel_type": "pinnedTypeWithoutSchema",
            "type": "dropped_panel",
          },
        ],
      }
    `);
  });

  it('should not drop mapped panel types', () => {
    mockGetTransforms.mockImplementation(() => {
      return {
        schema: z.object({
          foo: z.string(),
        }),
      };
    });
    const dashboardState = {
      title: 'my dashboard',
      panels: [
        {
          config: {
            foo: 'some value',
          },
          grid: {
            h: 15,
            w: 24,
            x: 0,
            y: 0,
          },
          type: 'typeWithSchema',
        },
      ],
    };
    expect(stripUnmappedKeys(dashboardState)).toMatchInlineSnapshot(`
      Object {
        "data": Object {
          "panels": Array [
            Object {
              "config": Object {
                "foo": "some value",
              },
              "grid": Object {
                "h": 15,
                "w": 24,
                "x": 0,
                "y": 0,
              },
              "type": "typeWithSchema",
            },
          ],
          "title": "my dashboard",
        },
        "warnings": Array [],
      }
    `);
  });

  it('should drop unmapped panel types', () => {
    const dashboardState = {
      title: 'my dashboard',
      panels: [
        {
          config: {
            foo: 'some value',
          },
          grid: {
            h: 15,
            w: 24,
            x: 0,
            y: 0,
          },
          type: 'typeWithoutSchema',
          id: '12345',
        },
      ],
    };
    expect(stripUnmappedKeys(dashboardState)).toMatchInlineSnapshot(`
      Object {
        "data": Object {
          "panels": Array [],
          "title": "my dashboard",
        },
        "warnings": Array [
          Object {
            "message": "Panel schema not available for panel type: typeWithoutSchema. Panels without schemas are not supported by dashboard REST endpoints",
            "panel_config": Object {
              "foo": "some value",
            },
            "panel_type": "typeWithoutSchema",
            "type": "dropped_panel",
          },
        ],
      }
    `);
  });

  it('should drop unmapped panel types when throwOnUnmappedPanel throws', () => {
    mockGetTransforms.mockImplementation(() => {
      return {
        schema: z.any(),
        throwOnUnmappedPanel: () => {
          throw new Error('Unmapped panel type');
        },
      };
    });
    const dashboardState = {
      title: 'my dashboard',
      panels: [
        {
          config: {
            foo: 'some value',
          },
          grid: {
            h: 15,
            w: 24,
            x: 0,
            y: 0,
          },
          type: 'typeWithSchema',
          id: '12345',
        },
      ],
    };
    expect(stripUnmappedKeys(dashboardState)).toMatchInlineSnapshot(`
      Object {
        "data": Object {
          "panels": Array [],
          "title": "my dashboard",
        },
        "warnings": Array [
          Object {
            "message": "Unmapped panel type",
            "panel_config": Object {
              "foo": "some value",
            },
            "panel_type": "typeWithSchema",
            "type": "dropped_panel",
          },
        ],
      }
    `);
  });
});
