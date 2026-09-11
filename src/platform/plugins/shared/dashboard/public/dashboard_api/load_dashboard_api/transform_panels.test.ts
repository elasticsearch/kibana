/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Reference } from '@kbn/content-management-utils';
import { transformPanels } from './transform_panels';
import type { DashboardPanel, DashboardSection } from '@kbn/as-code-dashboard-schema';

describe('transformPanels', () => {
  const mockTransformOut = jest.fn();
  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../../services/kibana_services').embeddableService = {
      getLegacyURLTransform: async () => mockTransformOut,
    };
  });

  beforeEach(() => {
    mockTransformOut.mockReset();
  });

  test('should transform panels', async () => {
    mockTransformOut.mockImplementation((state: object, references?: Reference[]) => {
      return {
        savedObjectId: references?.[0]?.id,
      };
    });
    const panels = await transformPanels(
      [
        {
          grid: { x: 0, y: 0, w: 6, h: 6 },
          config: {},
          id: '1',
          type: 'testPanelType',
        },
        {
          title: 'Section One',
          collapsed: true,
          grid: {
            y: 6,
          },
          id: 'section1',
          panels: [
            {
              grid: { x: 0, y: 0, w: 6, h: 6 },
              config: {},
              id: '3',
              type: 'testPanelType',
            },
          ],
        },
      ],
      [
        {
          id: '1234',
          type: 'testPanelType',
          name: '1:savedObjectRef',
        },
        {
          id: '5678',
          type: 'testPanelType',
          name: '3:savedObjectRef',
        },
      ]
    );
    expect((panels[0] as DashboardPanel).config).toEqual({
      savedObjectId: '1234',
    });
    expect((panels[1] as DashboardSection).panels[0].config).toEqual({
      savedObjectId: '5678',
    });
  });

  test('should handle transformOut throw', async () => {
    mockTransformOut.mockImplementation((state: object, references?: Reference[]) => {
      throw new Error('Simulated transformOut error');
    });
    const panels = await transformPanels([
      {
        grid: { x: 0, y: 0, w: 6, h: 6 },
        config: { title: 'panel One' },
        id: '1',
        type: 'testPanelType',
      },
    ]);
    expect((panels[0] as DashboardPanel).config).toEqual({
      title: 'panel One',
    });
  });
});
