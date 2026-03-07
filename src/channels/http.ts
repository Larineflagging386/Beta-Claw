import * as http from 'node:http';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { IChannel, InboundMessage, OutboundMessage, ChannelFeature } from './interface.js';
import { OutboundMessageSchema } from './interface.js';

type MessageHandler = (msg: InboundMessage) => void;

const PostMessageBodySchema = z.object({
  content: z.string().min(1),
  groupId: z.string().optional(),
  senderId: z.string().optional(),
});

const WebhookConfigSchema = z.object({
  url: z.string().url(),
});

interface QueuedMessage {
  msg: OutboundMessage;
  timestamp: number;
}

export class HttpChannel implements IChannel {
  readonly id = 'http';
  readonly name = 'HTTP API';

  private server: http.Server | null = null;
  private handlers: MessageHandler[] = [];
  private readonly port: number;
  private webhookUrl: string | null = null;
  private outboundQueue: QueuedMessage[] = [];
  private startTime = 0;

  constructor(port = 3210) {
    this.port = port;
  }

  async connect(): Promise<void> {
    if (this.server) return;

    this.startTime = Date.now();
    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(this.port, () => resolve());
      this.server!.once('error', reject);
    });
  }

  async disconnect(): Promise<void> {
    if (!this.server) return;

    await new Promise<void>((resolve, reject) => {
      this.server!.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    this.server = null;
  }

  async send(msg: OutboundMessage): Promise<void> {
    const validated = OutboundMessageSchema.parse(msg);

    if (this.webhookUrl) {
      const body = JSON.stringify(validated);
      const url = new URL(this.webhookUrl);

      await new Promise<void>((resolve, reject) => {
        const options: http.RequestOptions = {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        };
        const req = http.request(options, () => resolve());
        req.on('error', reject);
        req.write(body);
        req.end();
      });
    } else {
      this.outboundQueue.push({ msg: validated, timestamp: Date.now() });
    }
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  supportsFeature(f: ChannelFeature): boolean {
    return f === 'markdown' || f === 'webhooks';
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const url = req.url ?? '/';
    const method = req.method ?? 'GET';

    if (method === 'GET' && url === '/health') {
      this.handleHealth(res);
      return;
    }

    if (method === 'POST' && url === '/message') {
      this.readBody(req, res, (body) => this.handleMessage(body, res));
      return;
    }

    if (method === 'POST' && url === '/webhook') {
      this.readBody(req, res, (body) => this.handleWebhook(body, res));
      return;
    }

    this.sendJson(res, 404, { error: 'Not found' });
  }

  private handleHealth(res: http.ServerResponse): void {
    this.sendJson(res, 200, {
      status: 'ok',
      uptime: Date.now() - this.startTime,
    });
  }

  private handleMessage(body: unknown, res: http.ServerResponse): void {
    const result = PostMessageBodySchema.safeParse(body);
    if (!result.success) {
      this.sendJson(res, 400, { error: 'Invalid request body', details: result.error.issues });
      return;
    }

    const msg: InboundMessage = {
      id: randomUUID(),
      groupId: result.data.groupId ?? 'http-default',
      senderId: result.data.senderId ?? 'http-user',
      content: result.data.content,
      timestamp: Date.now(),
    };

    for (const handler of this.handlers) {
      handler(msg);
    }

    this.sendJson(res, 200, { id: msg.id, status: 'received' });
  }

  private handleWebhook(body: unknown, res: http.ServerResponse): void {
    const result = WebhookConfigSchema.safeParse(body);
    if (!result.success) {
      this.sendJson(res, 400, { error: 'Invalid webhook configuration', details: result.error.issues });
      return;
    }

    this.webhookUrl = result.data.url;
    this.sendJson(res, 200, { status: 'configured', url: this.webhookUrl });
  }

  private readBody(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    callback: (body: unknown) => void,
  ): void {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      try {
        const parsed: unknown = JSON.parse(raw);
        callback(parsed);
      } catch {
        this.sendJson(res, 400, { error: 'Invalid JSON' });
      }
    });
  }

  private sendJson(res: http.ServerResponse, statusCode: number, data: Record<string, unknown>): void {
    const body = JSON.stringify(data);
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  }
}
