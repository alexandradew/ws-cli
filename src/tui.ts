import { EventEmitter } from "node:events";
import blessed from "blessed";
import type { ChatSummary, MessageSummary } from "./wa-client";

export interface TuiEvents {
  selectChat: (chatId: string, name: string) => void;
  send: (text: string) => void;
  quit: () => void;
}

export declare interface Tui {
  on<E extends keyof TuiEvents>(event: E, listener: TuiEvents[E]): this;
  emit<E extends keyof TuiEvents>(event: E, ...args: Parameters<TuiEvents[E]>): boolean;
}

const WHATSAPP_GREEN = "#25D366";
// Terminals don't do real alpha compositing, so a "more opaque" green
// highlight is approximated by blending the brand color toward black.
const WHATSAPP_GREEN_MUTED = "#0e4226";

function formatTime(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  return date.toTimeString().slice(0, 5);
}

const MEDIA_LABELS: Record<string, string> = {
  image: "[image]",
  sticker: "[sticker]",
  video: "[video]",
  ptt: "[voice note]",
  audio: "[audio]",
  document: "[file]",
  location: "[location]",
  vcard: "[contact]",
  multi_vcard: "[contacts]",
  groups_v4_invite: "[group invite]",
  revoked: "[message deleted]",
};

function displayBody(message: MessageSummary): string {
  const label = MEDIA_LABELS[message.type];
  if (!label) {
    return message.body;
  }
  return message.body ? `${label} ${message.body}` : label;
}

export class Tui extends EventEmitter {
  private readonly screen: blessed.Widgets.Screen;
  private readonly qrBox: blessed.Widgets.BoxElement;
  private readonly chatList: blessed.Widgets.ListElement;
  private readonly threadBox: blessed.Widgets.Log;
  private readonly inputBar: blessed.Widgets.TextboxElement;

  private chats: ChatSummary[] = [];
  private activeChatId: string | null = null;

  constructor() {
    super();
    this.screen = blessed.screen({
      smartCSR: true,
      title: "session",
    });

    this.qrBox = blessed.box({
      parent: this.screen,
      top: "center",
      left: "center",
      width: "shrink",
      height: "shrink",
      align: "center",
      tags: false,
      hidden: true,
      content: "waiting for QR code...",
      border: { type: "line" },
      style: { border: { fg: WHATSAPP_GREEN } },
    });

    this.chatList = blessed.list({
      parent: this.screen,
      label: " chats ",
      top: 0,
      left: 0,
      width: "25%",
      height: "100%-3",
      border: { type: "line" },
      keys: true,
      vi: true,
      mouse: true,
      style: {
        selected: { bg: WHATSAPP_GREEN_MUTED, fg: "white", bold: true },
        item: { hover: { bg: WHATSAPP_GREEN_MUTED } },
        border: { fg: "white" },
      },
    });

    this.threadBox = blessed.log({
      parent: this.screen,
      label: " thread ",
      top: 0,
      left: "25%",
      width: "75%",
      height: "100%-3",
      border: { type: "line" },
      tags: false,
      mouse: true,
      scrollable: true,
      alwaysScroll: true,
      style: { border: { fg: "white" } },
    });

    this.inputBar = blessed.textbox({
      parent: this.screen,
      bottom: 0,
      left: 0,
      width: "100%",
      height: 3,
      border: { type: "line" },
      inputOnFocus: true,
      style: { border: { fg: "white" } },
    });

    this.wireKeys();
    this.chatList.hide();
    this.threadBox.hide();
    this.inputBar.hide();
    this.screen.render();
  }

  private wireKeys(): void {
    this.screen.key(["C-c"], () => this.emit("quit"));

    this.chatList.key(["tab"], () => this.inputBar.focus());
    this.inputBar.key(["tab"], () => this.chatList.focus());
    this.inputBar.key(["escape"], () => this.inputBar.clearValue());

    this.chatList.on("select", (_item, index) => {
      const chat = this.chats[index];
      if (chat) {
        this.emit("selectChat", chat.id, chat.name);
      }
    });

    this.inputBar.on("submit", (value: string) => {
      const text = value.trim();
      this.inputBar.clearValue();
      this.inputBar.focus();
      this.screen.render();
      if (text) {
        this.emit("send", text);
      }
    });
  }

  async showQr(ascii: string): Promise<void> {
    this.chatList.hide();
    this.threadBox.hide();
    this.inputBar.hide();
    this.qrBox.show();
    this.qrBox.setContent(`${ascii}\n\nscan with WhatsApp: Linked Devices`);
    this.screen.render();
  }

  showReady(): void {
    this.qrBox.hide();
    this.chatList.show();
    this.threadBox.show();
    this.inputBar.show();
    this.chatList.focus();
    this.screen.render();
  }

  setStatus(text: string): void {
    this.threadBox.setLabel(` thread — ${text} `);
    this.screen.render();
  }

  showChats(chats: ChatSummary[]): void {
    this.chats = chats;
    this.sortAndRenderChats();
  }

  // Bumps a chat's recency (and unread count, for incoming messages to a
  // chat that isn't currently open) so the list re-sorts with the newest
  // activity on top, same as WhatsApp's own chat list.
  registerActivity(message: MessageSummary): void {
    const index = this.chats.findIndex((chat) => chat.id === message.chatId);
    if (index === -1) {
      return;
    }
    const chat = this.chats[index];
    const isActiveChat = message.chatId === this.activeChatId;
    this.chats[index] = {
      ...chat,
      lastMessageTimestamp: message.timestamp,
      lastMessagePreview: message.body.slice(0, 60),
      unreadCount: isActiveChat || message.fromMe ? chat.unreadCount : chat.unreadCount + 1,
    };
    this.sortAndRenderChats();
  }

  private sortAndRenderChats(): void {
    this.chats.sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
    const items = this.chats.map((chat) => {
      const badge = chat.unreadCount > 0 ? ` (${chat.unreadCount})` : "";
      return `${chat.name}${badge}`;
    });
    this.chatList.setItems(items);
    if (this.activeChatId) {
      const index = this.chats.findIndex((chat) => chat.id === this.activeChatId);
      if (index !== -1) {
        this.chatList.select(index);
      }
    }
    this.screen.render();
  }

  openChat(chatId: string, name: string, messages: MessageSummary[]): void {
    this.activeChatId = chatId;
    const index = this.chats.findIndex((chat) => chat.id === chatId);
    if (index !== -1 && this.chats[index].unreadCount > 0) {
      this.chats[index] = { ...this.chats[index], unreadCount: 0 };
      this.sortAndRenderChats();
    }
    this.threadBox.setLabel(` thread — ${name} `);
    this.threadBox.setContent("");
    for (const message of messages) {
      this.appendMessage(message);
    }
    this.inputBar.focus();
    this.screen.render();
  }

  appendMessage(message: MessageSummary): void {
    if (message.chatId !== this.activeChatId) {
      return;
    }
    this.threadBox.log(this.formatLine(message));
    this.screen.render();
  }

  appendPendingMessage(message: MessageSummary): number {
    if (message.chatId !== this.activeChatId) {
      return -1;
    }
    this.threadBox.log(this.formatLine(message, "sending"));
    this.screen.render();
    return this.threadBox.getLines().length - 1;
  }

  resolvePendingMessage(lineIndex: number, message: MessageSummary): void {
    if (lineIndex < 0 || message.chatId !== this.activeChatId) {
      return;
    }
    this.threadBox.setLine(lineIndex, this.formatLine(message));
    this.screen.render();
  }

  failPendingMessage(lineIndex: number, message: MessageSummary): void {
    if (lineIndex < 0 || message.chatId !== this.activeChatId) {
      return;
    }
    this.threadBox.setLine(lineIndex, this.formatLine(message, "failed"));
    this.screen.render();
  }

  private formatLine(message: MessageSummary, status?: "sending" | "failed"): string {
    const who = message.fromMe ? "me" : message.senderName;
    const suffix = status === "sending" ? "  (sending…)" : status === "failed" ? "  (failed to send)" : "";
    return `${formatTime(message.timestamp)}  ${who}\t${displayBody(message)}${suffix}`;
  }

  destroy(): void {
    this.screen.destroy();
  }
}
