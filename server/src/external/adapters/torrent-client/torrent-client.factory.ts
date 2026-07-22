import { QBittorrent } from '@ctrl/qbittorrent';
import { Transmission } from '@ctrl/transmission';
import type { DbTorrentItem } from '@server/db/app/app-schema';
import { SettingsService } from '@server/features/settings/settings.service';
import { QbittorrentAdapter } from '@server/external/adapters/qbittorrent';
import { TransmissionAdapter } from '@server/external/adapters/transmission';
import type {
  TorrentClientConnection,
  TorrentClientPort,
  TorrentClientType,
} from './torrent-client.types';

type CreateTorrentClientParams = {
  id: number;
  torrentItem?: DbTorrentItem;
};

export async function createTorrentClient(
  params: CreateTorrentClientParams,
): Promise<TorrentClientPort> {
  const settings = await new SettingsService().getSettings();
  if (!settings) throw new Error('Torrent client settings not found');
  const clientType = getClientType(params.torrentItem, settings.torrentClientType);
  const connection = getStoredConnection(settings, clientType);
  if (connection.type === 'qbittorrent') {
    return new QbittorrentAdapter({
      ...params,
      client: createQbittorrentClient(connection),
      settings,
    });
  }
  return new TransmissionAdapter({
    ...params,
    client: createTransmissionClient(connection),
    settings,
  });
}

export async function verifyTorrentClientConnection(
  connection: TorrentClientConnection,
): Promise<string> {
  if (connection.type === 'qbittorrent') {
    return await createQbittorrentClient(connection).getAppVersion();
  }
  const client = createTransmissionClient(connection);
  const data = await client.getSession();
  return data.arguments.version;
}

function getClientType(
  torrentItem: DbTorrentItem | undefined,
  configuredType: TorrentClientType,
): TorrentClientType {
  return torrentItem?.torrentClientId
    ? torrentItem.torrentClientType
    : configuredType;
}

function getStoredConnection(settings: {
  torrentClientType: 'transmission' | 'qbittorrent';
  torrentClientUrl: string | null;
  torrentClientUsername: string | null;
  torrentClientPassword: string | null;
}, clientType: TorrentClientType): TorrentClientConnection {
  if (clientType === 'transmission') {
    return getTransmissionConnection(
      settings,
      settings.torrentClientType === 'transmission',
    );
  }
  if (
    !settings.torrentClientUrl ||
    !settings.torrentClientUsername ||
    !settings.torrentClientPassword
  ) {
    throw new Error('Torrent client connection settings are incomplete');
  }
  return {
    type: clientType,
    url: settings.torrentClientUrl,
    username: settings.torrentClientUsername,
    password: settings.torrentClientPassword,
  };
}

function getTransmissionConnection(settings: {
  torrentClientUrl: string | null;
  torrentClientUsername: string | null;
  torrentClientPassword: string | null;
}, useStoredSettings: boolean): TorrentClientConnection {
  const url =
    (useStoredSettings ? settings.torrentClientUrl : null) ??
    process.env.TRANSMISSION_BASE_URL;
  const username =
    (useStoredSettings ? settings.torrentClientUsername : null) ??
    process.env.TRANSMISSION_USERNAME;
  const password =
    (useStoredSettings ? settings.torrentClientPassword : null) ??
    process.env.TRANSMISSION_PASSWORD;
  if (!url || !username || !password) {
    throw new Error('Torrent client connection settings are incomplete');
  }
  return { type: 'transmission', url, username, password };
}

function createTransmissionClient(connection: TorrentClientConnection) {
  return new Transmission({
    baseUrl: connection.url,
    username: connection.username,
    password: connection.password,
  });
}

function createQbittorrentClient(connection: TorrentClientConnection) {
  return new QBittorrent({
    baseUrl: connection.url,
    username: connection.username,
    password: connection.password,
  });
}
