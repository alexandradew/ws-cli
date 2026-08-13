import { EventEmitter } from "node:events";
import { Client, LocalAuth, type Chat, type Message } from "whatsapp-web.js";

export interface ChatSummary {
  id: string;
  name: string;
  isGroup: boolean;
  unreadCount: number;
  lastMessageTimestamp: number;
  lastMessagePreview: string;
}

export interface MessageSummary {
  id: string;
  chatId: string;
  fromMe: boolean;
  senderName: string;
  body: string;
  timestamp: number;
}

export interface WaClientEvents {
  qr: (qr: string) => void;
  ready: () => void;
  message: (message: MessageSummary) => void;
  disconnected: (reason: string) => void;
  auth_failure: (message: string) => void;
}

export declare interface WaClient {
  on<E extends keyof WaClientEvents>(event: E, listener: WaClientEvents[E]): this;
  emit<E extends keyof WaClientEvents>(event: E, ...args: Parameters<WaClientEvents[E]>): boolean;
}

export class WaClient extends EventEmitter {
  private readonly client: Client;

  constructor(sessionDataPath = ".wwebjs_auth") {
    super();
    this.client = new Client({
      authStrategy: new LocalAuth({ dataPath: sessionDataPath }),
      puppeteer: { headless: true },
    });
    this.wireEvents();
  }

  private wireEvents(): void {
    this.client.on("qr", (qr) => this.emit("qr", qr));
    this.client.on("ready", () => this.emit("ready"));
    this.client.on("disconnected", (reason) => this.emit("disconnected", String(reason)));
    this.client.on("auth_failure", (message) => this.emit("auth_failure", message));
    this.client.on("message_create", async (message) => {
      this.emit("message", await this.toMessageSummary(message));
    });
  }

  async initialize(): Promise<void> {
    await this.client.initialize();
  }

  async destroy(): Promise<void> {
    await this.client.destroy();
  }

  async sendText(chatId: string, text: string): Promise<void> {
    await this.client.sendMessage(chatId, text);
  }

  async listChats(): Promise<ChatSummary[]> {
    const chats = await this.client.getChats();
    return chats
      .map((chat) => this.toChatSummary(chat))
      .sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
  }

  async getMessages(chatId: string, limit = 50): Promise<MessageSummary[]> {
    const chat = await this.client.getChatById(chatId);
    const messages = await chat.fetchMessages({ limit });
    return Promise.all(messages.map((message) => this.toMessageSummary(message)));
  }

  private toChatSummary(chat: Chat): ChatSummary {
    return {
      id: chat.id._serialized,
      name: chat.name || chat.id.user,
      isGroup: chat.isGroup,
      unreadCount: chat.unreadCount,
      lastMessageTimestamp: chat.timestamp ?? 0,
      lastMessagePreview: chat.lastMessage?.body?.slice(0, 60) ?? "",
    };
  }

  private async toMessageSummary(message: Message): Promise<MessageSummary> {
    let senderName = "me";
    if (!message.fromMe) {
      const contact = await message.getContact().catch(() => null);
      senderName = contact?.pushname || contact?.name || message.from;
    }
    return {
      id: message.id._serialized,
      chatId: message.fromMe ? message.to : message.from,
      fromMe: message.fromMe,
      senderName,
      body: message.body,
      timestamp: message.timestamp,
    };
  }
}
