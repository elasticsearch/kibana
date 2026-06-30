/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  DeprecationsDetails,
  GetDeprecationsContext,
  Logger,
  DocLinksServiceSetup,
} from '@kbn/core/server';

import { i18n } from '@kbn/i18n';
import { asSpaceId, getSpaceUrlPrefix } from '@kbn/core-spaces-common';
import { DETECTION_ENGINE_SIGNALS_MIGRATION_STATUS_URL } from '../../common/constants';
import type { ConfigType } from '../config';

import { getNonMigratedSignalsInfo } from '../lib/detection_engine/migrations/get_non_migrated_signals_info';

const constructMigrationApiCall = (space: string, range: string) =>
  // `space` is parsed from signals index names; validate-and-brand at this boundary.
  `GET <kibana host>:<port>${getSpaceUrlPrefix(
    asSpaceId(space)
  )}${DETECTION_ENGINE_SIGNALS_MIGRATION_STATUS_URL}?from=${range}`;

export const getSignalsMigrationDeprecationsInfo = async (
  ctx: GetDeprecationsContext,
  config: ConfigType,
  logger: Logger,
  docLinks: DocLinksServiceSetup
): Promise<DeprecationsDetails[]> => {
  const esClient = ctx.esClient.asInternalUser;
  const { isMigrationRequired, spaces } = await getNonMigratedSignalsInfo({
    esClient,
    signalsIndex: config.signalsIndex,
    logger,
  });
  // Deprecation API requires time range to be part of request (https://www.elastic.co/guide/en/security/current/signals-migration-api.html#migration-1)
  // Return the earliest date, so it would capture the oldest possible signals
  const fromRange = new Date(0).toISOString();

  if (isMigrationRequired) {
    return [
      {
        deprecationType: 'feature',
        title: i18n.translate('xpack.securitySolution.deprecations.signalsMigrationTitle', {
          defaultMessage: 'Found not migrated detection alerts',
        }),
        level: 'warning',
        message: i18n.translate('xpack.securitySolution.deprecations.signalsMigrationMessage', {
          defaultMessage: `After upgrading Kibana, the latest Elastic Security features will be available for any newly generated detection alerts. However, in order to enable new features for existing detection alerts, migration may be necessary.`,
        }),
        documentationUrl: docLinks.links.securitySolution.signalsMigrationApi,
        correctiveActions: {
          manualSteps: [
            i18n.translate(
              'xpack.securitySolution.deprecations.migrateIndexIlmPolicy.signalsMigrationManualStepOne',
              {
                defaultMessage: `Visit "Learn more" link for instructions how to migrate detection alerts. Migrate indices for each space.`,
              }
            ),
            i18n.translate(
              'xpack.securitySolution.deprecations.migrateIndexIlmPolicy.signalsMigrationManualStepTwo',
              {
                defaultMessage: 'Spaces with at least one non-migrated signals index: {spaces}.',
                values: {
                  spaces: spaces.join(', '),
                },
              }
            ),
            i18n.translate(
              'xpack.securitySolution.deprecations.migrateIndexIlmPolicy.signalsMigrationManualStepFour',
              {
                defaultMessage: 'Example of migration API calls:',
              }
            ),
            ...spaces.map((space) => constructMigrationApiCall(space, fromRange)),
          ],
        },
      },
    ];
  }

  return [];
};
