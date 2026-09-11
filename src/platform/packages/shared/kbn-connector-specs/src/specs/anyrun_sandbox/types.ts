/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z, lazySchema } from '@kbn/zod/v4';

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_REPORT_ITEMS = 100;
export const MAX_IOCS = 1000;
const MAX_BASE64_LENGTH = Math.ceil(MAX_FILE_BYTES / 3) * 4;
const shortText = z.string().max(200);
const text = z.string().max(2048);
const nullableShortText = shortText.nullable().optional();
const nullableText = text.nullable().optional();
const nullableNumber = z.number().nullable().optional();
const tag = z.union([shortText, z.object({ users: z.boolean(), tag: shortText })]);

export const AnalysisEnvironmentSchema = lazySchema(() =>
  z
    .union([
      z.object({
        os: z.literal('windows').describe('Windows environment.'),
        version: z.enum(['7', '10']).describe('Windows 7 or 10.'),
        bitness: z
          .union([z.literal(32), z.literal(64)])
          .describe('Windows architecture, 32 or 64 bit.'),
        type: z.literal('complete').describe('Complete environment preset.'),
      }),
      z.object({
        os: z.literal('windows').describe('Windows environment.'),
        version: z.enum(['11', 'server 2025']).describe('Windows 11 or Windows Server 2025.'),
        bitness: z.literal(64).describe('Windows 11 and Windows Server 2025 require 64 bit.'),
        type: z.literal('complete').describe('Complete environment preset.'),
      }),
      z.object({
        os: z.literal('windows').describe('Windows environment.'),
        version: z.literal('10').describe('Development preset requires Windows 10.'),
        bitness: z.literal(64).describe('Development preset requires 64 bit.'),
        type: z.literal('development').describe('Development environment preset.'),
      }),
      z.object({
        os: z.literal('linux').describe('Linux environment.'),
        version: z.enum(['12.2', '22.04.2']).describe('Supported Linux version.'),
        bitness: z.literal(64).describe('Linux environments require 64 bit.'),
        type: z.literal('complete').describe('Complete environment preset.'),
      }),
      z.object({
        os: z.literal('android').describe('Android environment.'),
        version: z.literal('14').describe('Supported Android version.'),
        bitness: z.literal(64).describe('Android environments require 64 bit.'),
        type: z.literal('complete').describe('Complete environment preset.'),
      }),
      z.object({
        os: z.literal('macos').describe('macOS environment.'),
        version: z.literal('15').describe('Supported macOS version.'),
        bitness: z.literal(64).describe('macOS environments require 64 bit.'),
        type: z.literal('complete').describe('Complete environment preset.'),
      }),
    ])
    .describe(
      'Optional analysis environment. Use an exact os, version, bitness, and type combination marked supportedForSubmission by listEnvironments. Availability can depend on your plan. Omit it to use the vendor default.'
    )
);

const submissionFields = () => ({
  privacy: z
    .enum(['owner', 'byteam'])
    .default('owner')
    .describe(
      'Analysis visibility: owner (default) or byteam. Public and link-only modes are not supported.'
    ),
  timeout: z
    .number()
    .int()
    .min(10)
    .max(1200)
    .default(60)
    .describe(
      'Sandbox execution time in seconds, from 10 to 1200. Default: 60. Your plan can impose a lower limit.'
    ),
  tags: z
    .array(
      z
        .string()
        .min(1)
        .max(16)
        .regex(/^[A-Za-z0-9-]+$/)
    )
    .max(8)
    .optional()
    .describe(
      'Up to eight tags, each 1 to 16 letters, digits, or hyphens. Example: ["elastic-test"].'
    ),
  environment: AnalysisEnvironmentSchema.optional(),
});

export const SubmitUrlInputSchema = lazySchema(() =>
  z.object({
    url: z
      .string()
      .min(1)
      .max(2048)
      .refine((value) => {
        try {
          const url = new URL(value);
          return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
        } catch {
          return false;
        }
      }, 'Use an HTTP or HTTPS URL without embedded credentials.')
      .describe(
        'URL to analyze in the remote sandbox, up to 2048 characters. Example: https://example.com. Do not include credentials.'
      ),
    ...submissionFields(),
  })
);
export type SubmitUrlInput = z.infer<typeof SubmitUrlInputSchema>;

export const SubmitFileInputSchema = lazySchema(() =>
  z.object({
    file: z
      .string()
      .min(4)
      .max(MAX_BASE64_LENGTH)
      .refine((value) => {
        const buffer = Buffer.from(value, 'base64');
        return (
          buffer.length > 0 &&
          buffer.length <= MAX_FILE_BYTES &&
          buffer.toString('base64') === value
        );
      }, 'Use canonical padded Base64 for a non-empty file no larger than 2 MiB.')
      .describe(
        'Canonical padded Base64 file content, at most 2 MiB before encoding. No data URI. File bytes persist in execution inputs; do not use confidential data.'
      ),
    filename: z
      .string()
      .min(1)
      .max(255)
      .refine((value) => !/[\\/\x00-\x1f\x7f]/.test(value) && value !== '.' && value !== '..')
      .describe(
        'Original file name, 1 to 255 characters, with no path or control characters. Example: sample.txt.'
      ),
    ...submissionFields(),
  })
);
export type SubmitFileInput = z.infer<typeof SubmitFileInputSchema>;

export const TaskInputSchema = lazySchema(() =>
  z.object({
    taskId: z
      .string()
      .max(36)
      .uuid()
      .describe(
        'Task UUID returned by submitUrl, submitFile, getAnalysisStatus, or listAnalyses. Only getAnalysisStatus accepts a queued task UUID.'
      ),
  })
);
export type TaskInput = z.infer<typeof TaskInputSchema>;

export const ListAnalysesInputSchema = lazySchema(() =>
  z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(25)
      .describe('Number of tasks per page, from 1 to 100. Default: 25.'),
    skip: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER)
      .default(0)
      .describe(
        'Number of tasks to skip, starting at 0. Increase by limit to request the next page.'
      ),
    team: z
      .boolean()
      .default(false)
      .describe('Set true to read team history. Default: false. Requires team history API access.'),
  })
);
export type ListAnalysesInput = z.infer<typeof ListAnalysesInputSchema>;

export const EmptyInputSchema = lazySchema(() => z.object({}));

export const SubmissionResponseSchema = lazySchema(() =>
  z.object({
    error: z.literal(false),
    data: z.union([
      z.object({ taskid: z.string().uuid() }),
      z.object({ queueTaskId: z.string().uuid() }),
    ]),
  })
);

export const StatusEventSchema = lazySchema(() =>
  z.object({
    error: z.boolean(),
    completed: z.boolean().optional(),
    message: z.string().max(1000).optional(),
    task: z
      .object({
        uuid: z.string().uuid(),
        status: z.number().int().min(-1).max(100),
        remaining: z.number().int().min(0).optional(),
        scores: z
          .object({
            verdict: z.object({ text: z.string().max(200), threat_level: z.number() }),
          })
          .optional(),
      })
      .optional(),
  })
);

export const ReportResponseSchema = lazySchema(() =>
  z.object({
    error: z.literal(false),
    data: z.object({
      status: z.string().min(1).max(100),
      environments: z.object({ os: z.object({ title: text }).optional() }).optional(),
      analysis: z
        .object({
          uuid: z.string().uuid().optional(),
          permanentUrl: text.optional(),
          duration: z.number().int().min(0).optional(),
          creationText: text.nullable().optional(),
          stopExecText: text.nullable().optional(),
          tags: z.array(tag).max(100).optional(),
          scores: z
            .object({
              verdict: z.object({
                score: nullableNumber,
                threatLevel: nullableNumber,
                threatLevelText: nullableShortText,
              }),
            })
            .optional(),
          content: z
            .object({
              mainObject: z
                .object({
                  type: nullableShortText,
                  filename: nullableText,
                  basename: nullableText,
                  url: nullableText,
                  info: z
                    .object({
                      mime: nullableShortText,
                      file: nullableText,
                    })
                    .optional(),
                  hashes: z
                    .object({
                      md5: nullableShortText,
                      sha1: nullableShortText,
                      sha256: nullableShortText,
                      ssdeep: nullableText,
                    })
                    .optional(),
                })
                .optional(),
            })
            .optional(),
        })
        .optional(),
      processes: z
        .array(
          z.object({
            fileName: nullableText,
            pid: z.union([z.number(), shortText]).nullable().optional(),
            ppid: z.union([z.number(), shortText]).nullable().optional(),
            uuid: nullableShortText,
            commandLine: nullableText,
            image: nullableText,
            context: z
              .object({
                userName: nullableText,
                integrityLevel: nullableShortText,
              })
              .optional(),
            exitCode: nullableNumber,
            mainProcess: z.boolean().nullable().optional(),
          })
        )
        .max(10000)
        .optional(),
      incidents: z
        .array(
          z.object({
            process: nullableText,
            desc: nullableText,
            title: nullableText,
            threatLevel: nullableNumber,
          })
        )
        .max(10000)
        .optional(),
      network: z
        .object({
          threats: z
            .array(
              z.object({
                process: nullableText,
                msg: nullableText,
                class: nullableShortText,
                srcport: nullableNumber,
                dstport: nullableNumber,
                srcip: nullableShortText,
                dstip: nullableShortText,
              })
            )
            .max(10000)
            .optional(),
          connections: z
            .array(
              z.object({
                reputation: nullableShortText,
                process: nullableText,
                asn: nullableShortText,
                country: nullableShortText,
                protocol: nullableShortText,
                port: nullableNumber,
                ip: nullableShortText,
              })
            )
            .max(10000)
            .optional(),
          httpRequests: z
            .array(
              z.object({
                reputation: nullableShortText,
                country: nullableShortText,
                process: nullableText,
                httpCode: nullableNumber,
                status: nullableShortText,
                proxyDetected: z.boolean().nullable().optional(),
                port: nullableNumber,
                ip: nullableShortText,
                url: nullableText,
                host: nullableText,
                method: nullableShortText,
              })
            )
            .max(10000)
            .optional(),
          dnsRequests: z
            .array(
              z.object({
                reputation: nullableShortText,
                reputationNumber: nullableNumber,
                ips: z.array(shortText).max(100).optional(),
                domain: nullableText,
              })
            )
            .max(10000)
            .optional(),
        })
        .optional(),
    }),
  })
);

export const IocsResponseSchema = lazySchema(() =>
  z
    .array(
      z.object({
        category: z.string().max(200),
        type: z.string().max(200),
        ioc: z.string().max(8192),
        reputation: z.number().int().min(0).max(2),
        name: z.string().max(2048).optional(),
        discoveringEntryId: z.string().max(200).optional(),
      })
    )
    .max(10000)
);

export const HistoryResponseSchema = lazySchema(() =>
  z.object({
    error: z.literal(false),
    data: z.object({
      tasks: z
        .array(
          z.object({
            uuid: z.string().uuid(),
            verdict: z.string().max(200),
            name: z.string().max(2048).optional(),
            related: z.string().max(2048).optional(),
            date: z.string().max(100),
            tags: z.array(tag).max(100),
          })
        )
        .max(100),
    }),
  })
);

export const LimitsResponseSchema = lazySchema(() => {
  const quota = z.object({
    minute: z.number().int().min(-1),
    hour: z.number().int().min(-1),
    day: z.number().int().min(-1),
    month: z.number().int().min(-1),
  });
  return z.object({
    error: z.literal(false),
    data: z.object({
      limits: z.object({
        web: quota,
        api: quota,
        parallels: z.object({
          total: z.number().int().min(0),
          available: z.number().int().min(0),
        }),
      }),
    }),
  });
});

export const EnvironmentsResponseSchema = lazySchema(() =>
  z.object({
    error: z.literal(false),
    data: z.object({
      environments: z
        .array(
          z.object({
            os: z.string().min(1).max(100),
            version: z.string().min(1).max(100),
            bitness: z.union([z.literal(32), z.literal(64)]),
            type: z.string().min(1).max(100),
          })
        )
        .max(100),
    }),
  })
);
