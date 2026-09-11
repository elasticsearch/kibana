/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { cloneDeep } from 'lodash';
import { applyDeprecations, configDeprecationFactory } from '@kbn/config';
import { configDeprecationsMock } from '@kbn/core/server/mocks';
import { autocompleteConfigDeprecationProvider } from './config_deprecations';

const deprecationContext = configDeprecationsMock.createContext();

const applyConfigDeprecations = (settings = {}) => {
  const deprecations = autocompleteConfigDeprecationProvider(configDeprecationFactory);
  const deprecationMessages: string[] = [];
  const migrated = applyDeprecations(
    settings,
    deprecations.map((deprecation) => ({
      deprecation,
      path: '',
      context: deprecationContext,
    })),
    () =>
      ({ message }) =>
        deprecationMessages.push(message)
  );
  return {
    messages: deprecationMessages,
    migrated: migrated.config,
  };
};

describe('config deprecations', () => {
  it('removes xpack.alerting.ruleChangeTracking.enabled', async () => {
    const config = {
      ruleChangeTracking: {
        enabled: false,
        scope: ['security'],
      },
    };
    const { messages, migrated } = applyConfigDeprecations(cloneDeep(config));
    expect(migrated.ruleChangeTracking?.enabled).not.toBeDefined();
    expect(migrated.ruleChangeTracking?.scope).toEqual(['security']);
    expect(messages).toMatchInlineSnapshot(`
      Array [
        "You no longer need to configure \\"ruleChangeTracking.enabled\\".",
      ]
    `);
  });

  it('renames xpack.alerting.maintenanceWindow.enabled to xpack.maintenanceWindows.enabled', async () => {
    const config = {
      xpack: {
        alerting: {
          maintenanceWindow: {
            enabled: true,
          },
        },
      },
    };
    const { messages, migrated } = applyConfigDeprecations(cloneDeep(config));
    expect(migrated.xpack?.alerting?.maintenanceWindow?.enabled).not.toBeDefined();
    expect(migrated.xpack?.maintenanceWindows?.enabled).toEqual(true);
    expect(messages).toMatchInlineSnapshot(`
      Array [
        "Setting \\"xpack.alerting.maintenanceWindow.enabled\\" has been replaced by \\"xpack.maintenanceWindows.enabled\\"",
      ]
    `);
  });
});
