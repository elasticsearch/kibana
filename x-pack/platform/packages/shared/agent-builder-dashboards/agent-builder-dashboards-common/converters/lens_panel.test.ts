/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import { LensConfigBuilder, type LensAttributes } from '@kbn/lens-embeddable-utils';
import type { DashboardAttachmentData } from '../types';
import { attachmentDataToDashboardState } from './from_attachment';
import { dashboardStateToAttachmentData } from './to_attachment';

const grid = { x: 0, y: 0, w: 24, h: 15 };

const metricApiConfig = {
  type: 'metric' as const,
  title: 'Attributes title',
  description: 'Attributes description',
  data_source: { type: 'esql' as const, query: 'FROM logs | STATS count = COUNT(*)' },
  metrics: [{ type: 'primary' as const, column: 'count' }],
  sampling: 1,
  ignore_global_filters: false,
};

const buildLensAttributes = (): LensAttributes =>
  new LensConfigBuilder().fromAPIFormat(metricApiConfig);

describe('Lens dashboard panel conversion — panel-level settings', () => {
  it('to_attachment preserves panel-level settings over attributes title/description', () => {
    const state = {
      panels: [
        {
          type: LENS_EMBEDDABLE_TYPE,
          id: 'p1',
          grid,
          config: {
            title: 'Panel title edited',
            description: 'Panel description edited',
            hide_title: true,
            hide_border: true,
            drilldowns: [{ id: 'd1' }],
            attributes: buildLensAttributes(),
          },
        },
      ],
    } as unknown as DashboardState;

    const attachmentData = dashboardStateToAttachmentData(state);
    const panel = attachmentData.panels[0] as {
      type: string;
      id: string;
      grid: typeof grid;
      config: Record<string, unknown>;
    };

    expect(panel.type).toBe(LENS_EMBEDDABLE_TYPE);
    expect(panel.id).toBe('p1');
    expect(panel.grid).toEqual(grid);
    expect(panel.config).toEqual(
      expect.objectContaining({
        title: 'Panel title edited',
        description: 'Panel description edited',
        hide_title: true,
        hide_border: true,
        drilldowns: [{ id: 'd1' }],
        type: 'metric',
      })
    );
    expect(panel.config).not.toHaveProperty('attributes');
  });

  it('to_attachment falls back to attributes title/description when panel-level ones are absent', () => {
    const state = {
      panels: [
        {
          type: LENS_EMBEDDABLE_TYPE,
          id: 'p1',
          grid,
          config: {
            attributes: buildLensAttributes(),
          },
        },
      ],
    } as unknown as DashboardState;

    const attachmentData = dashboardStateToAttachmentData(state);
    const panel = attachmentData.panels[0] as { config: Record<string, unknown> };

    expect(panel.config.title).toBe('Attributes title');
    expect(panel.config.description).toBe('Attributes description');
  });

  it('round-trips panel-level settings through dashboard state', () => {
    const attachmentPanel = {
      type: LENS_EMBEDDABLE_TYPE,
      id: 'p1',
      grid,
      config: {
        ...metricApiConfig,
        title: 'Panel title edited',
        description: 'Panel description edited',
        hide_title: true,
        hide_border: true,
        drilldowns: [{ id: 'd1' }],
      },
    };
    const attachmentData = {
      title: 'Dash',
      panels: [attachmentPanel],
    } as unknown as DashboardAttachmentData;

    const dashboardState = attachmentDataToDashboardState(attachmentData);
    const dashboardPanel = dashboardState.panels[0] as {
      type: string;
      config: Record<string, unknown>;
    };

    expect(dashboardPanel.type).toBe(LENS_EMBEDDABLE_TYPE);
    expect(dashboardPanel.config).toEqual(
      expect.objectContaining({
        title: 'Panel title edited',
        description: 'Panel description edited',
        hide_title: true,
        hide_border: true,
        drilldowns: [{ id: 'd1' }],
        attributes: expect.objectContaining({
          visualizationType: expect.any(String),
        }),
      })
    );

    const roundTripped = dashboardStateToAttachmentData(dashboardState);
    const roundTrippedPanel = roundTripped.panels[0] as { config: Record<string, unknown> };

    expect(roundTrippedPanel.config).toEqual(
      expect.objectContaining({
        title: 'Panel title edited',
        description: 'Panel description edited',
        hide_title: true,
        hide_border: true,
        drilldowns: [{ id: 'd1' }],
        type: 'metric',
      })
    );
  });
});
