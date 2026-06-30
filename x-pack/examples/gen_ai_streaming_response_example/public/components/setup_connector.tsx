/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { OpenAILogo } from '@kbn/stack-connectors-plugin/public/common';
import { EuiFlexGroup, EuiCard, EuiFlexItem, EuiIcon } from '@elastic/eui';
import { i18n } from '@kbn/i18n';

export interface SetupConnectorProps {
  setIsConnectorModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
}

export const SetupConnector = ({ setIsConnectorModalVisible }: SetupConnectorProps) => {
  return (
    <EuiFlexGroup gutterSize="l">
      <EuiFlexItem grow={false}>
        <EuiCard
          layout="horizontal"
          icon={<EuiIcon size="xl" type={OpenAILogo} aria-hidden={true} />}
          title={i18n.translate(
            'genAiStreamingResponseExample.app.component.addConnectorCardTitle',
            {
              defaultMessage: 'Add OpenAI Connector',
            }
          )}
          description={i18n.translate(
            'genAiStreamingResponseExample.app.component.addConnectorCardDescription',
            {
              defaultMessage: 'Configure a connector to continue',
            }
          )}
          onClick={() => setIsConnectorModalVisible(true)}
        />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
