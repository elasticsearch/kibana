/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import { AddEditMonitorAPI, isPackagePolicyConflictFailure } from './add_monitor_api';
import { SyntheticsMonitorClient } from '../../../synthetics_service/synthetics_monitor/synthetics_monitor_client';
import { SyntheticsService } from '../../../synthetics_service/synthetics_service';
import { syntheticsMonitorAttributes } from '../../../../common/types/saved_objects';
import { PackagePolicyService } from '../../../synthetics_service/private_location/package_policy_service';
import { DeleteMonitorAPI } from '../services/delete_monitor_api';

describe('isPackagePolicyConflictFailure', () => {
  it('matches Fleet bulkCreate saved-object 409 payloads', () => {
    expect(
      isPackagePolicyConflictFailure({
        statusCode: 409,
        error: 'Conflict',
        message: 'Saved object [fleet-package-policies/mon-1-loc-1] conflict',
      })
    ).toBe(true);
  });

  it('matches decorated conflict Errors', () => {
    expect(
      isPackagePolicyConflictFailure(
        SavedObjectsErrorHelpers.createConflictError('fleet-package-policies', 'mon-1-loc-1')
      )
    ).toBe(true);
  });

  it('ignores non-conflict failures', () => {
    expect(isPackagePolicyConflictFailure(new Error('boom'))).toBe(false);
    expect(isPackagePolicyConflictFailure({ statusCode: 500, error: 'Error' })).toBe(false);
    expect(isPackagePolicyConflictFailure(undefined)).toBe(false);
  });
});

describe('AddNewMonitorsPublicAPI', () => {
  describe('revertMonitorIfCreated', () => {
    const buildApi = (get: jest.Mock) =>
      new AddEditMonitorAPI({
        server: { logger: { error: jest.fn() } },
        spaceId: 'default',
        monitorConfigRepository: { get },
      } as any);

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('does not delete policies when a conflicting existing monitor owns the id', async () => {
      const bulkDelete = jest
        .spyOn(PackagePolicyService.prototype, 'bulkDelete')
        .mockResolvedValue(undefined);
      const api = buildApi(jest.fn().mockResolvedValue({ id: 'monitor-1' }));

      await api.revertMonitorIfCreated({
        newMonitorId: 'monitor-1',
        packagePolicyIds: ['monitor-1-location-1'],
        soCreated: false,
      });

      expect(bulkDelete).not.toHaveBeenCalled();
    });

    it('deletes deterministic orphan policies when no monitor owns the id', async () => {
      const bulkDelete = jest
        .spyOn(PackagePolicyService.prototype, 'bulkDelete')
        .mockResolvedValue(undefined);
      const api = buildApi(jest.fn().mockResolvedValue(null));

      await api.revertMonitorIfCreated({
        newMonitorId: 'monitor-1',
        packagePolicyIds: ['monitor-1-location-1'],
        soCreated: false,
      });

      expect(bulkDelete).toHaveBeenCalledWith({
        policyIdsToDelete: ['monitor-1-location-1'],
        spaceId: 'default',
      });
    });

    it('does not delete policies when the monitor SO was created and revert fails', async () => {
      const bulkDelete = jest
        .spyOn(PackagePolicyService.prototype, 'bulkDelete')
        .mockResolvedValue(undefined);
      jest.spyOn(DeleteMonitorAPI.prototype, 'execute').mockRejectedValue(new Error('forbidden'));
      const api = buildApi(jest.fn().mockResolvedValue({ id: 'monitor-1' }));

      await api.revertMonitorIfCreated({
        newMonitorId: 'monitor-1',
        packagePolicyIds: ['monitor-1-location-1'],
        soCreated: true,
      });

      expect(bulkDelete).not.toHaveBeenCalled();
    });

    it('deletes the monitor and its policies via DeleteMonitorAPI when the monitor SO was created', async () => {
      const bulkDelete = jest
        .spyOn(PackagePolicyService.prototype, 'bulkDelete')
        .mockResolvedValue(undefined);
      const deleteMonitorExecute = jest
        .spyOn(DeleteMonitorAPI.prototype, 'execute')
        .mockResolvedValue(undefined as any);
      const api = buildApi(jest.fn().mockResolvedValue({ id: 'monitor-1' }));

      await api.revertMonitorIfCreated({
        newMonitorId: 'monitor-1',
        packagePolicyIds: ['monitor-1-location-1'],
        soCreated: true,
      });

      // The full monitor delete (which tears down its Fleet package policies
      // too) owns cleanup here; the direct package-policy bulkDelete path is
      // only for orphan policies from a create that never reached the SO.
      expect(deleteMonitorExecute).toHaveBeenCalledWith({ monitorIds: ['monitor-1'] });
      expect(bulkDelete).not.toHaveBeenCalled();
    });
  });

  it('should normalize schedule', async function () {
    const syntheticsService = new SyntheticsService({
      config: {
        enabled: true,
      },
    } as any);
    const api = new AddEditMonitorAPI({
      syntheticsMonitorClient: new SyntheticsMonitorClient(syntheticsService, {} as any),
      request: {
        body: {},
      },
    } as any);
    let result = await api.normalizeMonitor({ schedule: '3' } as any, {} as any);
    expect(result.schedule).toEqual({ number: '3', unit: 'm' });

    result = await api.normalizeMonitor({ schedule: 3 } as any, {} as any);
    expect(result.schedule).toEqual({ number: '3', unit: 'm' });

    result = await api.normalizeMonitor(
      {
        schedule: {
          number: '3',
          unit: 'm',
        },
      } as any,
      {} as any
    );
    expect(result.schedule).toEqual({ number: '3', unit: 'm' });

    result = await api.normalizeMonitor(
      {
        schedule: {
          number: 3,
          unit: 'm',
        },
      } as any,
      {} as any
    );
    expect(result.schedule).toEqual({ number: '3', unit: 'm' });
  });

  describe('normalizeMonitor defaults', () => {
    const syntheticsService = new SyntheticsService({
      config: {},
    } as any);
    const api = new AddEditMonitorAPI({
      syntheticsMonitorClient: new SyntheticsMonitorClient(syntheticsService, {} as any),
      request: {
        body: {},
      },
    } as any);
    it('should normalize tcp', async () => {
      expect(
        await api.normalizeMonitor(
          {
            type: 'tcp',
          } as any,
          {} as any,
          []
        )
      ).toEqual({
        __ui: { is_tls_enabled: false },
        alert: { status: { enabled: true }, tls: { enabled: true } },
        'check.receive': '',
        'check.send': '',
        config_id: '',
        enabled: true,
        form_monitor_type: 'tcp',
        hash: '',
        hosts: '',
        id: '',
        ipv4: true,
        ipv6: true,
        journey_id: '',
        locations: [],
        max_attempts: 2,
        mode: 'any',
        name: '',
        namespace: 'default',
        origin: 'ui',
        params: '',
        proxy_url: '',
        proxy_use_local_resolver: false,
        revision: 1,
        schedule: { number: '3', unit: 'm' },
        'service.name': '',
        'ssl.certificate': '',
        'ssl.certificate_authorities': '',
        'ssl.key': '',
        'ssl.key_passphrase': '',
        'ssl.supported_protocols': ['TLSv1.1', 'TLSv1.2', 'TLSv1.3'],
        'ssl.verification_mode': 'full',
        tags: [],
        timeout: '16',
        type: 'tcp',
        'url.port': null,
        urls: '',
        labels: {},
        maintenance_windows: [],
        spaces: [],
      });
    });
    it('should normalize icmp', async () => {
      expect(
        await api.normalizeMonitor(
          {
            type: 'icmp',
          } as any,
          {} as any,
          []
        )
      ).toEqual({
        alert: { status: { enabled: true }, tls: { enabled: true } },
        config_id: '',
        enabled: true,
        form_monitor_type: 'icmp',
        hash: '',
        hosts: '',
        id: '',
        ipv4: true,
        ipv6: true,
        journey_id: '',
        locations: [],
        max_attempts: 2,
        mode: 'any',
        name: '',
        namespace: 'default',
        origin: 'ui',
        params: '',
        revision: 1,
        schedule: { number: '3', unit: 'm' },
        'service.name': '',
        tags: [],
        timeout: '16',
        type: 'icmp',
        wait: '1',
        labels: {},
        maintenance_windows: [],
        spaces: [],
      });
    });
    it('should normalize http', async () => {
      expect(
        await api.normalizeMonitor(
          {
            type: 'http',
          } as any,
          {} as any
        )
      ).toEqual({
        __ui: { is_tls_enabled: false },
        alert: { status: { enabled: true }, tls: { enabled: true } },
        'check.request.body': { type: 'text', value: '' },
        'check.request.headers': {},
        'check.request.method': 'GET',
        'check.response.body.negative': [],
        'check.response.body.positive': [],
        'check.response.headers': {},
        'check.response.json': [],
        'check.response.status': [],
        config_id: '',
        enabled: true,
        form_monitor_type: 'http',
        hash: '',
        id: '',
        ipv4: true,
        ipv6: true,
        journey_id: '',
        locations: [],
        max_attempts: 2,
        max_redirects: '0',
        mode: 'any',
        name: undefined,
        namespace: 'default',
        origin: 'ui',
        params: '',
        password: '',
        proxy_headers: {},
        proxy_url: '',
        'response.include_body': 'on_error',
        'response.include_body_max_bytes': '1024',
        'response.include_headers': true,
        revision: 1,
        schedule: { number: '3', unit: 'm' },
        'service.name': '',
        'ssl.certificate': '',
        'ssl.certificate_authorities': '',
        'ssl.key': '',
        'ssl.key_passphrase': '',
        'ssl.supported_protocols': ['TLSv1.1', 'TLSv1.2', 'TLSv1.3'],
        'ssl.verification_mode': 'full',
        tags: [],
        timeout: '16',
        type: 'http',
        'url.port': null,
        urls: '',
        username: '',
        labels: {},
        maintenance_windows: [],
        spaces: [],
      });
    });
    it('should normalize browser', async () => {
      expect(
        await api.normalizeMonitor(
          {
            type: 'browser',
          } as any,
          {} as any
        )
      ).toEqual({
        __ui: { script_source: { file_name: '', is_generated_script: false } },
        alert: { status: { enabled: true }, tls: { enabled: true } },
        config_id: '',
        enabled: true,
        'filter_journeys.match': '',
        'filter_journeys.tags': [],
        form_monitor_type: 'multistep',
        hash: '',
        id: '',
        ignore_https_errors: false,
        certificate_error_spki_allowlist: [],
        journey_id: '',
        locations: [],
        max_attempts: 2,
        name: '',
        namespace: 'default',
        origin: 'ui',
        params: '',
        playwright_options: '',
        playwright_text_assertion: '',
        project_id: '',
        revision: 1,
        schedule: { number: '10', unit: 'm' },
        screenshots: 'on',
        'service.name': '',
        'source.inline.script': '',
        'source.project.content': '',
        'ssl.certificate': '',
        'ssl.certificate_authorities': '',
        'ssl.key': '',
        'ssl.key_passphrase': '',
        'ssl.supported_protocols': ['TLSv1.1', 'TLSv1.2', 'TLSv1.3'],
        'ssl.verification_mode': 'full',
        synthetics_args: [],
        tags: [],
        throttling: {
          id: 'default',
          label: 'Default',
          value: { download: '5', latency: '20', upload: '3' },
        },
        timeout: null,
        type: 'browser',
        'url.port': null,
        urls: '',
        labels: {},
        maintenance_windows: [],
        spaces: [],
      });
    });
  });

  describe('normalizeMonitor - maintenance windows', () => {
    const buildApi = (maintenanceWindows: Array<{ id: string; title: string }>) => {
      const syntheticsService = new SyntheticsService({ config: {} } as any);
      syntheticsService.getMaintenanceWindows = jest.fn().mockResolvedValue(maintenanceWindows);
      return {
        api: new AddEditMonitorAPI({
          spaceId: 'default',
          syntheticsMonitorClient: new SyntheticsMonitorClient(syntheticsService, {} as any),
          request: { body: {} },
        } as any),
        maintenanceWindows,
        getMaintenanceWindows: syntheticsService.getMaintenanceWindows,
      };
    };

    it('resolves maintenance window names to ids', async () => {
      const { api, maintenanceWindows, getMaintenanceWindows } = buildApi([
        { id: 'mw-1', title: 'Weekend window' },
      ]);
      const result = await api.normalizeMonitor(
        { type: 'http', maintenance_windows: ['Weekend window'] } as any,
        {} as any,
        undefined,
        maintenanceWindows as any
      );
      expect(result.maintenance_windows).toEqual(['mw-1']);
      expect(getMaintenanceWindows).not.toHaveBeenCalled();
    });

    it('keeps valid maintenance window ids', async () => {
      const { api, maintenanceWindows } = buildApi([{ id: 'mw-1', title: 'Weekend window' }]);
      const result = await api.normalizeMonitor(
        { type: 'http', maintenance_windows: ['mw-1'] } as any,
        {} as any,
        undefined,
        maintenanceWindows as any
      );
      expect(result.maintenance_windows).toEqual(['mw-1']);
    });

    it('throws for an unresolved reference', async () => {
      const { api, maintenanceWindows } = buildApi([{ id: 'mw-1', title: 'Weekend window' }]);
      await expect(
        api.normalizeMonitor(
          { type: 'http', maintenance_windows: ['nope'] } as any,
          {} as any,
          undefined,
          maintenanceWindows as any
        )
      ).rejects.toThrow(/nope/);
    });

    it('throws when maintenance windows are unavailable', async () => {
      const { api, maintenanceWindows } = buildApi([]);
      await expect(
        api.normalizeMonitor(
          { type: 'http', maintenance_windows: ['mw-1'] } as any,
          {} as any,
          undefined,
          maintenanceWindows as any
        )
      ).rejects.toThrow(/mw-1/);
    });

    it('does not fetch maintenance windows when none are referenced', async () => {
      const { api, getMaintenanceWindows } = buildApi([]);
      await api.normalizeMonitor({ type: 'http' } as any, {} as any);
      expect(getMaintenanceWindows).not.toHaveBeenCalled();
    });
  });

  describe('validateUniqueMonitorName', () => {
    it('should return an error message if the monitor name already exists', async () => {
      const api = new AddEditMonitorAPI({
        monitorConfigRepository: {
          find: async () => ({ total: 1 }),
        },
      } as any);

      const result = await api.validateUniqueMonitorName('test-monitor');
      expect(result).toBe('Monitor name must be unique, "test-monitor" already exists.');
    });

    it('should not return an error message if the monitor name is unique', async () => {
      const api = new AddEditMonitorAPI({
        monitorConfigRepository: {
          find: async () => ({ total: 0 }),
        },
      } as any);

      const result = await api.validateUniqueMonitorName('unique-monitor');
      expect(result).toBeUndefined();
    });

    it('should not return an error message if the monitor name is the same as the one being edited', async () => {
      let receivedFilter: string | undefined;
      const api = new AddEditMonitorAPI({
        monitorConfigRepository: {
          find: async (options: { filter: string }) => {
            receivedFilter = options.filter;
            return { total: 0 };
          },
        },
      } as any);

      const result = await api.validateUniqueMonitorName('test-monitor', 'monitor-id');
      expect(result).toBeUndefined();
      expect(receivedFilter).toBe(
        `${syntheticsMonitorAttributes}.name.keyword:"test-monitor" and not (${syntheticsMonitorAttributes}.config_id: monitor-id)`
      );
    });

    it('should return an error message if the monitor name is used by another monitor when editing', async () => {
      const api = new AddEditMonitorAPI({
        monitorConfigRepository: {
          find: async () => ({ total: 1 }),
        },
      } as any);

      const result = await api.validateUniqueMonitorName('test-monitor', 'monitor-id');
      expect(result).toBe('Monitor name must be unique, "test-monitor" already exists.');
    });
  });
});
