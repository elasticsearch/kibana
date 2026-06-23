/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreStart } from '@kbn/core-lifecycle-browser';
import { coreMock } from '@kbn/core/public/mocks';
import { getAlertingV2ManagementNavPanel } from './get_management_nav_panel';

describe('getAlertingV2ManagementNavPanel', () => {
  let core: CoreStart;

  beforeEach(() => {
    core = coreMock.createStart();
    core.settings.globalClient.get = <T>(_key: string) => true as T;
  });

  it('returns a single panelOpener with the canonical children when alerting v2 is enabled', () => {
    const result = getAlertingV2ManagementNavPanel(core);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: 'alerting_v2_panel',
      title: 'Alerting V2 Preview',
      renderAs: 'panelOpener',
      children: [
        { link: 'management:rules' },
        { link: 'management:episodes' },
        { link: 'management:action_policies' },
        { link: 'management:execution_history' },
      ],
    });
  });

  it('returns an empty array when alerting v2 is disabled', () => {
    core.settings.globalClient.get = <T>(_key: string) => false as T;

    expect(getAlertingV2ManagementNavPanel(core)).toEqual([]);
  });

  it('returns an empty array when alerting v2 is not set', () => {
    core.settings.globalClient.get = <T>(_key: string) => undefined as T;

    expect(getAlertingV2ManagementNavPanel(core)).toEqual([]);
  });
});
