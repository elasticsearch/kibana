/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiSpacer, EuiButtonEmpty } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';

import { useAuthz, useLink } from '../../../../hooks';
import type { DownloadSource } from '../../../../types';
import { DownloadSourceTable } from '../download_source_table';

import { SettingsSectionPanel } from './settings_section_panel';

export interface AgentBinarySectionProps {
  downloadSources: DownloadSource[];
  deleteDownloadSource: (ds: DownloadSource) => void;
}

export const AgentBinarySection: React.FunctionComponent<AgentBinarySectionProps> = ({
  downloadSources,
  deleteDownloadSource,
}) => {
  const { getHref } = useLink();
  const authz = useAuthz();
  const hasAllSettingsPrivileges = authz.fleet.allSettings;

  return (
    <SettingsSectionPanel
      title={
        <FormattedMessage
          id="xpack.fleet.settings.downloadSourcesSection.Title"
          defaultMessage="Agent Binary Download"
        />
      }
      description={
        <FormattedMessage
          id="xpack.fleet.settings.downloadSourcesSection.Subtitle"
          defaultMessage="List of sources used by Elastic agents to download their binaries. The default source applies to all agent policies that don't have a specific binary source specified."
        />
      }
    >
      <DownloadSourceTable
        downloadSources={downloadSources}
        deleteDownloadSource={deleteDownloadSource}
        hasAllSettingsPrivileges={hasAllSettingsPrivileges}
      />
      {hasAllSettingsPrivileges && (
        <>
          <EuiSpacer size="s" />
          <EuiButtonEmpty
            iconType="plusCircle"
            href={getHref('settings_create_download_sources')}
            data-test-subj="addDownloadSourcesBtn"
          >
            <FormattedMessage
              id="xpack.fleet.settings.downloadSourcesSection.CreateButtonLabel"
              defaultMessage="Add agent binary source"
            />
          </EuiButtonEmpty>
        </>
      )}
    </SettingsSectionPanel>
  );
};
