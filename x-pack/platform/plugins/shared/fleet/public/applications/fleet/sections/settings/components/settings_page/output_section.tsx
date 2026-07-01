/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiSpacer, EuiButtonEmpty, EuiLink } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';

import { useAuthz, useLink, useStartServices } from '../../../../hooks';
import type { Output } from '../../../../types';
import { OutputsTable } from '../outputs_table';

import { SettingsSectionPanel } from './settings_section_panel';

export interface OutputSectionProps {
  outputs: Output[];
  deleteOutput: (output: Output) => void;
}

export const OutputSection: React.FunctionComponent<OutputSectionProps> = ({
  outputs,
  deleteOutput,
}) => {
  const authz = useAuthz();
  const { getHref } = useLink();
  const { docLinks } = useStartServices();

  return (
    <SettingsSectionPanel
      title={
        <FormattedMessage id="xpack.fleet.settings.outputSectionTitle" defaultMessage="Outputs" />
      }
      description={
        <EuiLink href={docLinks.links.fleet.settings} external target="_blank">
          <FormattedMessage
            id="xpack.fleet.settings.outputSectionSubtitle"
            defaultMessage="Specify where agents will send data."
          />
        </EuiLink>
      }
    >
      <OutputsTable outputs={outputs} deleteOutput={deleteOutput} />
      {authz.fleet.allSettings && (
        <>
          <EuiSpacer size="s" />
          <EuiButtonEmpty
            iconType="plusCircle"
            href={getHref('settings_create_outputs')}
            data-test-subj="addOutputBtn"
          >
            <FormattedMessage
              id="xpack.fleet.settings.outputCreateButtonLabel"
              defaultMessage="Add output"
            />
          </EuiButtonEmpty>
        </>
      )}
    </SettingsSectionPanel>
  );
};
