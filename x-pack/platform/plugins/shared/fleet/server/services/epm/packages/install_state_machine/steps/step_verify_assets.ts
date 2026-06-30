/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { PackageAssetsVerificationError } from '../../../../../errors';
import { verifyEsAssetsExist } from '../../verify_es_assets';
import { withPackageSpan } from '../../utils';

import type { InstallContext } from '../_state_machine_package_install';

export async function stepVerifyAssets(context: InstallContext) {
  const { logger, esClient, installedPkg } = context;

  const esReferences = context.esReferences ?? installedPkg?.attributes.installed_es ?? [];

  if (esReferences.length === 0) {
    logger.debug('stepVerifyAssets: no ES asset references to verify, skipping');
    return;
  }

  const missingAssets = await withPackageSpan('Verify ES assets', () =>
    verifyEsAssetsExist(esClient, esReferences, logger)
  );

  if (missingAssets.length > 0) {
    logger.error(
      `stepVerifyAssets: ${
        missingAssets.length
      } ES asset(s) missing after installation: ${missingAssets
        .map((a) => `${a.type}/${a.id}`)
        .join(', ')}`
    );
    throw new PackageAssetsVerificationError(missingAssets.map(({ id, type }) => ({ id, type })));
  }

  logger.debug(`stepVerifyAssets: all ${esReferences.length} ES asset(s) verified successfully`);
}
