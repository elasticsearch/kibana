/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ESQLMessage } from '@kbn/esql-language';
import type { ESQLTelemetryCallbacks, ESQLCallbacks } from '@kbn/esql-types';
import type { monaco } from '../../../../monaco_imports';

export type MonacoMessage = monaco.editor.IMarkerData & {
  code: ESQLMessage['code'];
  data?: ESQLMessage['data'];
  location?: ESQLMessage['location'];
  // By default warnings are not underlined, use this flag to indicate it should be
  underlinedWarning?: ESQLMessage['underlinedWarning'];
};

export type ESQLDependencies = ESQLCallbacks &
  Partial<{
    telemetry: ESQLTelemetryCallbacks;
    /**
     * Latest validation messages (errors + warnings) for the current model.
     */
    getEditorMessages?: () => { errors: MonacoMessage[]; warnings: MonacoMessage[] };
    /**
     * When true, a "Fix with AI" code action is added alongside the standard quick fixes.
     * Requires an Enterprise license and an AI connector configured.
     */
    isSuggestFixEnabled: boolean;
    /**
     * Optional resolver to provide model-specific dependencies.
     *
     * Monaco language providers are global per language, but Kibana can render multiple ES|QL
     * editors on the same page (e.g. Discover top bar + flyout). This allows the provider to
     * pick the correct callbacks for the specific editor model requesting suggestions.
     */
    getModelDependencies: (model: monaco.editor.ITextModel) => ESQLDependencies | undefined;
  }>;
