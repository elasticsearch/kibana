import type { Logger } from '@kbn/logging';
/**
 * Parses a Bedrock buffer from an array of chunks.
 *
 * @param {Uint8Array[]} chunks - Array of Uint8Array chunks to be parsed.
 * @returns {string} - Parsed string from the Bedrock buffer.
 */
export declare const parseBedrockBuffer: (chunks: Uint8Array[]) => string;
/**
 * Handle a chunk of data from the bedrock API.
 * @param chunk - The chunk of data to process.
 * @param bedrockBuffer - The buffer containing the current data.
 * @param chunkHandler - Optional function to handle the chunk once it has been processed.
 * @returns {decodedChunk, bedrockBuffer } - The decoded chunk and the updated buffer.
 */
export declare const handleBedrockChunk: ({ chunk, bedrockBuffer, chunkHandler, logger, }: {
    chunk: Uint8Array;
    bedrockBuffer: Uint8Array;
    chunkHandler?: (chunk: string) => void;
    logger?: Logger;
}) => {
    decodedChunk: string;
    bedrockBuffer: Uint8Array;
};
