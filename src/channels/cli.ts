import * as readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import type { IChannel, InboundMessage, OutboundMessage, ChannelFeature } from './interface.js';
import { OutboundMessageSchema } from './interface.js';

type MessageHandler = (msg: InboundMessage) => void;

export class CliChannel implements IChannel {
  readonly id = 'cli';
  readonly name = 'Command Line';

  private rl: readline.Interface | null = null;
  private handlers: MessageHandler[] = [];
  private readonly input: NodeJS.ReadableStream;
  private readonly output: NodeJS.WritableStream;

  constructor(
    input: NodeJS.ReadableStream = process.stdin,
    output: NodeJS.WritableStream = process.stdout,
  ) {
    this.input = input;
    this.output = output;
  }

  async connect(): Promise<void> {
    if (this.rl) return;

    this.rl = readline.createInterface({
      input: this.input,
      output: this.output,
      terminal: false,
    });

    this.rl.on('line', (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const msg: InboundMessage = {
        id: randomUUID(),
        groupId: 'cli-default',
        senderId: 'cli-user',
        content: trimmed,
        timestamp: Date.now(),
      };

      for (const handler of this.handlers) {
        handler(msg);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }

  async send(msg: OutboundMessage): Promise<void> {
    const validated = OutboundMessageSchema.parse(msg);
    const text = validated.content + '\n';
    await new Promise<void>((resolve, reject) => {
      this.output.write(text, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  supportsFeature(f: ChannelFeature): boolean {
    return f === 'markdown';
  }
}
