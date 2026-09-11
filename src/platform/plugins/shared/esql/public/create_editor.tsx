/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { forwardRef } from 'react';
import { EuiLoadingSpinner } from '@elastic/eui';
import useAsync from 'react-use/lib/useAsync';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import type { ESQLEditorProps, RestorableStateProviderApi } from '@kbn/esql-editor';
import { untilPluginStartServicesReady } from './kibana_services';

export const ESQLLangEditor = forwardRef<RestorableStateProviderApi, ESQLEditorProps>(
  function ESQLLangEditor(props, ref) {
    const { loading, value } = useAsync(() => {
      const startServicesPromise = untilPluginStartServicesReady();
      const modulePromise = import('@kbn/esql-editor');
      return Promise.all([startServicesPromise, modulePromise]);
    }, []);

    const ESQLEditor = value?.[1]?.default;
    const deps = value?.[0];

    if (loading || !deps || !ESQLEditor) return <EuiLoadingSpinner />;

    return (
      <KibanaContextProvider
        services={{
          ...deps,
        }}
      >
        <ESQLEditor ref={ref} {...props} />
      </KibanaContextProvider>
    );
  }
);
