import expect from '@kbn/expect';
import { MessageRole, type Message } from '@kbn/observability-ai-assistant-plugin/common';
import { ELASTICSEARCH_FUNCTION_NAME } from '@kbn/observability-ai-assistant-plugin/server/functions/elasticsearch';
import { createLlmProxy, LlmProxy } from '../utils/create_llm_proxy';
import {
  getMessageAddedEvents,
  invokeChatCompleteWithFunctionRequest,
} from '../utils/conversation';
import type { DeploymentAgnosticFtrProviderContext } from '../../../ftr_provider_context';

export default function ApiTest({ getService }: DeploymentAgnosticFtrProviderContext) {
  const log = getService('log');
  const observabilityAIAssistantAPIClient = getService('observabilityAIAssistantApi');

  describe('tool: elasticsearch tool restrictions', function () {
    // Fails on MKI: https://github.com/elastic/kibana/issues/205581
    this.tags(['skipCloud']);
    let proxy: LlmProxy;
    let connectorId: string;

    before(async () => {
      proxy = await createLlmProxy(log);
      connectorId = await observabilityAIAssistantAPIClient.createProxyActionConnector({
        port: proxy.getPort(),
      });
    });

    after(async () => {
      proxy.close();
      await observabilityAIAssistantAPIClient.deleteActionConnector({
        actionId: connectorId,
      });
    });

    describe('Allowed Operations', () => {
      it('should allow GET requests to any endpoint', async () => {
        void proxy.interceptWithResponse('Hello from LLM Proxy');

        const responseBody = await invokeChatCompleteWithFunctionRequest({
          connectorId,
          observabilityAIAssistantAPIClient,
          functionCall: {
            name: ELASTICSEARCH_FUNCTION_NAME,
            trigger: MessageRole.User,
            arguments: JSON.stringify({
              method: 'GET',
              path: '/_cluster/health',
            }),
          },
        });

        await proxy.waitForAllInterceptorsToHaveBeenCalled();

        const events = getMessageAddedEvents(responseBody);
        const esFunctionResponse = events[0];
        
        expect(esFunctionResponse.message.message.name).to.be(ELASTICSEARCH_FUNCTION_NAME);
        // Function should succeed - response should contain actual data, not an error
        const content = JSON.parse(esFunctionResponse.message.message.content!);
        expect(content).to.have.property('response');
        expect(content.response).to.not.have.property('error');
      });

      it('should allow POST requests to _search endpoint', async () => {
        void proxy.interceptWithResponse('Hello from LLM Proxy');

        const responseBody = await invokeChatCompleteWithFunctionRequest({
          connectorId,
          observabilityAIAssistantAPIClient,
          functionCall: {
            name: ELASTICSEARCH_FUNCTION_NAME,
            trigger: MessageRole.User,
            arguments: JSON.stringify({
              method: 'POST',
              path: '/_search',
              body: { query: { match_all: {} } },
            }),
          },
        });

        await proxy.waitForAllInterceptorsToHaveBeenCalled();

        const events = getMessageAddedEvents(responseBody);
        const esFunctionResponse = events[0];
        
        expect(esFunctionResponse.message.message.name).to.be(ELASTICSEARCH_FUNCTION_NAME);
        // Function should succeed - response should contain actual data, not an error
        const content = JSON.parse(esFunctionResponse.message.message.content!);
        expect(content).to.have.property('response');
        expect(content.response).to.not.have.property('error');
      });

      it('should allow POST requests to nested _search endpoints', async () => {
        void proxy.interceptWithResponse('Hello from LLM Proxy');

        const responseBody = await invokeChatCompleteWithFunctionRequest({
          connectorId,
          observabilityAIAssistantAPIClient,
          functionCall: {
            name: ELASTICSEARCH_FUNCTION_NAME,
            trigger: MessageRole.User,
            arguments: JSON.stringify({
              method: 'POST',
              path: '/my-index/_search',
              body: { query: { match_all: {} } },
            }),
          },
        });

        await proxy.waitForAllInterceptorsToHaveBeenCalled();

        const events = getMessageAddedEvents(responseBody);
        const esFunctionResponse = events[0];
        
        expect(esFunctionResponse.message.message.name).to.be(ELASTICSEARCH_FUNCTION_NAME);
        // Function should succeed - response should contain actual data, not an error
        const content = JSON.parse(esFunctionResponse.message.message.content!);
        expect(content).to.have.property('response');
        expect(content.response).to.not.have.property('error');
      });
    });

    describe('Disallowed Operations', () => {
      it('should reject PUT requests', async () => {
        void proxy.interceptWithResponse('Hello from LLM Proxy');

        const responseBody = await invokeChatCompleteWithFunctionRequest({
          connectorId,
          observabilityAIAssistantAPIClient,
          functionCall: {
            name: ELASTICSEARCH_FUNCTION_NAME,
            trigger: MessageRole.User,
            arguments: JSON.stringify({
              method: 'PUT',
              path: '/my-index',
              body: { mappings: { properties: {} } },
            }),
          },
        });

        await proxy.waitForAllInterceptorsToHaveBeenCalled();

        const events = getMessageAddedEvents(responseBody);
        const esFunctionResponse = events[0];
        
        expect(esFunctionResponse.message.message.name).to.be(ELASTICSEARCH_FUNCTION_NAME);
        // Function should fail - response should contain an error
        const content = JSON.parse(esFunctionResponse.message.message.content!);
        expect(content).to.have.property('error');
        expect(content.error).to.contain('Only GET requests or POST requests to the "_search" endpoint are permitted');
      });

      it('should reject DELETE requests', async () => {
        void proxy.interceptWithResponse('Hello from LLM Proxy');

        const responseBody = await invokeChatCompleteWithFunctionRequest({
          connectorId,
          observabilityAIAssistantAPIClient,
          functionCall: {
            name: ELASTICSEARCH_FUNCTION_NAME,
            trigger: MessageRole.User,
            arguments: JSON.stringify({
              method: 'DELETE',
              path: '/my-index',
            }),
          },
        });

        await proxy.waitForAllInterceptorsToHaveBeenCalled();

        const events = getMessageAddedEvents(responseBody);
        const esFunctionResponse = events[0];
        
        expect(esFunctionResponse.message.message.name).to.be(ELASTICSEARCH_FUNCTION_NAME);
        // Function should fail - response should contain an error
        const content = JSON.parse(esFunctionResponse.message.message.content!);
        expect(content).to.have.property('error');
        expect(content.error).to.contain('Only GET requests or POST requests to the "_search" endpoint are permitted');
      });

      it('should reject PATCH requests', async () => {
        void proxy.interceptWithResponse('Hello from LLM Proxy');

        const responseBody = await invokeChatCompleteWithFunctionRequest({
          connectorId,
          observabilityAIAssistantAPIClient,
          functionCall: {
            name: ELASTICSEARCH_FUNCTION_NAME,
            trigger: MessageRole.User,
            arguments: JSON.stringify({
              method: 'PATCH',
              path: '/my-index/_doc/1',
              body: { doc: { field: 'value' } },
            }),
          },
        });

        await proxy.waitForAllInterceptorsToHaveBeenCalled();

        const events = getMessageAddedEvents(responseBody);
        const esFunctionResponse = events[0];
        
        expect(esFunctionResponse.message.message.name).to.be(ELASTICSEARCH_FUNCTION_NAME);
        // Function should fail - response should contain an error
        const content = JSON.parse(esFunctionResponse.message.message.content!);
        expect(content).to.have.property('error');
        expect(content.error).to.contain('Only GET requests or POST requests to the "_search" endpoint are permitted');
      });

      it('should reject POST requests to non-search endpoints', async () => {
        void proxy.interceptWithResponse('Hello from LLM Proxy');

        const responseBody = await invokeChatCompleteWithFunctionRequest({
          connectorId,
          observabilityAIAssistantAPIClient,
          functionCall: {
            name: ELASTICSEARCH_FUNCTION_NAME,
            trigger: MessageRole.User,
            arguments: JSON.stringify({
              method: 'POST',
              path: '/my-index/_doc',
              body: { field: 'value' },
            }),
          },
        });

        await proxy.waitForAllInterceptorsToHaveBeenCalled();

        const events = getMessageAddedEvents(responseBody);
        const esFunctionResponse = events[0];
        
        expect(esFunctionResponse.message.message.name).to.be(ELASTICSEARCH_FUNCTION_NAME);
        // Function should fail - response should contain an error
        const content = JSON.parse(esFunctionResponse.message.message.content!);
        expect(content).to.have.property('error');
        expect(content.error).to.contain('Only GET requests or POST requests to the "_search" endpoint are permitted');
      });

      it('should reject POST requests to endpoints ending with _search but not being _search', async () => {
        void proxy.interceptWithResponse('Hello from LLM Proxy');

        const responseBody = await invokeChatCompleteWithFunctionRequest({
          connectorId,
          observabilityAIAssistantAPIClient,
          functionCall: {
            name: ELASTICSEARCH_FUNCTION_NAME,
            trigger: MessageRole.User,
            arguments: JSON.stringify({
              method: 'POST',
              path: '/my-index/custom_search',
              body: { query: { match_all: {} } },
            }),
          },
        });

        await proxy.waitForAllInterceptorsToHaveBeenCalled();

        const events = getMessageAddedEvents(responseBody);
        const esFunctionResponse = events[0];
        
        expect(esFunctionResponse.message.message.name).to.be(ELASTICSEARCH_FUNCTION_NAME);
        // Function should fail - response should contain an error
        const content = JSON.parse(esFunctionResponse.message.message.content!);
        expect(content).to.have.property('error');
        expect(content.error).to.contain('Only GET requests or POST requests to the "_search" endpoint are permitted');
      });
    });

    describe('Edge Cases', () => {
      it('should handle paths with query parameters correctly', async () => {
        void proxy.interceptWithResponse('Hello from LLM Proxy');

        const responseBody = await invokeChatCompleteWithFunctionRequest({
          connectorId,
          observabilityAIAssistantAPIClient,
          functionCall: {
            name: ELASTICSEARCH_FUNCTION_NAME,
            trigger: MessageRole.User,
            arguments: JSON.stringify({
              method: 'GET',
              path: '/_cluster/health?pretty=true',
            }),
          },
        });

        await proxy.waitForAllInterceptorsToHaveBeenCalled();

        const events = getMessageAddedEvents(responseBody);
        const esFunctionResponse = events[0];
        
        expect(esFunctionResponse.message.message.name).to.be(ELASTICSEARCH_FUNCTION_NAME);
        // Function should succeed - response should contain actual data, not an error
        const content = JSON.parse(esFunctionResponse.message.message.content!);
        expect(content).to.have.property('response');
        expect(content.response).to.not.have.property('error');
      });

      it('should handle POST _search with query parameters', async () => {
        void proxy.interceptWithResponse('Hello from LLM Proxy');

        const responseBody = await invokeChatCompleteWithFunctionRequest({
          connectorId,
          observabilityAIAssistantAPIClient,
          functionCall: {
            name: ELASTICSEARCH_FUNCTION_NAME,
            trigger: MessageRole.User,
            arguments: JSON.stringify({
              method: 'POST',
              path: '/_search?scroll=1m',
              body: { query: { match_all: {} } },
            }),
          },
        });

        await proxy.waitForAllInterceptorsToHaveBeenCalled();

        const events = getMessageAddedEvents(responseBody);
        const esFunctionResponse = events[0];
        
        expect(esFunctionResponse.message.message.name).to.be(ELASTICSEARCH_FUNCTION_NAME);
        // Function should succeed - response should contain actual data, not an error
        const content = JSON.parse(esFunctionResponse.message.message.content!);
        expect(content).to.have.property('response');
        expect(content.response).to.not.have.property('error');
      });
    });
  });
}
