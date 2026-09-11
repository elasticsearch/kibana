/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import React, { Suspense } from 'react';
import type { EuiFlyoutProps } from '@elastic/eui';
import { EuiButtonIcon, EuiToolTip } from '@elastic/eui';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { helpLabel } from '@kbn/esql-editor';
import { useKibanaServices } from './kibana_services';

const LazyESQLMenu = React.lazy(async () => {
  const module = await import('@kbn/esql-editor');
  return { default: module.ESQLMenu };
});

const LazyEsqlEditorActionsProvider = React.lazy(async () => {
  const module = await import('@kbn/esql-editor');
  return { default: module.EsqlEditorActionsProvider };
});

const helpPopoverFallback = (
  <EuiToolTip position="top" content={helpLabel} disableScreenReaderOutput>
    <EuiButtonIcon
      iconType="question"
      size="xs"
      aria-label={helpLabel}
      data-test-subj="esql-help-popover-button"
      color="text"
      isDisabled
    />
  </EuiToolTip>
);

export const ESQLMenu: React.FC<{
  hideHistory?: boolean;
  onESQLDocsFlyoutVisibilityChanged?: (isOpen: boolean) => void;
  docsFlyoutSize?: EuiFlyoutProps['size'];
}> = (props) => {
  const deps = useKibanaServices();

  const content = (
    <Suspense fallback={helpPopoverFallback}>
      <LazyESQLMenu {...props} />
    </Suspense>
  );

  if (!deps) {
    return null;
  }

  return <KibanaContextProvider services={{ ...deps }}>{content}</KibanaContextProvider>;
};

export const EsqlEditorActionsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <Suspense fallback={<>{children}</>}>
    <LazyEsqlEditorActionsProvider>{children}</LazyEsqlEditorActionsProvider>
  </Suspense>
);
