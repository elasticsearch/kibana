/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import $ from 'jquery';
import type { RefObject } from 'react';
import React from 'react';

import { toMountPoint } from '@kbn/react-kibana-mount';
import type { ChartsPluginSetup } from '@kbn/charts-plugin/public';
import type { PersistedState } from '@kbn/visualizations-plugin/public';
import type { IInterpreterRenderHandlers } from '@kbn/expressions-plugin/public';
import type { CoreStart } from '@kbn/core/public';
import type { VisTypeVislibCoreSetup } from './plugin';
import { VisLegend, CUSTOM_LEGEND_VIS_TYPES } from './vislib/components/legend';
import type { BasicVislibParams } from './types';

const legendClassName = {
  top: 'vislib--legend-top',
  bottom: 'vislib--legend-bottom',
  left: 'vislib--legend-left',
  right: 'vislib--legend-right',
};

export type VislibVisController = InstanceType<ReturnType<typeof createVislibVisController>>;

export const createVislibVisController = (
  core: VisTypeVislibCoreSetup,
  charts: ChartsPluginSetup
) => {
  return class VislibVisController {
    removeListeners?: () => void;
    unmountLegend?: () => void;

    legendRef: RefObject<VisLegend>;
    container: HTMLDivElement;
    chartEl: HTMLDivElement;
    legendEl: HTMLDivElement;
    vislibVis?: any;

    constructor(public el: HTMLDivElement) {
      this.el = el;
      this.legendRef = React.createRef();

      // vis mount point
      this.container = document.createElement('div');
      this.container.className = 'vislib';
      this.el.appendChild(this.container);

      // chart mount point
      this.chartEl = document.createElement('div');
      this.chartEl.className = 'vislib__chart';
      this.container.appendChild(this.chartEl);

      // legend mount point
      this.legendEl = document.createElement('div');
      this.legendEl.className = 'vislib__legend';
      this.container.appendChild(this.legendEl);
    }

    async render(
      esResponse: any,
      visParams: BasicVislibParams,
      handlers: IInterpreterRenderHandlers,
      renderComplete: (() => void) | undefined
    ): Promise<void> {
      if (this.vislibVis) {
        this.destroy(false);
      }

      // Used in functional tests to know when chart is loaded by type
      this.chartEl.dataset.vislibChartType = visParams.type;

      if (this.el.clientWidth === 0 || this.el.clientHeight === 0) {
        renderComplete?.();
        return;
      }

      const { Vis: Vislib } = await import('./vislib/vis');
      const { uiState, event: fireEvent, hasCompatibleActions } = handlers;

      this.vislibVis = new Vislib(this.chartEl, visParams, core, charts);
      const isInteractive = handlers.isInteractive();
      if (isInteractive) {
        this.vislibVis.on('brush', fireEvent);
        this.vislibVis.on('click', fireEvent);
      }
      const [startServices] = await core.getStartServices();
      this.vislibVis.on('renderComplete', () => {
        // refreshing the legend after the chart is rendered.
        // this is necessary because some visualizations
        // provide data necessary for the legend only after a render cycle.
        if (
          this.showLegend(visParams) &&
          CUSTOM_LEGEND_VIS_TYPES.includes(this.vislibVis.visConfigArgs.type)
        ) {
          this.unmountLegend?.();
          this.mountLegend(
            startServices,
            esResponse,
            visParams,
            fireEvent,
            hasCompatibleActions,
            uiState as PersistedState
          );
        }

        renderComplete?.();
      });

      this.removeListeners = isInteractive
        ? () => {
            this.vislibVis.off('brush', fireEvent);
            this.vislibVis.off('click', fireEvent);
          }
        : undefined;

      this.vislibVis.initVisConfig(esResponse, uiState);

      if (this.showLegend(visParams)) {
        $(this.container)
          .attr('class', (_i, cls) => {
            return cls.replace(/vislib--legend-\S+/g, '');
          })
          .addClass((legendClassName as any)[visParams.legendPosition]);

        this.mountLegend(
          startServices,
          esResponse,
          visParams,
          fireEvent,
          hasCompatibleActions,
          uiState as PersistedState
        );
      }

      this.vislibVis.render(esResponse, uiState);
    }

    mountLegend(
      startServices: Pick<CoreStart, 'analytics' | 'i18n' | 'theme' | 'userProfile'>,
      visData: unknown,
      visParams: BasicVislibParams,
      fireEvent: IInterpreterRenderHandlers['event'],
      hasCompatibleActions: IInterpreterRenderHandlers['hasCompatibleActions'],
      uiState?: PersistedState
    ) {
      const { legendPosition } = visParams;
      this.unmountLegend = toMountPoint(
        <VisLegend
          ref={this.legendRef}
          vislibVis={this.vislibVis}
          visData={visData}
          uiState={uiState}
          fireEvent={fireEvent}
          hasCompatibleActions={hasCompatibleActions}
          addLegend={this.showLegend(visParams)}
          position={legendPosition}
        />,
        startServices
      )(this.legendEl);
    }

    destroy(clearElement = true) {
      this.unmountLegend?.();

      if (clearElement) {
        this.el.innerHTML = '';
      }

      if (this.vislibVis) {
        this.removeListeners?.();
        this.vislibVis.destroy();
        delete this.vislibVis;
      }
    }

    showLegend(visParams: BasicVislibParams) {
      return visParams.addLegend ?? false;
    }
  };
};
