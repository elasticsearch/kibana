/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';

import type { FtrProviderContext } from '../../../ftr_provider_context';
import { API_BASE_PATH } from './constants';

export default function ({ getService }: FtrProviderContext) {
  const supertest = getService('supertest');
  const es = getService('es');

  const getSnapshotRepositories = () => supertest.get(`${API_BASE_PATH}/snapshot_repositories`);

  const DEFAULT_REPOSITORY_SETTING = 'repositories.default_repository';
  const REPOSITORY_NAME = 'snapshot-repositories-test-repo';

  const clearDefaultRepository = () =>
    es.cluster.putSettings({
      persistent: { [DEFAULT_REPOSITORY_SETTING]: null },
    });

  const createRepository = () =>
    es.snapshot.createRepository({
      name: REPOSITORY_NAME,
      body: {
        type: 'fs',
        settings: {
          // Use one of the locations defined in path.repo in the api_integration config
          location: '/tmp/repo',
        },
      },
      verify: false,
    });

  describe('snapshot repositories', () => {
    const cleanup = async () => {
      await clearDefaultRepository();
      await es.snapshot.deleteRepository({ name: REPOSITORY_NAME }, { ignore: [404] });
    };

    before(async () => await cleanup());
    after(async () => await cleanup());

    it('reports no default repository when none is configured', async () => {
      await clearDefaultRepository();

      const { body } = await getSnapshotRepositories().expect(200);

      // defaultRepository is undefined and therefore omitted from the JSON response
      expect(Object.keys(body).sort()).to.eql(
        ['canCreateRepository', 'hasDefaultRepository'].sort()
      );
      expect(body.canCreateRepository).to.be.a('boolean');
      expect(body.hasDefaultRepository).to.be(false);
      expect(body.defaultRepository).to.be(undefined);
    });

    it('reports the configured default repository', async () => {
      // A repository must be registered before it can be set as the cluster default
      await createRepository();
      await es.cluster.putSettings({
        persistent: { [DEFAULT_REPOSITORY_SETTING]: REPOSITORY_NAME },
      });

      const { body } = await getSnapshotRepositories().expect(200);

      expect(body.hasDefaultRepository).to.be(true);
      expect(body.defaultRepository).to.be(REPOSITORY_NAME);
      expect(body.canCreateRepository).to.be.a('boolean');
    });
  });
}
