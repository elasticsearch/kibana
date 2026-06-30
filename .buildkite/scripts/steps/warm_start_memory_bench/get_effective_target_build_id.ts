/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EFFECTIVE_BUILD_ID_METADATA_KEY } from './constants';

export interface EffectiveTargetBuildIdOptions {
  readonly getMetadata: (key: string, defaultValue?: string | null) => string | null;
  readonly buildkiteBuildId?: string;
}

export const getEffectiveTargetBuildId = ({
  getMetadata,
  buildkiteBuildId,
}: EffectiveTargetBuildIdOptions): string => {
  const fromMetadata = getMetadata(EFFECTIVE_BUILD_ID_METADATA_KEY);
  if (fromMetadata) {
    return fromMetadata;
  }

  if (buildkiteBuildId) {
    return buildkiteBuildId;
  }

  throw new Error(
    `Could not resolve target build id: metadata "${EFFECTIVE_BUILD_ID_METADATA_KEY}" is unset and BUILDKITE_BUILD_ID is missing`
  );
};
