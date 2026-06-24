/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent } from '@testing-library/react';
import { CertMonitors } from './cert_monitors';
import { render } from '../../utils/testing';
import type { CertMonitor } from '../../../../../common/runtime_types';
import * as useKibanaSpaceModule from '../../../../hooks/use_kibana_space';

const createMockMonitors = (count: number): CertMonitor[] =>
  Array.from({ length: count }, (_, i) => ({
    name: `Monitor ${i + 1}`,
    id: `monitor-${i + 1}`,
    configId: `config-${i + 1}`,
    url: `https://example-${i + 1}.com`,
  }));

describe('CertMonitors', () => {
  it('renders all monitors when count is within the default limit', () => {
    const monitors = createMockMonitors(5);
    const { getByText, queryByTestId } = render(<CertMonitors monitors={monitors} />);

    for (const mon of monitors) {
      expect(getByText(mon.name!)).toBeInTheDocument();
    }
    expect(queryByTestId('certMonitorsViewAll')).not.toBeInTheDocument();
    expect(queryByTestId('certMonitorsShowFewer')).not.toBeInTheDocument();
  });

  it('renders exactly 10 monitors when count is at the default limit', () => {
    const monitors = createMockMonitors(10);
    const { getByText, queryByTestId } = render(<CertMonitors monitors={monitors} />);

    expect(getByText('Monitor 1')).toBeInTheDocument();
    expect(getByText('Monitor 10')).toBeInTheDocument();
    expect(queryByTestId('certMonitorsViewAll')).not.toBeInTheDocument();
    expect(queryByTestId('certMonitorsShowFewer')).not.toBeInTheDocument();
  });

  it('truncates monitors and shows "+N more" when count exceeds the default limit', () => {
    const monitors = createMockMonitors(100);
    const { getByText, queryByText, getByTestId, queryByTestId } = render(
      <CertMonitors monitors={monitors} />
    );

    expect(getByText('Monitor 1')).toBeInTheDocument();
    expect(getByText('Monitor 10')).toBeInTheDocument();
    expect(queryByText('Monitor 11')).not.toBeInTheDocument();
    expect(getByTestId('certMonitorsViewAll')).toHaveTextContent('+90 more');
    expect(queryByTestId('certMonitorsShowFewer')).not.toBeInTheDocument();
  });

  it('shows all monitors after clicking "+N more"', () => {
    const monitors = createMockMonitors(15);
    const { getByText, getByTestId, queryByTestId } = render(<CertMonitors monitors={monitors} />);

    fireEvent.click(getByTestId('certMonitorsViewAll'));

    expect(getByText('Monitor 10')).toBeInTheDocument();
    expect(getByText('Monitor 15')).toBeInTheDocument();
    expect(queryByTestId('certMonitorsViewAll')).not.toBeInTheDocument();
    expect(getByTestId('certMonitorsShowFewer')).toBeInTheDocument();
  });

  it('collapses back to 10 monitors after clicking "Show fewer"', () => {
    const monitors = createMockMonitors(15);
    const { queryByText, getByTestId } = render(<CertMonitors monitors={monitors} />);

    fireEvent.click(getByTestId('certMonitorsViewAll'));
    fireEvent.click(getByTestId('certMonitorsShowFewer'));

    expect(queryByText('Monitor 11')).not.toBeInTheDocument();
    expect(getByTestId('certMonitorsViewAll')).toHaveTextContent('+5 more');
  });

  describe('remote (CCS) monitors', () => {
    const localMonitor: CertMonitor = {
      name: 'Local Monitor',
      id: 'local-id',
      configId: 'local-cfg',
      url: 'https://local.example.com',
    };
    const remoteWithKibanaUrl: CertMonitor = {
      name: 'Remote With URL',
      id: 'remote-1',
      configId: 'remote-cfg-1',
      url: 'https://remote-1.example.com',
      remote: { remoteName: 'cluster1', kibanaUrl: 'https://remote-1.kibana' },
    };
    const remoteWithoutKibanaUrl: CertMonitor = {
      name: 'Remote No URL',
      id: 'remote-2',
      configId: 'remote-cfg-2',
      url: 'https://remote-2.example.com',
      remote: { remoteName: 'cluster2' },
    };

    it('shows only the url tooltip (no remote cluster title) for a local cert monitor', () => {
      const { getByTestId, getByText, queryByText } = render(
        <CertMonitors monitors={[localMonitor]} />
      );
      fireEvent.mouseOver(getByTestId('syntheticsMonitorPageLinkLink'));
      expect(getByText(localMonitor.url!)).toBeInTheDocument();
      expect(queryByText(/Loaded from remote cluster/)).not.toBeInTheDocument();
    });

    it('shows the remote cluster name as the tooltip title for a remote cert monitor', () => {
      const { getByTestId, getByText } = render(<CertMonitors monitors={[remoteWithKibanaUrl]} />);
      fireEvent.mouseOver(getByTestId('syntheticsMonitorPageLinkRemoteLink'));
      expect(getByText(remoteWithKibanaUrl.url!)).toBeInTheDocument();
      expect(getByText('Loaded from remote cluster cluster1')).toBeInTheDocument();
    });

    it('opens an external link to remote Kibana when a kibanaUrl is known', () => {
      const { getByTestId } = render(<CertMonitors monitors={[remoteWithKibanaUrl]} />);
      const link = getByTestId('syntheticsMonitorPageLinkRemoteLink') as HTMLAnchorElement;
      expect(link).toBeInTheDocument();
      expect(link.target).toBe('_blank');
      // External link → no `remoteName=` query param.
      expect(link.href).toContain('https://remote-1.kibana');
      expect(link.href).toContain('remote-cfg-1');
      expect(link.href).not.toContain('remoteName=');
    });

    it('threads the active space into the remote deep link', () => {
      jest.spyOn(useKibanaSpaceModule, 'useKibanaSpace').mockReturnValue({
        space: { id: 'team-a', name: 'Team A', disabledFeatures: [] },
        loading: false,
        error: undefined,
      });
      const { getByTestId } = render(<CertMonitors monitors={[remoteWithKibanaUrl]} />);
      const link = getByTestId('syntheticsMonitorPageLinkRemoteLink') as HTMLAnchorElement;
      expect(link.href).toContain('https://remote-1.kibana/s/team-a/app/synthetics/monitor/');
    });

    it('falls back to a local link with ?remoteName= when no kibanaUrl is known', () => {
      const { getByTestId, queryByTestId } = render(
        <CertMonitors monitors={[remoteWithoutKibanaUrl]} />
      );
      expect(queryByTestId('syntheticsMonitorPageLinkRemoteLink')).not.toBeInTheDocument();
      const link = getByTestId('syntheticsMonitorPageLinkLink') as HTMLAnchorElement;
      expect(link.target).not.toBe('_blank');
      expect(link.getAttribute('href')).toContain('/app/synthetics/monitor/remote-cfg-2');
      expect(link.getAttribute('href')).toContain('remoteName=cluster2');
    });

    it('keeps the plain local link for non-remote monitors', () => {
      const { getByTestId } = render(<CertMonitors monitors={[localMonitor]} />);
      const link = getByTestId('syntheticsMonitorPageLinkLink') as HTMLAnchorElement;
      const href = link.getAttribute('href') ?? '';
      expect(href).toContain('/app/synthetics/monitor/local-cfg');
      expect(href).not.toContain('remoteName=');
    });
  });
});
