/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { PublicStepDefinition } from '@kbn/workflows-extensions/public';
import { fetchSourceStepCommonDefinition } from '../../../../../common/threat_intelligence/workflows/step_types/fetch_source/fetch_source_common';

/**
 * Public-side step definition for `threat_intel.fetch_source`.
 *
 * Pairs with the server-side `buildFetchSourceStepDefinition` so the YAML
 * editor's strict schema validator (see
 * `workflows_management/public/features/validate_workflow_yaml/model/use_workflow_json_schema.ts`)
 * recognises the step type. Without this the editor falls back to the
 * connector-step branch of the discriminated union and reports
 * "Missing property 'connector-id'" / "Value must be <connector list>"
 * for every reference to `threat_intel.fetch_source` — including in
 * `server/threat_intelligence/workflows/source_ingestion.yaml`.
 *
 * The actual handler lives server-side; this definition only contributes
 * the input/output schemas + metadata that the editor needs to validate
 * `with`, `foreach`, and downstream variable references.
 */
export const fetchSourceStepDefinition: PublicStepDefinition = {
  ...fetchSourceStepCommonDefinition,
  icon: React.lazy(() =>
    import('@elastic/eui/es/components/icon/assets/download')
      .then(({ icon }) => ({ default: icon }))
      .catch(() =>
        import('@elastic/eui/es/components/icon/assets/globe').then(({ icon }) => ({
          default: icon,
        }))
      )
  ),
};
