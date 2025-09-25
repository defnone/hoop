import type { DbUserSettings } from '@server/db/app/app-schema';

export interface TelegramApiResponse<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

export interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  chat: TelegramChat;
  text?: string;
}

export class TelegramAdapter {
  private readonly token: string;
  private readonly apiBase: string;
  private readonly chatId: string;

  constructor(settings: DbUserSettings) {
    const token = settings.botToken;
    const chatId = settings.telegramId;
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
    if (!chatId) throw new Error('TELEGRAM_CHAT_ID is not set');
    this.token = token;
    this.chatId = String(chatId);
    this.apiBase = `https://api.telegram.org/bot${this.token}`;
  }

  private async callApi<T>(
    method: string,
    payload: Record<string, unknown>
  ): Promise<T> {
    const res = await fetch(`${this.apiBase}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Telegram API ${method} failed: ${res.status} ${text}`);
    }

    let json: TelegramApiResponse<T>;
    try {
      json = JSON.parse(text) as TelegramApiResponse<T>;
    } catch {
      throw new Error(`Telegram API ${method} returned invalid JSON`);
    }

    if (!json.ok) {
      throw new Error(
        `Telegram API ${method} error: ${json.error_code ?? ''} ${json.description ?? ''}`.trim()
      );
    }

    return json.result as T;
  }

  public async sendUpdate(
    tvshow: string,
    data: Record<number, string>
  ): Promise<TelegramMessage> {
    let text = `Downloaded "${tvshow}" episodes:\n`;
    for (const [_, file] of Object.entries(data)) {
      text += ` - ${file.split('/').pop()?.split('.')[0]}\n`;
    }
    return this.callApi<TelegramMessage>('sendMessage', {
      chat_id: this.chatId,
      text,
    });
  }
}
