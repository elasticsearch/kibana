/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { claudeModelSupportsTemperature } from '@kbn/connector-schemas/bedrock';
import {
  formatBedrockBody,
  ensureMessageFormat,
  parseContent,
  usesDeprecatedArguments,
  extractRegionId,
  tee,
} from './utils';
import type { SmithyMessageDecoderStream } from '@smithy/eventstream-codec';

describe('formatBedrockBody', () => {
  it('formats the body with default values', () => {
    const result = formatBedrockBody({ messages: [{ role: 'user', content: 'Hello' }] });
    expect(result).toMatchObject({
      anthropic_version: 'bedrock-2023-05-31',
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: expect.any(Number),
    });
  });

  it('includes temperature when provided', () => {
    const result = formatBedrockBody({
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.5,
    });
    expect(result).toMatchObject({ temperature: 0.5 });
  });

  it('omits temperature when not provided', () => {
    const result = formatBedrockBody({ messages: [{ role: 'user', content: 'Hello' }] });
    expect(result).not.toHaveProperty('temperature');
  });
});

describe('claudeModelSupportsTemperature', () => {
  it('returns true when no model ID is provided', () => {
    expect(claudeModelSupportsTemperature(undefined)).toBe(true);
    expect(claudeModelSupportsTemperature('')).toBe(true);
  });

  it('returns true for Claude 4.x models that support temperature (< 4.7)', () => {
    [
      'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
      'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      'anthropic.claude-sonnet-4-6-20251101-v1:0',
      'us.anthropic.claude-opus-4-6-20251101-v1:0',
    ].forEach((model) => {
      expect(claudeModelSupportsTemperature(model)).toBe(true);
    });
  });

  it('returns false for Claude 4.7+ models where temperature is deprecated', () => {
    [
      'us.anthropic.claude-sonnet-4-7-20251101-v1:0',
      'us.anthropic.claude-opus-4-8-20251101-v1:0',
      'anthropic.claude-haiku-4-7-20251101-v1:0',
      'us.anthropic.claude-opus-5-0-20260101-v1:0',
    ].forEach((model) => {
      expect(claudeModelSupportsTemperature(model)).toBe(false);
    });
  });

  it('returns true for Claude 3.x models (different ID format, regex does not match)', () => {
    [
      'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
      'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
      'anthropic.claude-3-opus-20240229-v1:0',
    ].forEach((model) => {
      expect(claudeModelSupportsTemperature(model)).toBe(true);
    });
  });

  it('returns true for unrecognized or custom model IDs', () => {
    expect(claudeModelSupportsTemperature('custom-model-123')).toBe(true);
    expect(claudeModelSupportsTemperature('my-inference-profile')).toBe(true);
  });
});

describe('ensureMessageFormat', () => {
  it('combines consecutive messages with the same role', () => {
    const messages = [
      { role: 'user', content: 'Hi' },
      { role: 'user', content: 'How are you?' },
    ];
    const result = ensureMessageFormat(messages);
    expect(result.messages).toEqual([{ role: 'user', content: 'Hi\nHow are you?' }]);
  });
});

describe('parseContent', () => {
  it('parses single text content correctly', () => {
    const result = parseContent([{ type: 'text', text: 'Sample text' }]);
    expect(result).toBe('Sample text');
  });

  it('parses multiple text contents with line breaks', () => {
    const result = parseContent([
      { type: 'text', text: 'Line 1' },
      { type: 'text', text: 'Line 2' },
    ]);
    expect(result).toBe(`
Line 1
Line 2`);
  });
});

describe('usesDeprecatedArguments', () => {
  it('returns true if prompt exists in body', () => {
    const body = JSON.stringify({ prompt: 'Old format' });
    expect(usesDeprecatedArguments(body)).toBe(true);
  });

  it('returns false if prompt is absent', () => {
    const body = JSON.stringify({ message: 'New format' });
    expect(usesDeprecatedArguments(body)).toBe(false);
  });
});

describe('extractRegionId', () => {
  const possibleRuntimeUrls = [
    { url: 'https://bedrock-runtime.us-east-2.amazonaws.com', region: 'us-east-2' },
    { url: 'https://bedrock-runtime-fips.us-east-2.amazonaws.com', region: 'us-east-2' },
    { url: 'https://bedrock-runtime.us-east-1.amazonaws.com', region: 'us-east-1' },
    { url: 'https://bedrock-runtime-fips.us-east-1.amazonaws.com', region: 'us-east-1' },
    { url: 'https://bedrock-runtime.us-west-2.amazonaws.com', region: 'us-west-2' },
    { url: 'https://bedrock-runtime-fips.us-west-2.amazonaws.com', region: 'us-west-2' },
    { url: 'https://bedrock-runtime.ap-south-2.amazonaws.com', region: 'ap-south-2' },
    { url: 'https://bedrock-runtime.ap-south-1.amazonaws.com', region: 'ap-south-1' },
    { url: 'https://bedrock-runtime.ap-northeast-3.amazonaws.com', region: 'ap-northeast-3' },
    { url: 'https://bedrock-runtime.ap-northeast-2.amazonaws.com', region: 'ap-northeast-2' },
    { url: 'https://bedrock-runtime.ap-southeast-1.amazonaws.com', region: 'ap-southeast-1' },
    { url: 'https://bedrock-runtime.ap-southeast-2.amazonaws.com', region: 'ap-southeast-2' },
    { url: 'https://bedrock-runtime.ap-northeast-1.amazonaws.com', region: 'ap-northeast-1' },
    { url: 'https://bedrock-runtime.ca-central-1.amazonaws.com', region: 'ca-central-1' },
    { url: 'https://bedrock-runtime-fips.ca-central-1.amazonaws.com', region: 'ca-central-1' },
    { url: 'https://bedrock-runtime.eu-central-1.amazonaws.com', region: 'eu-central-1' },
    { url: 'https://bedrock-runtime.us-gov-east-1.amazonaws.com', region: 'us-gov-east-1' },
    { url: 'https://bedrock-runtime-fips.us-gov-east-1.amazonaws.com', region: 'us-gov-east-1' },
    { url: 'https://bedrock-runtime.us-gov-west-1.amazonaws.com', region: 'us-gov-west-1' },
    { url: 'https://bedrock-runtime-fips.us-gov-west-1.amazonaws.com', region: 'us-gov-west-1' },
  ];
  it.each(possibleRuntimeUrls)(
    'extracts the region correctly from a valid URL',
    ({ url, region }) => {
      const result = extractRegionId(url);
      expect(result).toBe(region);
    }
  );

  it('returns undefined region if no region is found', () => {
    const result = extractRegionId('https://invalid.url.com');
    expect(result).toBeUndefined();
  });
});

describe('tee', () => {
  it('should split a stream into two identical streams', async () => {
    const inputData = [1, 2, 3, 4, 5];
    const mockStream = new MockSmithyMessageDecoderStream(inputData, {
      someOption: 'test',
    }) as unknown as SmithyMessageDecoderStream<number>;

    const [leftStream, rightStream] = tee(mockStream);

    const leftResults: number[] = [];
    const rightResults: number[] = [];

    const leftPromise = (async () => {
      for await (const chunk of leftStream) {
        leftResults.push(chunk);
      }
    })();

    const rightPromise = (async () => {
      for await (const chunk of rightStream) {
        rightResults.push(chunk);
      }
    })();

    await Promise.all([leftPromise, rightPromise]);

    expect(leftResults).toEqual(inputData);
    expect(rightResults).toEqual(inputData);
  });

  it('should handle empty streams', async () => {
    const mockStream = new MockSmithyMessageDecoderStream([], {
      someOption: 'test',
    }) as unknown as SmithyMessageDecoderStream<number>;

    const [leftStream, rightStream] = tee(mockStream);

    const leftResults: number[] = [];
    const rightResults: number[] = [];
    const leftPromise = (async () => {
      for await (const chunk of leftStream) {
        leftResults.push(chunk);
      }
    })();

    const rightPromise = (async () => {
      for await (const chunk of rightStream) {
        rightResults.push(chunk);
      }
    })();

    await Promise.all([leftPromise, rightPromise]);
    expect(leftResults).toEqual([]);
    expect(rightResults).toEqual([]);
  });

  it('should preserve stream options', () => {
    const options = { someOption: 'test' };
    const mockStream = new MockSmithyMessageDecoderStream(
      [],
      options
    ) as unknown as SmithyMessageDecoderStream<number>;

    const [leftStream, rightStream] = tee(mockStream);

    // @ts-ignore options is private, but we need it to create the new streams
    expect(leftStream.options).toEqual(options);
    // @ts-ignore options is private, but we need it to create the new streams
    expect(rightStream.options).toEqual(options);
  });

  it('should handle streams with a single element', async () => {
    const inputData = [1];
    const mockStream = new MockSmithyMessageDecoderStream(inputData, {
      someOption: 'test',
    }) as unknown as SmithyMessageDecoderStream<number>;

    const [leftStream, rightStream] = tee(mockStream);

    const leftResults: number[] = [];
    const rightResults: number[] = [];
    const leftPromise = (async () => {
      for await (const chunk of leftStream) {
        leftResults.push(chunk);
      }
    })();

    const rightPromise = (async () => {
      for await (const chunk of rightStream) {
        rightResults.push(chunk);
      }
    })();

    await Promise.all([leftPromise, rightPromise]);
    expect(leftResults).toEqual(inputData);
    expect(rightResults).toEqual(inputData);
  });

  it('should handle streams with many elements', async () => {
    const inputData = Array.from({ length: 1000 }, (_, i) => i);
    const mockStream = new MockSmithyMessageDecoderStream(inputData, {
      someOption: 'test',
    }) as unknown as SmithyMessageDecoderStream<number>;

    const [leftStream, rightStream] = tee(mockStream);

    const leftResults: number[] = [];
    const rightResults: number[] = [];
    const leftPromise = (async () => {
      for await (const chunk of leftStream) {
        leftResults.push(chunk);
      }
    })();

    const rightPromise = (async () => {
      for await (const chunk of rightStream) {
        rightResults.push(chunk);
      }
    })();

    await Promise.all([leftPromise, rightPromise]);

    expect(leftResults).toEqual(inputData);
    expect(rightResults).toEqual(inputData);
  });
});

class MockSmithyMessageDecoderStream<T> {
  private data: T[];
  private currentIndex: number;
  public options: {};

  constructor(data: T[], options?: {}) {
    this.data = data;
    this.currentIndex = 0;
    this.options = options || {};
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (this.currentIndex < this.data.length) {
      yield this.data[this.currentIndex++];
      // Add a small delay for async behavior simulation (optional)
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}
