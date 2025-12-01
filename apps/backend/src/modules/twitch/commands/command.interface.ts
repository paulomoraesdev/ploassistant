import { ChatClient } from '@twurple/chat';

export interface CommandPayload {
  channel: string;
  user: string;
  message: string;
  args: string[];
  client: ChatClient;
}

export interface TwitchCommand {
  name: string;
  aliases?: string[];
  execute(payload: CommandPayload): Promise<void>;
}
