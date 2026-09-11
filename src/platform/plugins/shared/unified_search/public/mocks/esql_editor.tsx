/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { forwardRef } from 'react';
import { withSuspense } from '@kbn/shared-ux-utility';
import type { ESQLEditorProps, RestorableStateProviderApi } from '@kbn/esql-editor';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';

const ESQLEditorLazy = React.lazy(() => import('@kbn/esql-editor'));
const ESQLEditor = withSuspense(ESQLEditorLazy);

function createEditor() {
  return forwardRef<RestorableStateProviderApi, ESQLEditorProps>(function ESQLLangEditor(
    props,
    ref
  ) {
    return (
      <KibanaContextProvider
        services={{
          settings: { client: { get: () => {} } },
          uiSettings: { get: () => {} },
        }}
      >
        <ESQLEditor ref={ref} {...props} />
      </KibanaContextProvider>
    );
  });
}

export const ESQLLangEditor = createEditor();
