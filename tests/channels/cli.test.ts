import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { CliChannel } from '../../src/channels/cli.js';
import type { InboundMessage, OutboundMessage } from '../../src/channels/interface.js';

describe('CliChannel', () => {
  let input: PassThrough;
  let output: PassThrough;
  let channel: CliChannel;

  beforeEach(() => {
    input = new PassThrough();
    output = new PassThrough();
    channel = new CliChannel(input, output);
  });

  afterEach(async () => {
    await channel.disconnect();
  });

  it('has correct id and name', () => {
    expect(channel.id).toBe('cli');
    expect(channel.name).toBe('Command Line');
  });

  it('supportsFeature returns true for markdown', () => {
    expect(channel.supportsFeature('markdown')).toBe(true);
  });

  it('supportsFeature returns false for unsupported features', () => {
    expect(channel.supportsFeature('webhooks')).toBe(false);
    expect(channel.supportsFeature('images')).toBe(false);
    expect(channel.supportsFeature('reactions')).toBe(false);
    expect(channel.supportsFeature('threads')).toBe(false);
    expect(channel.supportsFeature('files')).toBe(false);
  });

  it('send writes content to output stream', async () => {
    await channel.connect();

    const chunks: string[] = [];
    output.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));

    const msg: OutboundMessage = {
      groupId: 'cli-default',
      content: 'Hello from CLI',
    };

    await channel.send(msg);

    const written = chunks.join('');
    expect(written).toContain('Hello from CLI');
    expect(written).toContain('\n');
  });

  it('onMessage registers handler and receives InboundMessage on line input', async () => {
    await channel.connect();

    const received: InboundMessage[] = [];
    channel.onMessage((msg) => received.push(msg));

    input.write('test message\n');

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received).toHaveLength(1);
    expect(received[0]!.content).toBe('test message');
    expect(received[0]!.groupId).toBe('cli-default');
    expect(received[0]!.senderId).toBe('cli-user');
    expect(received[0]!.id).toBeDefined();
    expect(typeof received[0]!.timestamp).toBe('number');
  });

  it('InboundMessage has correct structure with all required fields', async () => {
    await channel.connect();

    const received: InboundMessage[] = [];
    channel.onMessage((msg) => received.push(msg));

    input.write('structured test\n');

    await new Promise((resolve) => setTimeout(resolve, 50));

    const msg = received[0]!;
    expect(msg).toMatchObject({
      groupId: 'cli-default',
      senderId: 'cli-user',
      content: 'structured test',
    });
    expect(msg.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(msg.timestamp).toBeLessThanOrEqual(Date.now());
  });

  it('connect and disconnect lifecycle works correctly', async () => {
    await channel.connect();
    await channel.disconnect();
    await channel.connect();
    await channel.disconnect();
  });

  it('connect is idempotent', async () => {
    await channel.connect();
    await channel.connect();
    await channel.disconnect();
  });

  it('disconnect is idempotent', async () => {
    await channel.connect();
    await channel.disconnect();
    await channel.disconnect();
  });

  it('ignores empty lines', async () => {
    await channel.connect();

    const received: InboundMessage[] = [];
    channel.onMessage((msg) => received.push(msg));

    input.write('\n');
    input.write('   \n');

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received).toHaveLength(0);
  });

  it('supports multiple handlers', async () => {
    await channel.connect();

    const received1: InboundMessage[] = [];
    const received2: InboundMessage[] = [];
    channel.onMessage((msg) => received1.push(msg));
    channel.onMessage((msg) => received2.push(msg));

    input.write('multi\n');

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
  });
});
