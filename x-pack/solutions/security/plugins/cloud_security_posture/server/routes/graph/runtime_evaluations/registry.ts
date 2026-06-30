/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IntegrationEvaluations } from './types';

import { aws_bedrockEvaluations } from './integrations/aws_bedrock';
import { aws_bedrock_agentcoreEvaluations } from './integrations/aws_bedrock_agentcore';
import { aws_cloudtrail_otelEvaluations } from './integrations/aws_cloudtrail_otel';
import { aws_securityhubEvaluations } from './integrations/aws_securityhub';
import { aws_vpcflow_otelEvaluations } from './integrations/aws_vpcflow_otel';
import { azure_ai_foundryEvaluations } from './integrations/azure_ai_foundry';
import { azure_app_serviceEvaluations } from './integrations/azure_app_service';
import { azure_openaiEvaluations } from './integrations/azure_openai';
import { checkpoint_emailEvaluations } from './integrations/checkpoint_email';
import { cisco_merakiEvaluations } from './integrations/cisco_meraki';
import { cisco_secure_email_gatewayEvaluations } from './integrations/cisco_secure_email_gateway';
import { cisco_umbrellaEvaluations } from './integrations/cisco_umbrella';
import { citrix_wafEvaluations } from './integrations/citrix_waf';
import { corelightEvaluations } from './integrations/corelight';
import { cyeraEvaluations } from './integrations/cyera';
import { darktraceEvaluations } from './integrations/darktrace';
import { entityanalytics_adEvaluations } from './integrations/entityanalytics_ad';
import { entityanalytics_oktaEvaluations } from './integrations/entityanalytics_okta';
import { extrahopEvaluations } from './integrations/extrahop';
import { forgerockEvaluations } from './integrations/forgerock';
import { fortinet_fortigateEvaluations } from './integrations/fortinet_fortigate';
import { gcp_vertexaiEvaluations } from './integrations/gcp_vertexai';
import { gitlabEvaluations } from './integrations/gitlab';
import { greenhouseEvaluations } from './integrations/greenhouse';
import { infoblox_bloxone_ddiEvaluations } from './integrations/infoblox_bloxone_ddi';
import { jamf_proEvaluations } from './integrations/jamf_pro';
import { linuxEvaluations } from './integrations/linux';
import { m365_defenderEvaluations } from './integrations/m365_defender';
import { microsoft_dhcpEvaluations } from './integrations/microsoft_dhcp';
import { microsoft_intuneEvaluations } from './integrations/microsoft_intune';
import { openaiEvaluations } from './integrations/openai';
import { osqueryEvaluations } from './integrations/osquery';
import { ping_federateEvaluations } from './integrations/ping_federate';
import { ping_oneEvaluations } from './integrations/ping_one';
import { prisma_cloudEvaluations } from './integrations/prisma_cloud';
import { qualys_vmdrEvaluations } from './integrations/qualys_vmdr';
import { salesforceEvaluations } from './integrations/salesforce';
import { servicenowEvaluations } from './integrations/servicenow';
import { slackEvaluations } from './integrations/slack';
import { snortEvaluations } from './integrations/snort';
import { snykEvaluations } from './integrations/snyk';
import { suricataEvaluations } from './integrations/suricata';
import { sysdigEvaluations } from './integrations/sysdig';
import { taniumEvaluations } from './integrations/tanium';
import { ti_mispEvaluations } from './integrations/ti_misp';
import { wizEvaluations } from './integrations/wiz';
import { zscaler_ziaEvaluations } from './integrations/zscaler_zia';

/** All integration evaluation snippets keyed by package code. */
export const allIntegrationEvaluations = {
  aws_bedrock: aws_bedrockEvaluations,
  aws_bedrock_agentcore: aws_bedrock_agentcoreEvaluations,
  aws_cloudtrail_otel: aws_cloudtrail_otelEvaluations,
  aws_securityhub: aws_securityhubEvaluations,
  aws_vpcflow_otel: aws_vpcflow_otelEvaluations,
  azure_ai_foundry: azure_ai_foundryEvaluations,
  azure_app_service: azure_app_serviceEvaluations,
  azure_openai: azure_openaiEvaluations,
  checkpoint_email: checkpoint_emailEvaluations,
  cisco_meraki: cisco_merakiEvaluations,
  cisco_secure_email_gateway: cisco_secure_email_gatewayEvaluations,
  cisco_umbrella: cisco_umbrellaEvaluations,
  citrix_waf: citrix_wafEvaluations,
  corelight: corelightEvaluations,
  cyera: cyeraEvaluations,
  darktrace: darktraceEvaluations,
  entityanalytics_ad: entityanalytics_adEvaluations,
  entityanalytics_okta: entityanalytics_oktaEvaluations,
  extrahop: extrahopEvaluations,
  forgerock: forgerockEvaluations,
  fortinet_fortigate: fortinet_fortigateEvaluations,
  gcp_vertexai: gcp_vertexaiEvaluations,
  gitlab: gitlabEvaluations,
  greenhouse: greenhouseEvaluations,
  infoblox_bloxone_ddi: infoblox_bloxone_ddiEvaluations,
  jamf_pro: jamf_proEvaluations,
  linux: linuxEvaluations,
  m365_defender: m365_defenderEvaluations,
  microsoft_dhcp: microsoft_dhcpEvaluations,
  microsoft_intune: microsoft_intuneEvaluations,
  openai: openaiEvaluations,
  osquery: osqueryEvaluations,
  ping_federate: ping_federateEvaluations,
  ping_one: ping_oneEvaluations,
  prisma_cloud: prisma_cloudEvaluations,
  qualys_vmdr: qualys_vmdrEvaluations,
  salesforce: salesforceEvaluations,
  servicenow: servicenowEvaluations,
  slack: slackEvaluations,
  snort: snortEvaluations,
  snyk: snykEvaluations,
  suricata: suricataEvaluations,
  sysdig: sysdigEvaluations,
  tanium: taniumEvaluations,
  ti_misp: ti_mispEvaluations,
  wiz: wizEvaluations,
  zscaler_zia: zscaler_ziaEvaluations,
} as const satisfies Record<string, IntegrationEvaluations>;
