/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  createRemoteMonitorCloneUrl,
  createRemoteMonitorDetailUrl,
  createRemoteMonitorEditUrl,
} from './remote_monitor_urls';

const baseMonitor = {
  configId: 'monitor-abc',
  remote: { remoteName: 'remote-cluster-1', kibanaUrl: 'https://remote.example.com' },
};

describe('createRemoteMonitorDetailUrl', () => {
  it('returns undefined when the monitor is not remote', () => {
    expect(
      createRemoteMonitorDetailUrl({
        monitor: { configId: 'monitor-abc', remote: undefined },
        locationId: 'us-east-1',
      })
    ).toBeUndefined();
  });

  it('returns undefined when kibanaUrl is missing', () => {
    expect(
      createRemoteMonitorDetailUrl({
        monitor: { configId: 'monitor-abc', remote: { remoteName: 'remote-cluster-1' } },
        locationId: 'us-east-1',
      })
    ).toBeUndefined();
  });

  it('uses the explicit kibanaUrl when the monitor metadata lacks one', () => {
    const url = createRemoteMonitorDetailUrl({
      monitor: { configId: 'monitor-abc', remote: { remoteName: 'remote-cluster-1' } },
      locationId: 'us-east-1',
      kibanaUrl: 'https://from-ping.example.com',
    });
    expect(url).toBe(
      'https://from-ping.example.com/app/synthetics/monitor/monitor-abc?locationId=us-east-1'
    );
  });

  it('prefers the explicit kibanaUrl over the one on the monitor metadata', () => {
    const url = createRemoteMonitorDetailUrl({
      monitor: baseMonitor,
      locationId: 'us-east-1',
      kibanaUrl: 'https://from-ping.example.com',
    });
    expect(url).toBe(
      'https://from-ping.example.com/app/synthetics/monitor/monitor-abc?locationId=us-east-1'
    );
  });

  it('builds the default-space deep link without an /s/ prefix', () => {
    const url = createRemoteMonitorDetailUrl({
      monitor: baseMonitor,
      locationId: 'us-east-1',
      spaceId: 'default',
    });
    expect(url).toBe(
      'https://remote.example.com/app/synthetics/monitor/monitor-abc?locationId=us-east-1'
    );
  });

  it('omits the /s/ prefix when spaceId is undefined', () => {
    const url = createRemoteMonitorDetailUrl({
      monitor: baseMonitor,
      locationId: 'us-east-1',
    });
    expect(url).toBe(
      'https://remote.example.com/app/synthetics/monitor/monitor-abc?locationId=us-east-1'
    );
  });

  it('adds an /s/<spaceId> prefix for non-default spaces', () => {
    const url = createRemoteMonitorDetailUrl({
      monitor: baseMonitor,
      locationId: 'us-east-1',
      spaceId: 'team-a',
    });
    expect(url).toBe(
      'https://remote.example.com/s/team-a/app/synthetics/monitor/monitor-abc?locationId=us-east-1'
    );
  });

  it('normalizes trailing slashes on kibanaUrl', () => {
    const url = createRemoteMonitorDetailUrl({
      monitor: {
        ...baseMonitor,
        remote: { remoteName: 'remote-cluster-1', kibanaUrl: 'https://remote.example.com//' },
      },
      locationId: 'us-east-1',
      spaceId: 'team-a',
    });
    expect(url).toBe(
      'https://remote.example.com/s/team-a/app/synthetics/monitor/monitor-abc?locationId=us-east-1'
    );
  });

  it('URL-encodes configIds that contain reserved characters', () => {
    const url = createRemoteMonitorDetailUrl({
      monitor: {
        ...baseMonitor,
        configId: 'weird/id with:colon',
      },
      locationId: 'us-east-1',
    });
    expect(url).toBe(
      'https://remote.example.com/app/synthetics/monitor/weird%2Fid%20with%3Acolon?locationId=us-east-1'
    );
  });

  it('URL-encodes locationIds via searchParams', () => {
    const url = createRemoteMonitorDetailUrl({
      monitor: baseMonitor,
      locationId: 'east west',
    });
    expect(url).toBe(
      'https://remote.example.com/app/synthetics/monitor/monitor-abc?locationId=east+west'
    );
  });

  it('omits the locationId query param when not provided', () => {
    const url = createRemoteMonitorDetailUrl({
      monitor: baseMonitor,
    });
    expect(url).toBe('https://remote.example.com/app/synthetics/monitor/monitor-abc');
  });

  it('omits the locationId query param when an empty string is provided', () => {
    const url = createRemoteMonitorDetailUrl({
      monitor: baseMonitor,
      locationId: '',
    });
    expect(url).toBe('https://remote.example.com/app/synthetics/monitor/monitor-abc');
  });
});

describe('createRemoteMonitorEditUrl', () => {
  it('returns undefined when the monitor is not remote', () => {
    expect(
      createRemoteMonitorEditUrl({
        monitor: { configId: 'monitor-abc', remote: undefined },
      })
    ).toBeUndefined();
  });

  it('returns undefined when kibanaUrl is missing', () => {
    expect(
      createRemoteMonitorEditUrl({
        monitor: { configId: 'monitor-abc', remote: { remoteName: 'remote-cluster-1' } },
      })
    ).toBeUndefined();
  });

  it('uses the explicit kibanaUrl fallback when the monitor metadata lacks one', () => {
    const url = createRemoteMonitorEditUrl({
      monitor: { configId: 'monitor-abc', remote: { remoteName: 'remote-cluster-1' } },
      kibanaUrl: 'https://from-ping.example.com',
    });
    expect(url).toBe('https://from-ping.example.com/app/synthetics/edit-monitor/monitor-abc');
  });

  it('builds the default-space edit deep link without an /s/ prefix', () => {
    expect(createRemoteMonitorEditUrl({ monitor: baseMonitor, spaceId: 'default' })).toBe(
      'https://remote.example.com/app/synthetics/edit-monitor/monitor-abc'
    );
  });

  it('adds an /s/<spaceId> prefix for non-default spaces', () => {
    expect(createRemoteMonitorEditUrl({ monitor: baseMonitor, spaceId: 'team-a' })).toBe(
      'https://remote.example.com/s/team-a/app/synthetics/edit-monitor/monitor-abc'
    );
  });

  it('normalizes trailing slashes on kibanaUrl', () => {
    const url = createRemoteMonitorEditUrl({
      monitor: {
        ...baseMonitor,
        remote: { remoteName: 'remote-cluster-1', kibanaUrl: 'https://remote.example.com//' },
      },
      spaceId: 'team-a',
    });
    expect(url).toBe('https://remote.example.com/s/team-a/app/synthetics/edit-monitor/monitor-abc');
  });

  it('URL-encodes configIds that contain reserved characters', () => {
    expect(
      createRemoteMonitorEditUrl({
        monitor: { ...baseMonitor, configId: 'weird/id with:colon' },
      })
    ).toBe('https://remote.example.com/app/synthetics/edit-monitor/weird%2Fid%20with%3Acolon');
  });
});

describe('createRemoteMonitorCloneUrl', () => {
  it('returns undefined when the monitor is not remote', () => {
    expect(
      createRemoteMonitorCloneUrl({
        monitor: { configId: 'monitor-abc', remote: undefined },
      })
    ).toBeUndefined();
  });

  it('returns undefined when kibanaUrl is missing', () => {
    expect(
      createRemoteMonitorCloneUrl({
        monitor: { configId: 'monitor-abc', remote: { remoteName: 'remote-cluster-1' } },
      })
    ).toBeUndefined();
  });

  it('uses the explicit kibanaUrl fallback when the monitor metadata lacks one', () => {
    expect(
      createRemoteMonitorCloneUrl({
        monitor: { configId: 'monitor-abc', remote: { remoteName: 'remote-cluster-1' } },
        kibanaUrl: 'https://from-ping.example.com',
      })
    ).toBe('https://from-ping.example.com/app/synthetics/add-monitor?cloneId=monitor-abc');
  });

  it('builds the default-space clone deep link without an /s/ prefix', () => {
    expect(createRemoteMonitorCloneUrl({ monitor: baseMonitor, spaceId: 'default' })).toBe(
      'https://remote.example.com/app/synthetics/add-monitor?cloneId=monitor-abc'
    );
  });

  it('adds an /s/<spaceId> prefix for non-default spaces', () => {
    expect(createRemoteMonitorCloneUrl({ monitor: baseMonitor, spaceId: 'team-a' })).toBe(
      'https://remote.example.com/s/team-a/app/synthetics/add-monitor?cloneId=monitor-abc'
    );
  });

  it('normalizes trailing slashes on kibanaUrl', () => {
    expect(
      createRemoteMonitorCloneUrl({
        monitor: {
          ...baseMonitor,
          remote: { remoteName: 'remote-cluster-1', kibanaUrl: 'https://remote.example.com//' },
        },
        spaceId: 'team-a',
      })
    ).toBe('https://remote.example.com/s/team-a/app/synthetics/add-monitor?cloneId=monitor-abc');
  });

  it('URL-encodes configIds that contain reserved characters via searchParams', () => {
    // searchParams.append uses application/x-www-form-urlencoded encoding,
    // so spaces become `+` and `/` becomes `%2F`.
    expect(
      createRemoteMonitorCloneUrl({
        monitor: { ...baseMonitor, configId: 'weird/id with:colon' },
      })
    ).toBe('https://remote.example.com/app/synthetics/add-monitor?cloneId=weird%2Fid+with%3Acolon');
  });
});
