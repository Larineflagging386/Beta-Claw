import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
import { HttpChannel } from '../../src/channels/http.js';
import type { InboundMessage } from '../../src/channels/interface.js';

const TEST_PORT = 39_210;

function request(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        const data = JSON.parse(raw) as Record<string, unknown>;
        resolve({ status: res.statusCode ?? 0, data });
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function requestRaw(
  method: string,
  path: string,
  rawBody: string,
): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(rawBody),
      },
    };

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf-8');
        const data = JSON.parse(raw) as Record<string, unknown>;
        resolve({ status: res.statusCode ?? 0, data });
      });
    });

    req.on('error', reject);
    req.write(rawBody);
    req.end();
  });
}

describe('HttpChannel', () => {
  let channel: HttpChannel;

  beforeAll(async () => {
    channel = new HttpChannel(TEST_PORT);
    await channel.connect();
  });

  afterAll(async () => {
    await channel.disconnect();
  });

  it('has correct id and name', () => {
    expect(channel.id).toBe('http');
    expect(channel.name).toBe('HTTP API');
  });

  it('supportsFeature returns true for markdown and webhooks', () => {
    expect(channel.supportsFeature('markdown')).toBe(true);
    expect(channel.supportsFeature('webhooks')).toBe(true);
  });

  it('supportsFeature returns false for unsupported features', () => {
    expect(channel.supportsFeature('images')).toBe(false);
    expect(channel.supportsFeature('reactions')).toBe(false);
    expect(channel.supportsFeature('threads')).toBe(false);
    expect(channel.supportsFeature('files')).toBe(false);
  });

  it('GET /health returns status ok and uptime', async () => {
    const { status, data } = await request('GET', '/health');
    expect(status).toBe(200);
    expect(data['status']).toBe('ok');
    expect(typeof data['uptime']).toBe('number');
    expect(data['uptime'] as number).toBeGreaterThanOrEqual(0);
  });

  it('POST /message creates InboundMessage and triggers handler', async () => {
    const received: InboundMessage[] = [];
    channel.onMessage((msg) => received.push(msg));

    const { status, data } = await request('POST', '/message', {
      content: 'hello from http test',
      groupId: 'test-group',
      senderId: 'test-user',
    });

    expect(status).toBe(200);
    expect(data['status']).toBe('received');
    expect(typeof data['id']).toBe('string');

    expect(received).toHaveLength(1);
    expect(received[0]!.content).toBe('hello from http test');
    expect(received[0]!.groupId).toBe('test-group');
    expect(received[0]!.senderId).toBe('test-user');
    expect(received[0]!.id).toBeDefined();
    expect(typeof received[0]!.timestamp).toBe('number');
  });

  it('POST /message uses defaults when groupId and senderId omitted', async () => {
    const received: InboundMessage[] = [];
    channel.onMessage((msg) => received.push(msg));

    const { status } = await request('POST', '/message', {
      content: 'defaults test',
    });

    expect(status).toBe(200);
    const last = received[received.length - 1]!;
    expect(last.groupId).toBe('http-default');
    expect(last.senderId).toBe('http-user');
  });

  it('POST /message returns 400 when content is missing', async () => {
    const { status, data } = await request('POST', '/message', {
      groupId: 'test',
    });

    expect(status).toBe(400);
    expect(data['error']).toBe('Invalid request body');
  });

  it('POST /message returns 400 for invalid JSON body', async () => {
    const { status, data } = await requestRaw('POST', '/message', 'not-json{{{');

    expect(status).toBe(400);
    expect(data['error']).toBe('Invalid JSON');
  });

  it('returns 404 for unknown routes', async () => {
    const { status, data } = await request('GET', '/unknown');
    expect(status).toBe(404);
    expect(data['error']).toBe('Not found');
  });

  it('disconnect closes the server', async () => {
    const tempChannel = new HttpChannel(TEST_PORT + 1);
    await tempChannel.connect();

    const { status } = await new Promise<{ status: number; data: Record<string, unknown> }>((resolve, reject) => {
      const req = http.request(
        { hostname: '127.0.0.1', port: TEST_PORT + 1, path: '/health', method: 'GET' },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf-8');
            resolve({ status: res.statusCode ?? 0, data: JSON.parse(raw) as Record<string, unknown> });
          });
        },
      );
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(200);

    await tempChannel.disconnect();

    await expect(
      new Promise((_, reject) => {
        const req = http.request(
          { hostname: '127.0.0.1', port: TEST_PORT + 1, path: '/health', method: 'GET' },
          () => { /* noop */ },
        );
        req.on('error', reject);
        req.end();
      }),
    ).rejects.toThrow();
  });

  it('POST /webhook configures webhook URL', async () => {
    const { status, data } = await request('POST', '/webhook', {
      url: 'http://localhost:9999/hook',
    });

    expect(status).toBe(200);
    expect(data['status']).toBe('configured');
    expect(data['url']).toBe('http://localhost:9999/hook');
  });

  it('POST /webhook returns 400 for invalid URL', async () => {
    const { status, data } = await request('POST', '/webhook', {
      url: 'not-a-url',
    });

    expect(status).toBe(400);
    expect(data['error']).toBe('Invalid webhook configuration');
  });
});
