/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SyntheticsAppState } from '../../../state/root_reducer';
import type { TLSVersion } from '../../../../../../common/runtime_types';
import {
  ConfigKey,
  MonitorTypeEnum,
  DEFAULT_THROTTLING,
  LocationStatus,
  ScheduleUnit,
  SourceType,
  VerificationMode,
} from '../../../../../../common/runtime_types';
import type { MonitorDetailsState } from '../../../state';

/**
 * NOTE: This variable name MUST start with 'mock*' in order for
 * Jest to accept its use within a jest.mock()
 */
export const mockState: SyntheticsAppState = {
  ui: {
    ruleFlyoutVisible: null,
    basePath: 'yyz',
    esKuery: '',
    integrationsPopoverOpen: null,
    searchText: '',
    monitorId: '',
  },
  serviceLocations: {
    throttling: DEFAULT_THROTTLING,
    locations: [
      {
        id: 'us_central',
        label: 'US Central',
        geo: {
          lat: 41.25,
          lon: -95.86,
        },
        url: 'https://test.elastic.dev',
        isServiceManaged: true,
        status: LocationStatus.GA,
      },
      {
        id: 'us_east',
        label: 'US East',
        geo: {
          lat: 41.25,
          lon: -95.86,
        },
        url: 'https://test.elastic.dev',
        isServiceManaged: true,
        status: LocationStatus.EXPERIMENTAL,
      },
    ],
    loading: false,
    error: null,
  },
  monitorList: {
    pageState: {
      query: undefined,
      pageIndex: 0,
      pageSize: 10,
      sortField: `${ConfigKey.NAME}.keyword`,
      sortOrder: 'asc',
      tags: undefined,
      monitorTypes: undefined,
      projects: undefined,
      locations: undefined,
    },
    monitorUpsertStatuses: {},
    data: {
      total: 0,
      monitors: [],
      perPage: 0,
      page: 0,
      syncErrors: [],
      absoluteTotal: 0,
    },
    error: null,
    loading: false,
    loaded: false,
    monitorFilterOptions: {
      monitorTypes: [],
      tags: [],
      locations: [],
      projects: [],
      schedules: [],
    },
  },
  overview: {
    pageState: {
      perPage: 10,
      sortOrder: 'asc',
      sortField: 'name.keyword',
    },
    trendStats: {},
    flyoutConfig: null,
    groupBy: {
      field: 'none',
      order: 'asc',
    },
    view: 'cardView',
    showLastRun: false,
  },
  syntheticsEnablement: { loading: false, error: null, enablement: null },
  monitorDetails: getMonitorDetailsMockSlice(),
  browserJourney: getBrowserJourneyMockSlice(),
  networkEvents: {},
  agentPolicies: {
    loading: false,
    error: null,
    data: null,
  },
  privateLocations: {
    isPrivateLocationFlyoutVisible: false,
    loading: false,
    error: null,
    data: [],
  },
  dynamicSettings: {
    loading: false,
    locationMonitors: [],
  },
  defaultAlerting: {
    inspectLoading: false,
    loading: false,
    error: null,
    success: null,
  },
  elasticsearch: {
    results: {},
    loading: {},
    error: {},
  },
  manualTestRuns: {},
  overviewStatus: {
    loaded: false,
    loading: false,
    status: null,
    error: null,
    isInitialLoad: true,
  },
  globalParams: {
    addError: null,
    editError: null,
  },
  certificates: {
    total: 0,
  },
  certsList: {
    error: null,
    data: {
      total: 0,
      certs: [],
    },
  },
  monitorStatusHeatmap: {
    heatmap: [],
    loading: false,
    error: null,
  },
  maintenanceWindows: {},
  monitorHealth: {
    data: null,
    loading: false,
    loaded: false,
    error: null,
  },
};

function getBrowserJourneyMockSlice() {
  return {
    blocks: {
      '4bae236101175ae7746cb922f4c511083af4fbcd': {
        id: '4bae236101175ae7746cb922f4c511083af4fbcd',
        synthetics: {
          blob: '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCABaAKADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJnAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB//9k=',
          blob_mime: 'image/jpeg',
        },
      },
      ec95c047e2e05a27598451fdaa7f24db973eb933: {
        id: 'ec95c047e2e05a27598451fdaa7f24db973eb933',
        synthetics: {
          blob: '/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCABaAKADASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAAAAMI/8QAGhABAAMBAQEAAAAAAAAAAAAAAAECAwQRIf/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwDNfT0bdXTr0dWum3RtedNNdLTa17TPs2mZ+zMz99TAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH/2Q==',
          blob_mime: 'image/jpeg',
        },
      },
    },
    cacheSize: 0,
    hitCount: [
      { hash: '4bae236101175ae7746cb922f4c511083af4fbcd', hitTime: 1658682270849 },
      { hash: 'ec95c047e2e05a27598451fdaa7f24db973eb933', hitTime: 1658682270849 },
    ],
    journeys: {},
    journeysLoading: {},
  };
}

function getMonitorDetailsMockSlice() {
  return {
    lastErrorRun: {
      loading: false,
    },
    lastRun: {
      loading: false,
      loaded: true,
      data: {
        summary: {
          up: 1,
          down: 0,
          status: 'up',
          attempt: 1,
          max_attempts: 1,
          final_attempt: true,
          retry_group: 'retry-1',
        },
        agent: {
          name: 'cron-b010e1cc9518984e-27644714-4pd4h',
          id: 'f8721d90-5aec-4815-a6f1-f4d4a6fb7482',
          type: 'heartbeat',
          ephemeral_id: 'd6a60494-5e52-418f-922b-8e90f0b4013c',
          version: '8.3.0',
        },
        synthetics: {
          journey: { name: 'inline', id: 'inline', tags: null },
          type: 'heartbeat/summary',
        },
        monitor: {
          duration: { us: 269722 },
          origin: SourceType.UI,
          name: 'One pixel monitor',
          check_group: '051aba1c-0b74-11ed-9f0e-ba4e6fa109d5',
          id: '4afd3980-0b72-11ed-9c10-b57918ea89d6',
          timespan: { lt: '2022-07-24T17:24:06.094Z', gte: '2022-07-24T17:14:06.094Z' },
          type: MonitorTypeEnum.BROWSER,
          status: 'up',
        },
        url: {
          scheme: 'data',
          domain: '',
          full: 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
        },
        observer: {
          name: 'us-central',
          geo: {
            continent_name: 'North America',
            city_name: 'Iowa',
            country_iso_code: 'US',
            name: 'North America - US Central',
            location: '41.8780, 93.0977',
          },
          hostname: 'cron-b010e1cc9518984e-27644714-4pd4h',
          ip: ['10.1.11.162'],
          mac: ['ba:4e:6f:a1:09:d5'],
        },
        '@timestamp': '2022-07-24T17:14:05.079Z',
        ecs: { version: '8.0.0' },
        config_id: '4afd3980-0b72-11ed-9c10-b57918ea89d6',
        data_stream: { namespace: 'default', type: 'synthetics', dataset: 'browser' },
        'event.type': 'journey/end',
        event: {
          agent_id_status: 'auth_metadata_missing',
          ingested: '2022-07-24T17:14:07Z',
          type: 'heartbeat/summary',
          dataset: 'browser',
        },
        timestamp: '2022-07-24T17:14:05.079Z',
        docId: 'AkYzMYIBqL6WCtugsFck',
      },
    },
    pings: {
      total: 3,
      data: [
        {
          summary: {
            up: 1,
            down: 0,
            status: 'up',
            attempt: 1,
            max_attempts: 1,
            final_attempt: true,
            retry_group: 'retry-1',
          },
          agent: {
            name: 'cron-b010e1cc9518984e-27644714-4pd4h',
            id: 'f8721d90-5aec-4815-a6f1-f4d4a6fb7482',
            type: 'heartbeat',
            ephemeral_id: 'd6a60494-5e52-418f-922b-8e90f0b4013c',
            version: '8.3.0',
          },
          synthetics: {
            journey: { name: 'inline', id: 'inline' },
            type: 'heartbeat/summary',
          },
          monitor: {
            duration: { us: 269722 },
            origin: SourceType.UI,
            name: 'One pixel monitor',
            check_group: '051aba1c-0b74-11ed-9f0e-ba4e6fa109d5',
            id: '4afd3980-0b72-11ed-9c10-b57918ea89d6',
            timespan: { lt: '2022-07-24T17:24:06.094Z', gte: '2022-07-24T17:14:06.094Z' },
            type: MonitorTypeEnum.BROWSER,
            status: 'up',
          },
          url: {
            scheme: 'data',
            domain: '',
            full: 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
          },
          observer: {
            name: 'us-central',
            geo: {
              continent_name: 'North America',
              city_name: 'Iowa',
              country_iso_code: 'US',
              name: 'North America - US Central',
              location: '41.8780, 93.0977',
            },
            hostname: 'cron-b010e1cc9518984e-27644714-4pd4h',
            ip: ['10.1.11.162'],
            mac: ['ba:4e:6f:a1:09:d5'],
          },
          '@timestamp': '2022-07-24T17:14:05.079Z',
          ecs: { version: '8.0.0' },
          config_id: '4afd3980-0b72-11ed-9c10-b57918ea89d6',
          data_stream: { namespace: 'default', type: 'synthetics', dataset: 'browser' },
          timestamp: '2022-07-24T17:14:05.079Z',
          docId: 'AkYzMYIBqL6WCtugsFck',
        },
        {
          summary: {
            up: 1,
            down: 0,
            status: 'up',
            attempt: 1,
            max_attempts: 1,
            final_attempt: true,
            retry_group: 'retry-1',
          },
          agent: {
            name: 'cron-b010e1cc9518984e-27644704-zs98t',
            id: 'a9620214-591d-48e7-9e5d-10b7a9fb1a03',
            type: 'heartbeat',
            ephemeral_id: 'c5110885-81b4-4e9a-8747-690d19fbd225',
            version: '8.3.0',
          },
          synthetics: {
            journey: { name: 'inline', id: 'inline' },
            type: 'heartbeat/summary',
          },
          monitor: {
            duration: { us: 227326 },
            origin: SourceType.UI,
            name: 'One pixel monitor',
            id: '4afd3980-0b72-11ed-9c10-b57918ea89d6',
            check_group: '9eb87e53-0b72-11ed-b34f-aa618b4334ae',
            timespan: { lt: '2022-07-24T17:14:05.020Z', gte: '2022-07-24T17:04:05.020Z' },
            type: MonitorTypeEnum.BROWSER,
            status: 'up',
          },
          url: {
            scheme: 'data',
            domain: '',
            full: 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
          },
          observer: {
            name: 'us-central',
            geo: {
              continent_name: 'North America',
              city_name: 'Iowa',
              country_iso_code: 'US',
              name: 'North America - US Central',
              location: '41.8780, 93.0977',
            },
            hostname: 'cron-b010e1cc9518984e-27644704-zs98t',
            ip: ['10.1.9.133'],
            mac: ['aa:61:8b:43:34:ae'],
          },
          '@timestamp': '2022-07-24T17:04:03.769Z',
          ecs: { version: '8.0.0' },
          config_id: '4afd3980-0b72-11ed-9c10-b57918ea89d6',
          data_stream: { namespace: 'default', type: 'synthetics', dataset: 'browser' },
          docId: 'mkYqMYIBqL6WCtughFUq',
        },
        {
          summary: {
            up: 1,
            down: 0,
            status: 'up',
            attempt: 1,
            max_attempts: 1,
            final_attempt: true,
            retry_group: 'retry-1',
          },
          agent: {
            name: 'job-b010e1cc9518984e-dkw5k',
            id: 'e3a4e3a8-bdd1-44fe-86f5-e451b80f80c5',
            type: 'heartbeat',
            ephemeral_id: 'f41a13ab-a85d-4614-89c0-8dbad6a32868',
            version: '8.3.0',
          },
          synthetics: {
            journey: { name: 'inline', id: 'inline', tags: null },
            type: 'heartbeat/summary',
          },
          monitor: {
            duration: { us: 207700 },
            origin: SourceType.UI,
            name: 'One pixel monitor',
            timespan: { lt: '2022-07-24T17:11:49.702Z', gte: '2022-07-24T17:01:49.702Z' },
            check_group: '4e00ac5a-0b72-11ed-a97e-5203642c687d',
            id: '4afd3980-0b72-11ed-9c10-b57918ea89d6',
            type: MonitorTypeEnum.BROWSER,
            status: 'up',
          },
          url: {
            scheme: 'data',
            domain: '',
            full: 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
          },
          observer: {
            name: 'us-central',
            geo: {
              continent_name: 'North America',
              city_name: 'Iowa',
              country_iso_code: 'US',
              name: 'North America - US Central',
              location: '41.8780, 93.0977',
            },
            hostname: 'job-b010e1cc9518984e-dkw5k',
            ip: ['10.1.9.132'],
            mac: ['52:03:64:2c:68:7d'],
          },
          '@timestamp': '2022-07-24T17:01:48.326Z',
          ecs: { version: '8.0.0' },
          config_id: '4afd3980-0b72-11ed-9c10-b57918ea89d6',
          data_stream: { namespace: 'default', type: 'synthetics', dataset: 'browser' },
          docId: 'kUYoMYIBqL6WCtugc1We',
        },
      ],
      loading: false,
    },
    syntheticsMonitor: {
      id: '4afd3980-0b72-11ed-9c10-b57918ea89d6',
      config_id: '4afd3980-0b72-11ed-9c10-b57918ea89d6',
      type: MonitorTypeEnum.BROWSER,
      enabled: true,
      schedule: { unit: ScheduleUnit.MINUTES, number: '10' },
      'service.name': '',
      tags: [],
      timeout: null,
      name: 'One pixel monitor',
      locations: [{ isServiceManaged: true, id: 'us_central', label: 'US Central' }],
      namespace: 'default',
      origin: SourceType.UI,
      max_attempts: 2,
      journey_id: '',
      project_id: '',
      playwright_options: '',
      __ui: {
        script_source: { is_generated_script: false, file_name: '' },
        is_tls_enabled: false,
      },
      params: '',
      'url.port': null,
      'source.inline.script':
        "step('Goto one pixel image', async () => {\\n    await page.goto('data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==');\\n});",
      'source.project.content': '',
      urls: 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==',
      screenshots: 'on',
      synthetics_args: [],
      'filter_journeys.match': '',
      'filter_journeys.tags': [],
      ignore_https_errors: false,
      throttling: {
        value: {
          download: '5',
          upload: '3',
          latency: '20',
        },
        label: 'Regular 3G',
        id: 'three_g',
      },
      'ssl.certificate_authorities': '',
      'ssl.certificate': '',
      'ssl.key': '',
      'ssl.key_passphrase': '',
      'ssl.verification_mode': VerificationMode.FULL,
      'ssl.supported_protocols': ['TLSv1.1', 'TLSv1.2', 'TLSv1.3'] as TLSVersion[],
      revision: 1,
      updated_at: '2022-07-24T17:15:46.342Z',
      created_at: '2022-05-24T13:20:49.322Z',
    },
    syntheticsMonitorLoading: false,
    syntheticsMonitorDispatchedAt: 0,
    error: null,
    selectedLocationId: 'us_central',
  } as MonitorDetailsState;
}
