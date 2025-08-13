import { COMMUNICATION_MESSAGE_KEYS, LOG_PREFIX } from '@/constants/config';
import { sendMessage as sendMessageBridge, onMessage as onMessageBridge } from 'webext-bridge/content-script';

export function notifyAppMountMessage(isFromIframe: boolean) {
  sendMessageBridge(COMMUNICATION_MESSAGE_KEYS.SETUP_INJECTOR, { origin: isFromIframe ? 'iframe' : 'app' });
}

type TCommunicationMessageKey = (typeof COMMUNICATION_MESSAGE_KEYS)[keyof typeof COMMUNICATION_MESSAGE_KEYS];

const listenersMap = new Map<TCommunicationMessageKey, ((data: any) => void)[]>();

export default function useBrigdeMessaging() {
  const sendMessage = async (key: TCommunicationMessageKey, data: any) => {
    await sendMessageBridge(key, data);
  };

  function registerRefreshCountdownListener(handler: (data: unknown) => void) {
    if (listenersMap.has(COMMUNICATION_MESSAGE_KEYS.REFRESH_COUNTDOWN)) {
      listenersMap.get(COMMUNICATION_MESSAGE_KEYS.REFRESH_COUNTDOWN)!.push(handler);
    } else {
      listenersMap.set(COMMUNICATION_MESSAGE_KEYS.REFRESH_COUNTDOWN, [handler]);

      onMessageBridge(COMMUNICATION_MESSAGE_KEYS.REFRESH_COUNTDOWN, (data) => {
        console.log(
          LOG_PREFIX,
          'Injector received bridge message: ',
          COMMUNICATION_MESSAGE_KEYS.REFRESH_COUNTDOWN,
          data,
        );

        for (const handler of listenersMap.get(COMMUNICATION_MESSAGE_KEYS.REFRESH_COUNTDOWN)!) {
          handler(data);
        }
      });
    }
  }

  function unregisterRefreshCountdownListener(handler: (data: any) => void) {
    if (listenersMap.has(COMMUNICATION_MESSAGE_KEYS.REFRESH_COUNTDOWN)) {
      listenersMap.set(
        COMMUNICATION_MESSAGE_KEYS.REFRESH_COUNTDOWN,
        listenersMap.get(COMMUNICATION_MESSAGE_KEYS.REFRESH_COUNTDOWN)!.filter((item) => item !== handler),
      );
    }
  }

  return {
    sendMessage,
    registerRefreshCountdownListener,
    unregisterRefreshCountdownListener,
  };
}
