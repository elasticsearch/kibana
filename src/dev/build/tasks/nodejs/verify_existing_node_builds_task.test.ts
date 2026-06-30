/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import Path from 'path';
import Fs from 'fs';

import { REPO_ROOT } from '@kbn/repo-info';
import { ToolingLog, ToolingLogCollectingWriter } from '@kbn/tooling-log';
import { createAnyInstanceSerializer, createRecursiveSerializer } from '@kbn/jest-serializers';

import type { Platform } from '../../lib';
import { Config } from '../../lib';
import { VerifyExistingNodeBuilds } from './verify_existing_node_builds_task';

jest.mock('./node_shasums');
jest.mock('./node_download_info');
jest.mock('../../lib/fs');
jest.mock('../../lib/get_build_number');

const { getNodeShasums } = jest.requireMock('./node_shasums');
const { getNodeDownloadInfo } = jest.requireMock('./node_download_info');
const { getFileHash } = jest.requireMock('../../lib/fs');

const log = new ToolingLog();
const testWriter = new ToolingLogCollectingWriter();
log.setWriters([testWriter]);

expect.addSnapshotSerializer(createAnyInstanceSerializer(Config));
expect.addSnapshotSerializer(createAnyInstanceSerializer(ToolingLog));

const nodeVersion = Fs.readFileSync(Path.resolve(REPO_ROOT, '.node-version'), 'utf8').trim();
expect.addSnapshotSerializer(
  createRecursiveSerializer(
    (s) => typeof s === 'string' && s.includes(nodeVersion),
    (s) => s.split(nodeVersion).join('<node version>')
  )
);

async function setup(actualShaSums?: Record<string, string>) {
  const config = await Config.create({
    isRelease: true,
    targetAllPlatforms: true,
    targetServerlessPlatforms: false,
    skipServerless: false,
    dockerContextUseLocalArtifact: false,
    dockerCrossCompile: false,
    dockerNamespace: null,
    dockerPush: false,
    dockerTag: '',
    dockerTagQualifier: '',
    downloadFreshNode: true,
    withExamplePlugins: false,
    withTestPlugins: true,
  });

  getNodeShasums.mockReturnValue(
    Object.fromEntries(
      config.getTargetPlatforms().map((platform) => {
        return [
          `${platform.getName()}:${
            platform.getVariant() || 'default'
          }:${platform.getNodeArch()}:downloadName`,
          'valid shasum',
        ];
      })
    )
  );

  getNodeDownloadInfo.mockImplementation((_: Config, platform: Platform) => {
    return [
      {
        downloadPath: `${platform.getName()}:${
          platform.getVariant() || 'default'
        }:${platform.getNodeArch()}:downloadPath`,
        downloadName: `${platform.getName()}:${
          platform.getVariant() || 'default'
        }:${platform.getNodeArch()}:downloadName`,
      },
    ];
  });

  getFileHash.mockImplementation((downloadPath: string) => {
    if (actualShaSums?.[downloadPath]) {
      return actualShaSums[downloadPath];
    }

    return 'valid shasum';
  });

  return { config };
}

beforeEach(() => {
  testWriter.messages.length = 0;
  jest.clearAllMocks();
});

it('checks shasums for each downloaded node build', async () => {
  const { config } = await setup();

  await VerifyExistingNodeBuilds.run(config, log);

  expect(getNodeShasums).toMatchInlineSnapshot(`
    [MockFunction] {
      "calls": Array [
        Array [
          <ToolingLog>,
          "<node version>",
          undefined,
        ],
        Array [
          <ToolingLog>,
          "<node version>",
          undefined,
        ],
        Array [
          <ToolingLog>,
          "<node version>",
          undefined,
        ],
        Array [
          <ToolingLog>,
          "<node version>",
          undefined,
        ],
        Array [
          <ToolingLog>,
          "<node version>",
          undefined,
        ],
        Array [
          <ToolingLog>,
          "<node version>",
          undefined,
        ],
        Array [
          <ToolingLog>,
          "<node version>",
          undefined,
        ],
        Array [
          <ToolingLog>,
          "<node version>",
          undefined,
        ],
      ],
      "results": Array [
        Object {
          "type": "return",
          "value": Object {
            "darwin:default:darwin-arm64:downloadName": "valid shasum",
            "darwin:default:darwin-x64:downloadName": "valid shasum",
            "linux:default:linux-arm64:downloadName": "valid shasum",
            "linux:default:linux-x64:downloadName": "valid shasum",
            "linux:serverless:linux-arm64:downloadName": "valid shasum",
            "linux:serverless:linux-x64:downloadName": "valid shasum",
            "win32:default:win32-arm64:downloadName": "valid shasum",
            "win32:default:win32-x64:downloadName": "valid shasum",
          },
        },
        Object {
          "type": "return",
          "value": Object {
            "darwin:default:darwin-arm64:downloadName": "valid shasum",
            "darwin:default:darwin-x64:downloadName": "valid shasum",
            "linux:default:linux-arm64:downloadName": "valid shasum",
            "linux:default:linux-x64:downloadName": "valid shasum",
            "linux:serverless:linux-arm64:downloadName": "valid shasum",
            "linux:serverless:linux-x64:downloadName": "valid shasum",
            "win32:default:win32-arm64:downloadName": "valid shasum",
            "win32:default:win32-x64:downloadName": "valid shasum",
          },
        },
        Object {
          "type": "return",
          "value": Object {
            "darwin:default:darwin-arm64:downloadName": "valid shasum",
            "darwin:default:darwin-x64:downloadName": "valid shasum",
            "linux:default:linux-arm64:downloadName": "valid shasum",
            "linux:default:linux-x64:downloadName": "valid shasum",
            "linux:serverless:linux-arm64:downloadName": "valid shasum",
            "linux:serverless:linux-x64:downloadName": "valid shasum",
            "win32:default:win32-arm64:downloadName": "valid shasum",
            "win32:default:win32-x64:downloadName": "valid shasum",
          },
        },
        Object {
          "type": "return",
          "value": Object {
            "darwin:default:darwin-arm64:downloadName": "valid shasum",
            "darwin:default:darwin-x64:downloadName": "valid shasum",
            "linux:default:linux-arm64:downloadName": "valid shasum",
            "linux:default:linux-x64:downloadName": "valid shasum",
            "linux:serverless:linux-arm64:downloadName": "valid shasum",
            "linux:serverless:linux-x64:downloadName": "valid shasum",
            "win32:default:win32-arm64:downloadName": "valid shasum",
            "win32:default:win32-x64:downloadName": "valid shasum",
          },
        },
        Object {
          "type": "return",
          "value": Object {
            "darwin:default:darwin-arm64:downloadName": "valid shasum",
            "darwin:default:darwin-x64:downloadName": "valid shasum",
            "linux:default:linux-arm64:downloadName": "valid shasum",
            "linux:default:linux-x64:downloadName": "valid shasum",
            "linux:serverless:linux-arm64:downloadName": "valid shasum",
            "linux:serverless:linux-x64:downloadName": "valid shasum",
            "win32:default:win32-arm64:downloadName": "valid shasum",
            "win32:default:win32-x64:downloadName": "valid shasum",
          },
        },
        Object {
          "type": "return",
          "value": Object {
            "darwin:default:darwin-arm64:downloadName": "valid shasum",
            "darwin:default:darwin-x64:downloadName": "valid shasum",
            "linux:default:linux-arm64:downloadName": "valid shasum",
            "linux:default:linux-x64:downloadName": "valid shasum",
            "linux:serverless:linux-arm64:downloadName": "valid shasum",
            "linux:serverless:linux-x64:downloadName": "valid shasum",
            "win32:default:win32-arm64:downloadName": "valid shasum",
            "win32:default:win32-x64:downloadName": "valid shasum",
          },
        },
        Object {
          "type": "return",
          "value": Object {
            "darwin:default:darwin-arm64:downloadName": "valid shasum",
            "darwin:default:darwin-x64:downloadName": "valid shasum",
            "linux:default:linux-arm64:downloadName": "valid shasum",
            "linux:default:linux-x64:downloadName": "valid shasum",
            "linux:serverless:linux-arm64:downloadName": "valid shasum",
            "linux:serverless:linux-x64:downloadName": "valid shasum",
            "win32:default:win32-arm64:downloadName": "valid shasum",
            "win32:default:win32-x64:downloadName": "valid shasum",
          },
        },
        Object {
          "type": "return",
          "value": Object {
            "darwin:default:darwin-arm64:downloadName": "valid shasum",
            "darwin:default:darwin-x64:downloadName": "valid shasum",
            "linux:default:linux-arm64:downloadName": "valid shasum",
            "linux:default:linux-x64:downloadName": "valid shasum",
            "linux:serverless:linux-arm64:downloadName": "valid shasum",
            "linux:serverless:linux-x64:downloadName": "valid shasum",
            "win32:default:win32-arm64:downloadName": "valid shasum",
            "win32:default:win32-x64:downloadName": "valid shasum",
          },
        },
      ],
    }
  `);
  expect(getNodeDownloadInfo).toMatchInlineSnapshot(`
    [MockFunction] {
      "calls": Array [
        Array [
          <Config>,
          Platform {
            "architecture": "x64",
            "buildName": "linux-x86_64",
            "name": "linux",
            "variant": undefined,
          },
        ],
        Array [
          <Config>,
          Platform {
            "architecture": "arm64",
            "buildName": "linux-aarch64",
            "name": "linux",
            "variant": undefined,
          },
        ],
        Array [
          <Config>,
          Platform {
            "architecture": "x64",
            "buildName": "darwin-x86_64",
            "name": "darwin",
            "variant": undefined,
          },
        ],
        Array [
          <Config>,
          Platform {
            "architecture": "arm64",
            "buildName": "darwin-aarch64",
            "name": "darwin",
            "variant": undefined,
          },
        ],
        Array [
          <Config>,
          Platform {
            "architecture": "x64",
            "buildName": "windows-x86_64",
            "name": "win32",
            "variant": undefined,
          },
        ],
        Array [
          <Config>,
          Platform {
            "architecture": "arm64",
            "buildName": "windows-arm64",
            "name": "win32",
            "variant": undefined,
          },
        ],
        Array [
          <Config>,
          Platform {
            "architecture": "x64",
            "buildName": "linux-x86_64",
            "name": "linux",
            "variant": "serverless",
          },
        ],
        Array [
          <Config>,
          Platform {
            "architecture": "arm64",
            "buildName": "linux-aarch64",
            "name": "linux",
            "variant": "serverless",
          },
        ],
      ],
      "results": Array [
        Object {
          "type": "return",
          "value": Array [
            Object {
              "downloadName": "linux:default:linux-x64:downloadName",
              "downloadPath": "linux:default:linux-x64:downloadPath",
            },
          ],
        },
        Object {
          "type": "return",
          "value": Array [
            Object {
              "downloadName": "linux:default:linux-arm64:downloadName",
              "downloadPath": "linux:default:linux-arm64:downloadPath",
            },
          ],
        },
        Object {
          "type": "return",
          "value": Array [
            Object {
              "downloadName": "darwin:default:darwin-x64:downloadName",
              "downloadPath": "darwin:default:darwin-x64:downloadPath",
            },
          ],
        },
        Object {
          "type": "return",
          "value": Array [
            Object {
              "downloadName": "darwin:default:darwin-arm64:downloadName",
              "downloadPath": "darwin:default:darwin-arm64:downloadPath",
            },
          ],
        },
        Object {
          "type": "return",
          "value": Array [
            Object {
              "downloadName": "win32:default:win32-x64:downloadName",
              "downloadPath": "win32:default:win32-x64:downloadPath",
            },
          ],
        },
        Object {
          "type": "return",
          "value": Array [
            Object {
              "downloadName": "win32:default:win32-arm64:downloadName",
              "downloadPath": "win32:default:win32-arm64:downloadPath",
            },
          ],
        },
        Object {
          "type": "return",
          "value": Array [
            Object {
              "downloadName": "linux:serverless:linux-x64:downloadName",
              "downloadPath": "linux:serverless:linux-x64:downloadPath",
            },
          ],
        },
        Object {
          "type": "return",
          "value": Array [
            Object {
              "downloadName": "linux:serverless:linux-arm64:downloadName",
              "downloadPath": "linux:serverless:linux-arm64:downloadPath",
            },
          ],
        },
      ],
    }
  `);
  expect(getFileHash).toMatchInlineSnapshot(`
    [MockFunction] {
      "calls": Array [
        Array [
          "linux:default:linux-x64:downloadPath",
          "sha256",
        ],
        Array [
          "linux:default:linux-arm64:downloadPath",
          "sha256",
        ],
        Array [
          "darwin:default:darwin-x64:downloadPath",
          "sha256",
        ],
        Array [
          "darwin:default:darwin-arm64:downloadPath",
          "sha256",
        ],
        Array [
          "win32:default:win32-x64:downloadPath",
          "sha256",
        ],
        Array [
          "win32:default:win32-arm64:downloadPath",
          "sha256",
        ],
        Array [
          "linux:serverless:linux-x64:downloadPath",
          "sha256",
        ],
        Array [
          "linux:serverless:linux-arm64:downloadPath",
          "sha256",
        ],
      ],
      "results": Array [
        Object {
          "type": "return",
          "value": "valid shasum",
        },
        Object {
          "type": "return",
          "value": "valid shasum",
        },
        Object {
          "type": "return",
          "value": "valid shasum",
        },
        Object {
          "type": "return",
          "value": "valid shasum",
        },
        Object {
          "type": "return",
          "value": "valid shasum",
        },
        Object {
          "type": "return",
          "value": "valid shasum",
        },
        Object {
          "type": "return",
          "value": "valid shasum",
        },
        Object {
          "type": "return",
          "value": "valid shasum",
        },
      ],
    }
  `);
});

it('rejects if any download has an incorrect sha256', async () => {
  const { config } = await setup({
    'linux:default:linux-arm64:downloadPath': 'invalid shasum',
  });

  await expect(
    VerifyExistingNodeBuilds.run(config, log)
  ).rejects.toThrowErrorMatchingInlineSnapshot(
    `"Download at linux:default:linux-arm64:downloadPath does not match expected checksum invalid shasum"`
  );
});
