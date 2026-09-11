/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export type { DataErrorsControl } from './src/types';
export type { ESQLEditorProps } from './src/esql_editor';
export type { RestorableStateProviderApi } from '@kbn/restorable-state';
import { ESQLEditor } from './src/esql_editor';
export type { ESQLEditorRestorableState } from './src/restorable_state';
export { ESQLMenu } from './src/editor_menu';
export { esqlKeyboardShortcuts } from './src/editor_footer/esql_keyboard_shortcuts';
export { EsqlEditorActionsProvider } from './src/editor_actions_context';
export { helpLabel } from './src/editor_menu/menu_i18n';

export { registerESQLEditorAnalyticsEvents } from './src/telemetry/events_registration';
export { ESQLEditorTelemetryService } from './src/telemetry/telemetry_service';

export { reportEsqlError } from './src/report_error';
export type { ReportEsqlErrorOptions } from './src/report_error';

// React.lazy support
// eslint-disable-next-line import/no-default-export
export default ESQLEditor;
