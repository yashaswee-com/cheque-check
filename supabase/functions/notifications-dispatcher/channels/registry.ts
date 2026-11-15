import type { NotificationChannel } from '../types.ts'
import { PushNotificationHandler } from './push.handler.ts'
import type {
  PushDeliveryPort,
  PushProviderPort,
  TestModeConfig,
  VoiceDeliveryPort,
  VoiceProviderPort,
  NotificationChannelHandler,
} from './channel.types.ts'
import { VoiceNotificationHandler } from './voice.handler.ts'

export interface NotificationChannelServices {
  voiceDb: VoiceDeliveryPort
  pushDb: PushDeliveryPort
  voice: VoiceProviderPort | null
  testMode: TestModeConfig
  push?: PushProviderPort
}

export type NotificationChannelRegistry = Partial<
  Record<NotificationChannel, NotificationChannelHandler>
>

export function createNotificationChannelRegistry(
  services: NotificationChannelServices,
): NotificationChannelRegistry {
  return {
    voice: new VoiceNotificationHandler(
      services.voiceDb,
      services.voice,
      services.testMode,
    ),
    push: new PushNotificationHandler(services.pushDb, services.push),
  } satisfies NotificationChannelRegistry
}
