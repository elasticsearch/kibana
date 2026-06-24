/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import path from 'path';
import fs from 'fs';
import zlib from 'zlib';

import { validator } from '../utils/validator';
import type { LensAttributes } from '../..';
import { groupBy } from 'lodash';
import { LensConfigBuilder } from '../../config_builder';

const compressed = fs.readFileSync(path.join(__dirname, './lens_panels.json.gz'));
const files = zlib.gunzipSync(compressed).toString('utf-8');
const panels = JSON.parse(files || '[]') as Record<string, LensAttributes>[];

const builder = new LensConfigBuilder(undefined, true);

const stableChartTypes = new Set([
  'lnsHeatmap',
  'lnsDatatable',
  'lnsPie',
  'lnsTagcloud',
  'lnsMetric',
]);

// These need special attention to be sure they are correctly handled in the transformations
const skipList: Record<string, string[]> = {
  lnsHeatmap: [
    // failing from formula reference column logic
    'Node x pipeline hotspots - by documents processed',
    'Node x pipeline hotspots - by time spent',
    'Events between Ports',
    'Top hosts by memory usage over time',
  ],
};

describe('Integration panels', () => {
  // group panels by type
  const panelsByType = groupBy(panels, (panel) => panel.attributes.visualizationType);
  for (const [chartType, panelsOfType] of Object.entries(panelsByType)) {
    if (builder.isSupported(chartType) && stableChartTypes.has(chartType)) {
      describe(`Type ${chartType}`, () => {
        const panelsByPackage = groupBy(panelsOfType, (panel) => panel.package_name);

        describe.each(Object.entries(panelsByPackage))('Package %s', (_, p) => {
          const skippedTitles = new Set(skipList[chartType] ?? []);
          const active = p.filter(
            ({ panel_title }) => !skippedTitles.has(panel_title as unknown as string)
          );
          const skipped = p.filter(({ panel_title }) =>
            skippedTitles.has(panel_title as unknown as string)
          );

          if (active.length > 0) {
            it.each(active.map(({ panel_title: title, attributes }) => [title, attributes]))(
              'should convert the panel - %s',
              (_title, attributes) => {
                const type = builder.getCompatibleType(attributes);
                const typeValidator = validator[type];

                if (typeValidator) {
                  validator[type].fromState(attributes);
                } else {
                  throw new Error(`No validator found for type: ${type}(${chartType})`);
                }
              }
            );
          }

          skipped.forEach(({ panel_title: title }) => {
            it.todo(`should convert the panel - ${title}`);
          });
        });
      });
    } else {
      describe(`Type ${chartType}`, () => {
        panelsOfType.forEach(({ panel_title: title }) => {
          it.todo(`should convert the panel - ${title}`);
        });
      });
    }
  }
});
