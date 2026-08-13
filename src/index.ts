import { WaClient, type MessageSummary } from "./wa-client";
import { Tui } from "./tui";
import { renderQrAscii } from "./qr";

async function main(): Promise<void> {
  const wa = new WaClient();
  const tui = new Tui();

  let activeChatName = "";

  interface PendingSend {
    chatId: string;
    text: string;
    lineIndex: number;
  }
  const pendingSends: PendingSend[] = [];

  function makeLocalMessage(chatId: string, text: string): MessageSummary {
    return {
      id: "",
      chatId,
      fromMe: true,
      senderName: "me",
      body: text,
      timestamp: Math.floor(Date.now() / 1000),
    };
  }

  wa.on("qr", async (qr) => {
    const ascii = await renderQrAscii(qr);
    await tui.showQr(ascii);
  });

  wa.on("ready", async () => {
    const chats = await wa.listChats();
    tui.showChats(chats);
    tui.showReady();
  });

  wa.on("message", (message: MessageSummary) => {
    if (message.fromMe) {
      const pendingIndex = pendingSends.findIndex(
        (pending) => pending.chatId === message.chatId && pending.text === message.body,
      );
      if (pendingIndex !== -1) {
        const [pending] = pendingSends.splice(pendingIndex, 1);
        tui.resolvePendingMessage(pending.lineIndex, message);
        return;
      }
    }
    tui.appendMessage(message);
    if (!message.fromMe && message.chatId !== activeChatName) {
      tui.markUnread(message.chatId);
    }
  });

  wa.on("auth_failure", (reason) => {
    tui.setStatus(`auth failed: ${reason}`);
  });

  wa.on("disconnected", async (reason) => {
    tui.setStatus(`disconnected (${reason}) — reconnecting...`);
    await wa.initialize().catch(() => {
      tui.setStatus(`disconnected (${reason}) — restart ws-cli`);
    });
  });

  tui.on("selectChat", async (chatId) => {
    activeChatName = chatId;
    const [chat] = (await wa.listChats()).filter((c) => c.id === chatId);
    const messages = await wa.getMessages(chatId);
    tui.openChat(chatId, chat?.name ?? chatId, messages);
  });

  tui.on("send", async (text) => {
    if (!activeChatName) {
      return;
    }
    const chatId = activeChatName;
    const lineIndex = tui.appendPendingMessage(makeLocalMessage(chatId, text));
    const pending: PendingSend = { chatId, text, lineIndex };
    pendingSends.push(pending);
    try {
      await wa.sendText(chatId, text);
    } catch {
      const index = pendingSends.indexOf(pending);
      if (index !== -1) {
        pendingSends.splice(index, 1);
      }
      tui.failPendingMessage(lineIndex, makeLocalMessage(chatId, text));
    }
  });

  const shutdown = async () => {
    tui.destroy();
    const timeout = new Promise((resolve) => setTimeout(resolve, 5000));
    await Promise.race([wa.destroy().catch(() => undefined), timeout]);
    process.exit(0);
  };

  tui.on("quit", shutdown);
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await wa.initialize();
}

main().catch((error) => {
  console.error("ws-cli failed to start:", error);
  process.exit(1);
});
