/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import {
  DASHBOARD_MIGRATION_PROGRESS_BAR,
  DASHBOARD_MIGRATIONS_GROUP_PANEL,
  MIGRATION_PANEL_NAME,
  ONBOARDING_SIEM_MIGRATIONS_LIST,
  ONBOARDING_TRANSLATIONS_RESULT_TABLE,
} from '../../../../screens/siem_migrations';
import { deleteConnectors } from '../../../../tasks/api_calls/common';
import { suppressGlobalAnnouncements } from '../../../../tasks/api_calls/suppress_global_announcements';
import { createBedrockConnector } from '../../../../tasks/api_calls/connectors';
import { cleanDashboardsMigrationData } from '../../../../tasks/api_calls/siem_migrations';
import { visit } from '../../../../tasks/navigation';
import {
  openUploadDashboardsFlyout,
  renameMigration,
  saveDefaultMigrationName,
  selectMigrationConnector,
  startDashboardMigrationFromFlyout,
  toggleMigrateDashboardsCard,
  uploadDashboards,
} from '../../../../tasks/siem_migrations';
import { GET_STARTED_URL } from '../../../../urls/navigation';
import { role } from '../common/role';

export const SPLUNK_TEST_DASHBOARDS = [
  {
    preview: false,
    result: {
      id: 'https://127.0.0.1:8089/servicesNS/nobody/Splunk_Security_Essentials/data/ui/views/mitre_focused_content_recommendation',
      label: 'MITRE ATT&CK-Driven Content Recommendation',
      title: 'mitre_focused_content_recommendation',
      'eai:data':
        '<form version="1.1" script="runPageScript.js">\n  <init>\n    <set token="showIntro">1</set>\n  </init>\n  <label>MITRE ATT&amp;CK-Driven Content Recommendation</label>\n  <search id="data_inventory_built">\n    <query>| inputlookup data_inventory_products_lookup | search stage="all-done" </query>\n    <done>\n      <condition match="$job.resultCount$>0">\n        <unset token="dataInventoryNotBuilt">1</unset>\n        <set token="dataInventoryBuilt">1</set>\n      </condition>\n      <condition match="$job.resultCount$=0">\n        <set token="dataInventoryNotBuilt">1</set>\n        <unset token="dataInventoryBuilt">1</unset>\n        <set token="data_available">*</set>\n        <set token="form.data_available">*</set>\n      </condition>\n    </done>\n  </search>\n  <search id="listOfContent">\n    <query>\n      |sseanalytics | table * \n    </query>\n  </search>\n  <search id="focusedList" base="listOfContent">\n    <query>\n      | search $categories$ $data_available$ $popularity$\n    </query>\n    <done>\n      <set token="allready">1</set>\n      <unset token="showIntro"></unset>\n    </done>\n    <progress>\n      <unset token="allready"></unset>\n      \n      <set token="showIntro">1</set>\n    </progress>\n  </search>\n  <search id="listOfMITRE" base="listOfContent">\n    <query>\n      | search mitre_technique!=""\n    </query>\n  </search>\n  <search id="listOfMITREDA" base="listOfContent">\n    <query>\n      | search mitre_technique!="" $data_available$\n    </query>\n  </search>\n  <search id="listOfMITREDAPopular" base="listOfContent">\n    <query>\n      | search mitre_technique!="" $data_available$ $popularity$\n    </query>\n  </search>\n  <fieldset submitButton="false">\n    <input type="multiselect" token="categories" searchWhenChanged="true">\n      <label>Categories</label>\n      <valuePrefix>category="</valuePrefix>\n      <valueSuffix>"</valueSuffix>\n      <delimiter> OR </delimiter>\n      <fieldForLabel>category</fieldForLabel>\n      <fieldForValue>category</fieldForValue>\n      <search>\n        <query>| sseanalytics | stats count by category | search category!=""</query>\n        <earliest>-24h@h</earliest>\n        <latest>now</latest>\n      </search>\n    </input>\n    <input type="dropdown" token="data_available">\n      <label>Content with Available Data</label>\n      <choice value="data_available=&quot;good&quot;">Available Data Only</choice>\n      <choice value="*">All Content</choice>\n      <default>data_available="good"</default>\n    </input>\n    <input type="dropdown" token="popularity" searchWhenChanged="true">\n      <label>Popularity w/ Threat Groups</label>\n      <choice value="mitre_techniques_avg_group_popularity&gt;=10">Very: &gt;= 10 Groups</choice>\n      <choice value="mitre_techniques_avg_group_popularity&gt;=3">Fairly: &gt;= 3 Groups</choice>\n      <choice value="mitre_techniques_avg_group_popularity&gt;0">Used: &gt;0 Groups</choice>\n      <choice value="*">All Content</choice>\n      <default>mitre_techniques_avg_group_popularity&gt;=3</default>\n    </input>\n  </fieldset>\n  <row depends="$showIntro$">\n    <panel>\n      <title>Intro</title>\n      <html>\n        <p>This page will provide specific content recommendations based on your needs and your available data. To give you a good starting point, it also pulls in MITRE ATT&amp;CK and shows only the Splunk content that is mapped to ATT&amp;CK Techniques that MITRE has shown to be popular with multiple threat groups.</p>\n      <p>To get started, select a content category in the dropdown above. If desired, you can disabled the data availability filter, and use the popularity filter to show more or less content.</p>\n      </html>\n    </panel>\n  </row>\n  <row depends="$allready$">\n    <panel>\n      <html>\n        <div id="allEventsTab"></div>\n      </html>\n    </panel>\n  </row>\n  <row depends="$allready$">\n    <panel>\n      <title>Total Content</title>\n      <single>\n        <search base="listOfContent">\n          <query>| stats count</query>\n        </search>\n      </single>\n    </panel>\n    <panel>\n      <title>Content that Meets Your Criteria</title>\n      <single>\n        <search base="focusedList">\n          <query>| stats count</query>\n        </search>\n      </single>\n    </panel>\n  </row>\n  <row depends="$allready$">\n    <panel>\n      <title>Content List</title>\n      <html>\n        <div id="content_list">\n          \n        </div>\n      </html>\n    </panel>\n  </row>\n</form>',
      'eai:acl.app': 'Splunk_Security_Essentials',
      'eai:acl.sharing': 'app',
      'eai:acl.owner': 'nobody',
      updated: '1970-01-01T00:00:00+00:00',
    },
  },
  {
    preview: false,
    result: {
      id: 'https://127.0.0.1:8089/servicesNS/nobody/search/data/ui/views/dashboards_extraction',
      label: 'Dashboards extraction',
      title: 'dashboards_extraction',
      'eai:data':
        '<form version="1.1" theme="light">\n  <label>Dashboards extraction</label>\n  <fieldset submitButton="false" autoRun="true">\n    <input type="dropdown" token="select_app" searchWhenChanged="true">\n      <label>Select app</label>\n      <default>search</default>\n      <initialValue>search</initialValue>\n      <fieldForLabel>eai:acl.app</fieldForLabel>\n      <fieldForValue>eai:acl.app</fieldForValue>\n      <search>\n        <query>| rest /servicesNS/-/-/data/ui/views \n| stats count by eai:acl.app\n| fields - count</query>\n        <earliest>-24h@h</earliest>\n        <latest>now</latest>\n      </search>\n    </input>\n    <input type="multiselect" token="filter_options" searchWhenChanged="true">\n      <label>Filters</label>\n      <choice value="eai:acl.owner!=&quot;nobody&quot;">Exclude default</choice>\n      <choice value="*">Include all</choice>\n      <delimiter> AND </delimiter>\n      <default>"eai:acl.owner!=""nobody"""</default>\n      <initialValue>eai:acl.owner!="nobody"</initialValue>\n    </input>\n    <input type="dropdown" token="select_dashboard" searchWhenChanged="true">\n      <label>Select dashboard</label>\n      <fieldForLabel>label</fieldForLabel>\n      <fieldForValue>title</fieldForValue>\n      <search>\n        <query>| rest /servicesNS/-/-/data/ui/views \n| search eai:acl.app = "$select_app$" $filter_options$\n| stats count by title, label\n| fields - count</query>\n        <earliest>-24h@h</earliest>\n        <latest>now</latest>\n      </search>\n    </input>\n  </fieldset>\n  <row>\n    <panel>\n      <title>Dashboards for select app</title>\n      <single>\n        <search>\n          <query>| rest /servicesNS/-/-/data/ui/views \n| search eai:acl.app = "$select_app$" $filter_options$\n| stats count</query>\n          <earliest>-24h@h</earliest>\n          <latest>now</latest>\n        </search>\n        <option name="drilldown">none</option>\n        <option name="refresh.display">progressbar</option>\n      </single>\n    </panel>\n  </row>\n  <row>\n    <panel>\n      <title>Dashboard details</title>\n      <table>\n        <title>select_app: $select_app$ | filter_options: $filter_options$ | select_dashboard: $select_dashboard$</title>\n        <search>\n          <query>| rest /servicesNS/-/-/data/ui/views \n| search eai:acl.app = "$select_app$" title="$select_dashboard$"\n| table author, version, eai:type, eai:data</query>\n          <earliest>-24h@h</earliest>\n          <latest>now</latest>\n        </search>\n        <option name="drilldown">none</option>\n      </table>\n    </panel>\n  </row>\n</form>',
      'eai:acl.app': 'search',
      'eai:acl.sharing': 'app',
      'eai:acl.owner': 'admin',
      updated: '2025-02-20T13:12:30+00:00',
    },
  },
  {
    preview: false,
    result: {
      id: 'https://127.0.0.1:8089/servicesNS/nobody/SplunkEnterpriseSecuritySuite/data/ui/views/access_analyzer_data',
      label: 'access_analyzer_data',
      title: 'access_analyzer_data',
      version: '2',
      'eai:data':
        '<dashboard version="2" isDashboard="false" app="ess">\n<definition><![CDATA[{\n  "visualizations": {\n    "viz_public_facing_queues": {\n      "type": "splunk.pie",\n      "description": "",\n      "dataSources": {\n        "primary": "ds_public_facing_queues"\n      },\n      "eventHandlers": [],\n      "options": {\n        "collapseThreshold": 0.05,\n        "resultLimit": 6,\n        "showDonutHole": true\n      },\n      "title": "Number of Public Facing Queues"\n    },\n    "viz_public_facing_lambda": {\n      "type": "splunk.pie",\n      "description": "",\n      "dataSources": {\n        "primary": "ds_public_facing_lambda"\n      },\n      "eventHandlers": [],\n      "options": {\n        "collapseThreshold": 0.05,\n        "resultLimit": 6,\n        "showDonutHole": true\n      },\n      "title": "Number of Public Facing AWS Lambda"\n    },\n    "viz_public_facing_s3_buckets": {\n      "type": "splunk.pie",\n      "description": "",\n      "dataSources": {\n        "primary": "ds_public_facing_s3_buckets"\n      },\n      "eventHandlers": [],\n      "options": {\n        "collapseThreshold": 0.05,\n        "resultLimit": 6,\n        "showDonutHole": true\n      },\n      "title": "Number of Public Facing S3 Buckets"\n    },\n    "viz_access_analyzer_trend": {\n      "type": "splunk.line",\n      "description": "",\n      "dataSources": {\n        "primary": "ds_access_analyzer_trend"\n      },\n      "eventHandlers": [],\n      "options": {\n        "markerDisplay": "outlined",\n        "nullValueDisplay": "zero",\n        "yAxisTitleText": "count",\n        "xAxisTitleText": "time",\n        "showYMinorGridLines": false,\n        "dataValuesDisplay": "all",\n        "legendDisplay": "bottom"\n      },\n      "title": "Access Analyzer Trend"\n    }\n  },\n  "dataSources": {\n    "ds_region": {\n      "type": "ds.search",\n      "name": "Regions",\n      "options": {\n        "query": "| inputlookup aws_regions",\n        "queryParameters": {\n          "earliest": "-1s",\n          "latest": "now"\n        }\n      }\n    },\n    "ds_account_id": {\n      "type": "ds.search",\n      "name": "Account",\n      "options": {\n        "query": "| inputlookup aws_all_account_ids | search account_id!=\\"ANONYMOUS_PRINCIPAL\\"",\n        "queryParameters": {\n          "earliest": "-1s",\n          "latest": "now"\n        }\n      }\n    },\n    "ds_public_facing_queues": {\n      "type": "ds.search",\n      "name": "single public facing queues",\n      "options": {\n        "data": {},\n        "query": "`aws-index` sourcetype=\\"aws:accessanalyzer:finding\\" resourceType=\\"AWS::SQS::Queue\\" isPublic=true $ds_input_tokens:result.accountID$ $ds_input_tokens:result.regions$ $ds_input_tokens:result.raw_status$ | dedup resource | stats count by resource"\n      }\n    },\n    "ds_public_facing_lambda": {\n      "type": "ds.search",\n      "name": "Aws lambda",\n      "options": {\n        "data": {},\n        "query": "`aws-index` sourcetype=\\"aws:accessanalyzer:finding\\" resourceType=\\"AWS::Lambda::*\\" isPublic=true $ds_input_tokens:result.accountID$ $ds_input_tokens:result.regions$ $ds_input_tokens:result.raw_status$ | dedup resource | stats count by resource"\n      }\n    },\n    "ds_public_facing_s3_buckets": {\n      "type": "ds.search",\n      "name": "S3 buckets",\n      "options": {\n        "data": {},\n        "query": "`aws-index` sourcetype=\\"aws:accessanalyzer:finding\\" resourceType=\\"AWS::S3::Bucket\\" isPublic=true $ds_input_tokens:result.accountID$ $ds_input_tokens:result.regions$ $ds_input_tokens:result.raw_status$ | dedup resource | stats count by resource"\n      }\n    },\n    "ds_access_analyzer_trend": {\n      "type": "ds.search",\n      "name": "Access analyzer trend",\n      "options": {\n        "data": {},\n        "query": "`aws-index` sourcetype=\\"aws:accessanalyzer:finding\\" isPublic=true $ds_input_tokens:result.accountID$ $ds_input_tokens:result.regions$ $ds_input_tokens:result.raw_status$ | dedup resource | timechart limit=20 count by resourceType"\n      }\n    },\n    "ds_input_tokens": {\n      "type": "ds.search",\n      "name": "ds_input_tokens",\n      "options": {\n        "enableSmartSources": true,\n        "query": "| makeresults count=1\\n| eval region=\\"$region$\\"\\n| eval list=split(region,\\",\\")\\n| eval filterlist=mvfilter(!list IN (\\"*\\"))\\n| eval regions_fields_dm=\\"(\\".mvjoin(mvmap(filterlist,\\"vendor_region=\\\\\\"\\" . filterlist . \\"\\\\\\"\\"), \\" OR \\").\\")\\"\\n| eval regions_fields_tstats=\\"(\\".mvjoin(mvmap(filterlist,\\"All_Changes.vendor_region=\\\\\\"\\" . filterlist . \\"\\\\\\"\\"), \\" OR \\").\\")\\"\\n| eval regions_fields=\\"(\\".mvjoin(mvmap(filterlist,\\"region=\\\\\\"\\" . filterlist . \\"\\\\\\"\\"), \\" OR \\").\\")\\"\\n| eval regions=case(region==\\"*\\",\\"(region=\\\\\\"*\\\\\\")\\", true(), regions_fields)\\n| eval regions_DM=case(region==\\"*\\",\\"(vendor_region=\\\\\\"*\\\\\\")\\", true(), regions_fields_dm)\\n| eval regions_TSTATS=case(region==\\"*\\",\\"(All_Changes.vendor_region=\\\\\\"*\\\\\\")\\", true(), regions_fields_tstats)\\n\\n| eval raw_status=\\"(status=\\\\\\"$status$\\\\\\")\\"\\n\\n| eval accountID=\\"(accountId=\\\\\\"$account_id$\\\\\\")\\"",\n        "queryParameters": {\n          "earliest": "0",\n          "latest": "now"\n        }\n      }\n    }\n  },\n  "defaults": {\n    "visualizations": {\n      "global": {\n        "showProgressBar": true\n      }\n    },\n    "dataSources": {\n      "ds.search": {\n        "options": {\n          "queryParameters": {\n            "latest": "$global_time.latest$",\n            "earliest": "$global_time.earliest$"\n          }\n        }\n      }\n    }\n  },\n  "inputs": {\n    "input_account_id": {\n      "type": "input.multiselect",\n      "title": "Account ID",\n      "options": {\n        "token": "account_id",\n        "defaultValue": "*",\n        "items": [\n          {\n            "value": "*",\n            "label": "All"\n          }\n        ] \n      },\n      "encoding": {\n        "value": "primary.account_id",\n        "label": "primary.account_id"\n      },\n      "dataSources": {\n        "primary": "ds_account_id"\n      }\n    },\n    "input_region": {\n      "type": "input.multiselect",\n      "title": "Regions",\n      "options": {\n        "token": "region",\n        "defaultValue": "*",\n        "items": [\n          {\n            "value": "*",\n            "label": "All"\n          }\n        ]     \n      },\n      "encoding": {\n        "value": "primary.region",\n        "label": "primary.label"\n      },\n      "dataSources": {\n        "primary": "ds_region"\n      }\n    },\n    "input_global_time": {\n      "type": "input.timerange",\n      "title": "Time Range",\n      "options": {\n        "token": "global_time",\n        "defaultValue": "-7d,now"\n      }\n    },\n    "input_status": {\n      "type": "input.dropdown",\n      "title": "Status",\n      "options": {\n        "token": "status",\n        "defaultValue": "*",\n        "items": [\n          {\n            "value": "*",\n            "label": "All"\n          },\n          {\n            "value": "ACTIVE",\n            "label": "Active"\n          }\n        ] \n      }\n    }\n  },\n  "layout": {\n    "type": "grid",\n    "options": {},\n    "structure": [{\n        "item": "viz_public_facing_queues",\n        "type": "block",\n        "position": {\n          "x": 0,\n          "y": 0,\n          "w": 400,\n          "h": 250\n        }\n      },{\n        "item": "viz_public_facing_lambda",\n        "type": "block",\n        "position": {\n          "x": 400,\n          "y": 0,\n          "w": 400,\n          "h": 250\n        }\n      },{\n        "item": "viz_public_facing_s3_buckets",\n        "type": "block",\n        "position": {\n          "x": 800,\n          "y": 0,\n          "w": 400,\n          "h": 250\n        }\n      },{\n        "item": "viz_access_analyzer_trend",\n        "type": "block",\n        "position": {\n          "x": 0,\n          "y": 250,\n          "w": 1200,\n          "h": 300\n        }\n      }\n    ],\n    "globalInputs": [\n      "input_account_id",\n      "input_region",\n      "input_status",\n      "input_global_time"\n    ]\n  },\n  "description": "",\n  "title": "Access Analyzer"\n}]]></definition>\n<meta><![CDATA[{\n  "isEditable":true\n}]]></meta>\n</dashboard>',
      'eai:acl.app': 'SplunkEnterpriseSecuritySuite',
      'eai:acl.sharing': 'global',
      'eai:acl.owner': 'nobody',
      updated: '1970-01-01T00:00:00+00:00',
    },
  },
];

let bedrockConnectorId: string | null = null;

// TODO: https://github.com/elastic/kibana/issues/228940 remove @skipInServerlessMKI tag when privileges issue is fixed
describe(
  'Dashboards Migrations - Basic Workflow',
  { tags: ['@ess', '@serverless', '@skipInServerlessMKI'] },

  () => {
    before(() => {
      role.setup();
    });

    beforeEach(() => {
      deleteConnectors();
      cy.task('esArchiverLoad', {
        archiveName: 'siem_migrations/dashboards/items',
      });

      cy.task('esArchiverLoad', {
        archiveName: 'siem_migrations/dashboards/migrations',
      });

      role.login();
      cy.waitUntil(
        () => {
          return createBedrockConnector()
            .then((response) => {
              bedrockConnectorId = response.body.id;
            })
            .then(() => true);
        },
        { interval: 500, timeout: 12000 }
      );
      // esArchiver reloads clear persisted global UI settings; re-apply before first paint.
      suppressGlobalAnnouncements();
      visit(`${GET_STARTED_URL}/siem_migrations`);
    });

    after(() => {
      role.teardown();

      cy.task('esArchiverUnload', {
        archiveName: 'siem_migrations/dashboards/items',
      });

      cy.task('esArchiverUnload', {
        archiveName: 'siem_migrations/dashboards/migrations',
      });
    });

    context('First Migration', () => {
      beforeEach(() => {
        cleanDashboardsMigrationData();
      });

      it('should be able to create migrations', () => {
        selectMigrationConnector();
        openUploadDashboardsFlyout();
        saveDefaultMigrationName();
        uploadDashboards(SPLUNK_TEST_DASHBOARDS);
        cy.intercept({
          url: '**/start',
        }).as('startMigration');
        startDashboardMigrationFromFlyout();
        cy.wait('@startMigration')
          .its('request.body.settings')
          .should('have.property', 'connector_id', bedrockConnectorId);
        cy.get(DASHBOARD_MIGRATIONS_GROUP_PANEL).within(() => {
          cy.get(ONBOARDING_SIEM_MIGRATIONS_LIST).should('have.length', 1);
          cy.get(DASHBOARD_MIGRATION_PROGRESS_BAR).should('have.length', 1);
        });
      });
    });

    context('On Successful Translation', () => {
      context('Migration Results', () => {
        beforeEach(() => {
          selectMigrationConnector();
          toggleMigrateDashboardsCard();
        });

        it('should be able to see the result of the completed migration', () => {
          cy.get(DASHBOARD_MIGRATIONS_GROUP_PANEL).within(() => {
            cy.get(ONBOARDING_SIEM_MIGRATIONS_LIST).should('have.length', 1);
            cy.get(
              ONBOARDING_TRANSLATIONS_RESULT_TABLE.TRANSLATION_STATUS_COUNT('Translated')
            ).should('have.text', 1);
            cy.get(
              ONBOARDING_TRANSLATIONS_RESULT_TABLE.TRANSLATION_STATUS_COUNT('Partially translated')
            ).should('have.text', 1);
            cy.get(
              ONBOARDING_TRANSLATIONS_RESULT_TABLE.TRANSLATION_STATUS_COUNT('Not translated')
            ).should('have.text', 2);
            cy.get(ONBOARDING_TRANSLATIONS_RESULT_TABLE.TRANSLATION_STATUS_COUNT('Failed')).should(
              'have.text',
              3
            );
          });
        });

        it('should be able to rename the migration', () => {
          cy.get(ONBOARDING_SIEM_MIGRATIONS_LIST).should('have.length', 1);
          renameMigration('New Migration Name');
          cy.get(MIGRATION_PANEL_NAME).should('have.text', 'New Migration Name');
        });
      });
    });
  }
);
