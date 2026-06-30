/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FtrProviderContext } from '../../ftr_provider_context';

export function UptimeOverviewProvider({ getService }: FtrProviderContext) {
  const testSubjects = getService('testSubjects');
  const retry = getService('retry');

  return {
    async expandMonitorDetail(id: string): Promise<void> {
      return testSubjects.click(`xpack.synthetics.monitorList.${id}.expandMonitorDetail`);
    },
    async openIntegrationsPopoverForMonitor(id: string, plugin = 'synthetics'): Promise<void> {
      return testSubjects.click(`xpack.${plugin}.monitorList.actionsPopover.${id}`);
    },
    async openAlertsPopover(): Promise<void> {
      return testSubjects.click('xpack.synthetics.alertsPopover.toggleButton');
    },
    /**
     * If the popover is already open, click the nested button.
     * Otherwise, open the popover, then click the nested button.
     */
    async navigateToNestedPopover(): Promise<void> {
      if (await testSubjects.exists('xpack.synthetics.openAlertContextPanel')) {
        return testSubjects.click('xpack.synthetics.openAlertContextPanel');
      }
      await testSubjects.click('xpack.synthetics.alertsPopover.toggleButton');
      return testSubjects.click('xpack.synthetics.openAlertContextPanel');
    },

    async clickDefineSettings() {
      return retry.tryForTime(60 * 1000, async () => {
        if (await testSubjects.exists('errorToastBtn', { timeout: 0 })) {
          await testSubjects.click('toastCloseButton');
        }
        await testSubjects.click('uptimeSettingsLink');
      });
    },
  };
}
