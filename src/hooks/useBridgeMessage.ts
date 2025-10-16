import { COMMUNICATION_MESSAGE_KEYS, LOG_PREFIX } from '@/constants/config';
import { sendMessage as sendMessageBridge, onMessage as onMessageBridge } from 'webext-bridge/content-script';

type TCommunicationMessageKey = (typeof COMMUNICATION_MESSAGE_KEYS)[keyof typeof COMMUNICATION_MESSAGE_KEYS];

const listenersMap = new Map<TCommunicationMessageKey, ((data: any) => void)[]>();

export default function useBrigdeMessaging() {
  async function sendMessage(key: TCommunicationMessageKey, data: any) {
    await sendMessageBridge(key, data);
  }

  function registerMessageListener(key: TCommunicationMessageKey, handler: (data: unknown) => void) {
    if (listenersMap.has(key)) {
      listenersMap.get(key)!.push(handler);
    } else {
      listenersMap.set(key, [handler]);

      onMessageBridge(key, (data) => {
        for (const handler of listenersMap.get(key)!) {
          handler(data);
        }
      });
    }
  }

  function unregisterMessageListener(key: TCommunicationMessageKey, handler: (data: unknown) => void) {
    if (listenersMap.has(key)) {
      listenersMap.set(
        key,
        listenersMap.get(key)!.filter((item) => item !== handler),
      );
    }
  }

  return {
    sendMessage,
    registerMessageListener,
    unregisterMessageListener,
  };
}
