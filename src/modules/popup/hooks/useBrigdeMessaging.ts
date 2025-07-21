import { COMMUNICATION_MESSAGE_KEYS } from '@/constants/config';
import { onMessage as onMessageBridge, sendMessage as sendMessageBridge } from 'webext-bridge/popup';

type TCommunicationMessageKey = (typeof COMMUNICATION_MESSAGE_KEYS)[keyof typeof COMMUNICATION_MESSAGE_KEYS];

const listenersMap = new Map<TCommunicationMessageKey, ((data: any) => void)[]>();

export default function useBrigdeMessaging() {
  const sendMessage = async (key: TCommunicationMessageKey, data: any) => {
    await sendMessageBridge(key, data);
  };

  async function requestRefreshData() {
    await sendMessage(COMMUNICATION_MESSAGE_KEYS.RESET_PORTAL_DATA, {
      origin: 'popup',
    });
  }

  function registerRefreshCountdownListener(handler: (data: unknown) => void) {
    if (listenersMap.has(COMMUNICATION_MESSAGE_KEYS.REFRESH_COUNTDOWN)) {
      listenersMap.get(COMMUNICATION_MESSAGE_KEYS.REFRESH_COUNTDOWN)!.push(handler);
    } else {
      listenersMap.set(COMMUNICATION_MESSAGE_KEYS.REFRESH_COUNTDOWN, [handler]);

      onMessageBridge(COMMUNICATION_MESSAGE_KEYS.REFRESH_COUNTDOWN, (data) => {
        console.log('popup received bridge message: ', COMMUNICATION_MESSAGE_KEYS.REFRESH_COUNTDOWN, data);

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
    requestRefreshData,
    registerRefreshCountdownListener,
    unregisterRefreshCountdownListener,
  };
}
