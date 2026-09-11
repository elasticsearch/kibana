/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { BehaviorSubject } from 'rxjs';
import { getSampleDashboardState } from '../mocks';
import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import { initializeSettingsManager } from './settings_manager';
import { DEFAULT_DASHBOARD_OPTIONS } from '../../common/constants';
import { DEFAULT_DASHBOARD_STATE } from '../../common/default_dashboard_state';

describe('initializeSettingsManager', () => {
  describe('setSettings', () => {
    test('Should not overwrite settings when setting partial state', () => {
      const settingsManager = initializeSettingsManager({
        ...DEFAULT_DASHBOARD_STATE,
        title: 'dashboard 1',
        options: {
          ...DEFAULT_DASHBOARD_OPTIONS,
          use_margins: false,
        },
      });
      settingsManager.api.setSettings({ time_restore: true });
      const settings = settingsManager.api.getSettings();
      expect(settings.time_restore).toBe(true);
      expect(settings.use_margins).toBe(false);
    });
  });

  describe('startComparing', () => {
    test('Should return no changes when there are no changes', (done) => {
      const lastSavedState$ = new BehaviorSubject<DashboardState>(getSampleDashboardState());
      const settingsManager = initializeSettingsManager(lastSavedState$.value);
      settingsManager.internalApi.startComparing(lastSavedState$).subscribe((changes) => {
        expect(changes).toMatchInlineSnapshot(`Object {}`);
        done();
      });
    });

    test('Should return time_restore change when time_restoreChanges', (done) => {
      const lastSavedState$ = new BehaviorSubject<DashboardState>(getSampleDashboardState());
      const settingsManager = initializeSettingsManager(lastSavedState$.value);
      settingsManager.internalApi.startComparing(lastSavedState$).subscribe((changes) => {
        expect(changes).toMatchInlineSnapshot(`
          Object {
            "time_restore": false,
          }
        `);
        done();
      });
      const currentSettings = settingsManager.api.getSettings();
      settingsManager.api.setSettings({
        ...currentSettings,
        time_restore: !currentSettings.time_restore,
      });
    });

    test('Should return only changed keys when there are changes', (done) => {
      const lastSavedState$ = new BehaviorSubject<DashboardState>(getSampleDashboardState());
      const settingsManager = initializeSettingsManager(lastSavedState$.value);
      settingsManager.internalApi.startComparing(lastSavedState$).subscribe((changes) => {
        expect(changes).toMatchInlineSnapshot(`
          Object {
            "options": Object {
              "auto_apply_filters": true,
              "hide_panel_borders": false,
              "hide_panel_titles": true,
              "sync_colors": false,
              "sync_cursor": true,
              "sync_tooltips": false,
              "use_margins": true,
            },
            "title": "updated title",
          }
        `);
        done();
      });
      const currentSettings = settingsManager.api.getSettings();
      settingsManager.api.setSettings({
        ...currentSettings,
        title: 'updated title',
        hide_panel_titles: !currentSettings.hide_panel_titles,
      });
    });
  });

  describe('projectRoutingRestore deserialization', () => {
    test('Should set projectRoutingRestore to false when projectRouting is undefined', () => {
      const state: DashboardState = {
        ...getSampleDashboardState(),
        // projectRouting is undefined
      };
      const settingsManager = initializeSettingsManager(state);
      const settings = settingsManager.api.getSettings();

      expect(settings.project_routing_restore).toBe(false);
    });

    test('Should set projectRoutingRestore to true when project_routing is a string', () => {
      const state: DashboardState = {
        ...getSampleDashboardState(),
        project_routing: '_alias:_origin',
      };
      const settingsManager = initializeSettingsManager(state);
      const settings = settingsManager.api.getSettings();

      expect(settings.project_routing_restore).toBe(true);
    });
  });
});
