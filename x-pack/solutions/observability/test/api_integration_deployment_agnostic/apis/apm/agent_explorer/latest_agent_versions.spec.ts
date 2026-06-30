/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { ElasticApmAgentLatestVersion } from '@kbn/apm-plugin/common/agent_explorer';
import expect from '@kbn/expect';
import type { DeploymentAgnosticFtrProviderContext } from '../../../ftr_provider_context';

export default function ApiTest({ getService }: DeploymentAgnosticFtrProviderContext) {
  const apmApiClient = getService('apmApi');
  const unlistedAgentName = 'unlistedAgent';

  async function callApi() {
    return apmApiClient.readUser({
      endpoint: 'GET /internal/apm/get_latest_agent_versions',
    });
  }

  // The latest agent versions are fetched live from an external service
  // (`xpack.apm.latestAgentVersionsUrl`). This deployment-agnostic suite runs on
  // Cloud lanes too and cannot override that URL, so the assertions below verify
  // only the route contract (always 200 with a well-formed `data` object) and
  // never the externally sourced version content, which is covered by the
  // `fetch_agents_latest_version` unit test. Asserting on the external payload
  // here made the test flaky whenever the upstream service was briefly degraded.
  // See https://github.com/elastic/kibana/issues/264146
  describe('Agent latest versions when configuration is defined', () => {
    it('returns a well-formed response', async () => {
      const { status, body } = await callApi();
      expect(status).to.be(200);
      expect(body.data).to.be.an('object');
    });

    it('does not return a version for an agent that is not listed', async () => {
      const { status, body } = await callApi();
      expect(status).to.be(200);

      const agents = body.data;

      // @ts-ignore
      const unlistedAgent = agents[unlistedAgentName] as ElasticApmAgentLatestVersion;
      expect(unlistedAgent?.latest_version).to.be(undefined);
    });
  });
}
