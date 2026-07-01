/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { z } from '@kbn/zod/v4';
import type {
  InstallFormFieldOptionSchema,
  InstallFormFieldSchema,
  InstallFormFieldTypeSchema,
  InstallFormSchema,
} from '../schemas/install_form';

/**
 * The set of input widgets a template's install form can render. Each field's
 * `inputType` selects which renderer the install UI uses and which type-specific
 * properties on `InstallFormField` apply.
 */
export type InstallFormFieldType = z.infer<typeof InstallFormFieldTypeSchema>;

export type InstallFormFieldOption = z.infer<typeof InstallFormFieldOptionSchema>;

/**
 * A single install-time input declared by a template's `install.form` block.
 *
 * `name` is the identifier referenced from the workflow body via
 * `__install__.<name>` — the installer rewrites those references to the
 * submitted form values when persisting the workflow. Names are kebab-case by
 * convention (e.g. `abuseipdb-connector`); they never surface to end users.
 */
export type InstallFormField = z.infer<typeof InstallFormFieldSchema>;

/**
 * The inferred type for the `template-metadata.install` block. Declared
 * alongside the schema (rather than in `../types/install_form.ts`) so the
 * type-namespace `InstallFormSchema` and the value-namespace
 * `InstallFormSchema` (the Zod schema) co-exist in a single module — TS
 * merges them naturally at this scope but a cross-file `export *`
 * collision would error.
 */
export type InstallForm = z.infer<typeof InstallFormSchema>;
