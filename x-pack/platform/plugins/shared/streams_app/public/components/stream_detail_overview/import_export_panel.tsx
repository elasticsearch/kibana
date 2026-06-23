/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { Streams } from '@kbn/streams-schema';
import { ImportContentPackFlyout } from '../stream_management/data_management/content/import_flyout';
import { ExportContentPackFlyout } from '../stream_management/data_management/content/export_flyout';

interface ImportExportPanelProps {
  definition: Streams.all.GetResponse;
  refreshDefinition: () => void;
}

export function ImportExportPanel({ definition, refreshDefinition }: ImportExportPanelProps) {
  const [isExportFlyoutOpen, setIsExportFlyoutOpen] = useState(false);
  const [isImportFlyoutOpen, setIsImportFlyoutOpen] = useState(false);

  return (
    <>
      <EuiPanel hasBorder hasShadow={false} paddingSize="m">
        <EuiTitle size="xs">
          <h2>
            {i18n.translate('xpack.streams.streamOverview.importExportPanel.title', {
              defaultMessage: 'Import & export',
            })}
          </h2>
        </EuiTitle>

        <EuiSpacer size="s" />

        <EuiText color="subdued" size="s">
          {i18n.translate('xpack.streams.streamOverview.importExportPanel.description', {
            defaultMessage:
              "Package and export this stream's configuration including significant events and child streams, or import a package with a guided preview.",
          })}
        </EuiText>

        <EuiSpacer size="m" />

        <EuiFlexGroup gutterSize="s" direction="column">
          <EuiFlexItem>
            <EuiButton
              iconType="download"
              fullWidth
              onClick={() => setIsImportFlyoutOpen(true)}
              data-test-subj="streamsAppImportContentPackButton"
            >
              {i18n.translate('xpack.streams.streamOverview.importExportPanel.importButtonLabel', {
                defaultMessage: 'Import',
              })}
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiButton
              iconType="upload"
              fill
              fullWidth
              onClick={() => setIsExportFlyoutOpen(true)}
              data-test-subj="streamsAppExportContentPackButton"
            >
              {i18n.translate('xpack.streams.streamOverview.importExportPanel.exportButtonLabel', {
                defaultMessage: 'Export',
              })}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>

      {isExportFlyoutOpen && (
        <ExportContentPackFlyout
          onClose={() => setIsExportFlyoutOpen(false)}
          definition={definition}
          onExport={() => setIsExportFlyoutOpen(false)}
        />
      )}

      {isImportFlyoutOpen && (
        <ImportContentPackFlyout
          onClose={() => setIsImportFlyoutOpen(false)}
          definition={definition}
          onImport={() => {
            setIsImportFlyoutOpen(false);
            refreshDefinition();
          }}
        />
      )}
    </>
  );
}
