/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SerializableRecord } from '@kbn/utility-types';
import type { NavExtensionRenderContext } from '@kbn/ui-side-navigation';

/** A declarative action descriptor rendered by the `list` template. */
export interface NavTemplateActionConfig<Data = SerializableRecord> {
  id: string;
  label: string;
  icon: string;
  onClick: (slotId: string, itemData: Data) => void;
}

export interface NavExtensionPointContext extends NavExtensionRenderContext {
  /** Per-placement slot id designated in the navigation tree. */
  slotId: string;
  /** Id of the published extension definition filling the slot. */
  extensionId: string;
}

export interface NavExtensionPointBaseComponentProps<
  Data = SerializableRecord,
  Config = SerializableRecord
> {
  /** Data to render in the template */
  data: Data[];
  /** Configuration for the template */
  config: Config;
  /** Rendering context for the template */
  context: NavExtensionPointContext;
}
