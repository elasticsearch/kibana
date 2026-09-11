/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import { VISUALIZE_EMBEDDABLE_TYPE } from '@kbn/visualizations-common';
import { buildVegaSavedVis, VEGA_VIS_TYPE } from '@kbn/agent-builder-visualizations-common';
import type { DashboardAttachmentData } from '../types';
import { attachmentDataToDashboardState } from './from_attachment';
import { dashboardStateToAttachmentData } from './to_attachment';

const SPEC = JSON.stringify(
  { $schema: 'https://vega.github.io/schema/vega-lite/v6.json', mark: 'bar' },
  null,
  2
);
const MINIFIED_SPEC = '{"$schema":"https://vega.github.io/schema/vega-lite/v6.json","mark":"bar"}';
const grid = { x: 0, y: 0, w: 24, h: 15 };

describe('Vega dashboard panel conversion (temporary legacy-vis bridge)', () => {
  it('from_attachment expands a `vega` attachment panel into a by-value legacy-vis panel', () => {
    const attachmentData = {
      title: 'Dash',
      panels: [
        {
          type: VEGA_VIS_TYPE,
          id: 'p1',
          grid,
          config: { spec: SPEC, title: 'Chart', description: 'Desc' },
        },
      ],
    } as unknown as DashboardAttachmentData;

    const state = attachmentDataToDashboardState(attachmentData);

    expect(state.panels).toEqual([
      {
        type: VISUALIZE_EMBEDDABLE_TYPE,
        id: 'p1',
        grid,
        config: {
          title: 'Chart',
          description: 'Desc',
          savedVis: buildVegaSavedVis({ spec: SPEC, title: 'Chart', description: 'Desc' }),
        },
      },
    ]);
  });

  it('to_attachment normalizes a by-value legacy-vis Vega panel to the `vega` API shape, re-indenting a compact spec', () => {
    const state = {
      panels: [
        {
          type: VISUALIZE_EMBEDDABLE_TYPE,
          id: 'p1',
          grid,
          config: {
            savedVis: buildVegaSavedVis({
              spec: MINIFIED_SPEC,
              title: 'Chart',
              description: 'Desc',
            }),
          },
        },
      ],
    } as unknown as DashboardState;

    const attachmentData = dashboardStateToAttachmentData(state);

    expect(attachmentData.panels).toEqual([
      {
        type: VEGA_VIS_TYPE,
        id: 'p1',
        grid,
        config: { spec: SPEC, title: 'Chart', description: 'Desc' },
      },
    ]);
  });

  it('round-trips a `vega` attachment panel through dashboard state unchanged', () => {
    const attachmentPanel = {
      type: VEGA_VIS_TYPE,
      id: 'p1',
      grid,
      config: { spec: SPEC, title: 'Chart', description: 'Desc' },
    };
    const attachmentData = {
      title: 'Dash',
      panels: [attachmentPanel],
    } as unknown as DashboardAttachmentData;

    const roundTripped = dashboardStateToAttachmentData(
      attachmentDataToDashboardState(attachmentData)
    );

    expect(roundTripped.panels).toEqual([attachmentPanel]);
  });

  it('to_attachment preserves panel-level settings (title, description, hide_*, drilldowns) over savedVis values', () => {
    const state = {
      panels: [
        {
          type: VISUALIZE_EMBEDDABLE_TYPE,
          id: 'p1',
          grid,
          config: {
            title: 'Panel title edited',
            description: 'Panel description edited',
            hide_title: true,
            hide_border: true,
            drilldowns: [{ id: 'd1' }],
            savedVis: buildVegaSavedVis({
              spec: MINIFIED_SPEC,
              title: 'Original savedVis title',
              description: 'Original savedVis description',
            }),
          },
        },
      ],
    } as unknown as DashboardState;

    const attachmentData = dashboardStateToAttachmentData(state);

    expect(attachmentData.panels).toEqual([
      {
        type: VEGA_VIS_TYPE,
        id: 'p1',
        grid,
        config: {
          title: 'Panel title edited',
          description: 'Panel description edited',
          hide_title: true,
          hide_border: true,
          drilldowns: [{ id: 'd1' }],
          spec: SPEC,
        },
      },
    ]);
  });

  it('round-trips panel-level settings through dashboard state', () => {
    const attachmentPanel = {
      type: VEGA_VIS_TYPE,
      id: 'p1',
      grid,
      config: {
        spec: SPEC,
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

    expect(dashboardState.panels).toEqual([
      {
        type: VISUALIZE_EMBEDDABLE_TYPE,
        id: 'p1',
        grid,
        config: {
          title: 'Panel title edited',
          description: 'Panel description edited',
          hide_title: true,
          hide_border: true,
          drilldowns: [{ id: 'd1' }],
          savedVis: buildVegaSavedVis({
            spec: SPEC,
            title: 'Panel title edited',
            description: 'Panel description edited',
          }),
        },
      },
    ]);

    expect(dashboardStateToAttachmentData(dashboardState).panels).toEqual([attachmentPanel]);
  });
});
