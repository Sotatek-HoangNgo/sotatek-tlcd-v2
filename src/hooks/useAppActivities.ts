import { COMMUNICATION_MESSAGE_KEYS } from '@/constants/config';
import useBrigdeMessaging from './useBridgeMessage';

function useAppActivities() {
  const { registerMessageListener, sendMessage } = useBrigdeMessaging();

  function appReadyNotification() {
    sendMessage(COMMUNICATION_MESSAGE_KEYS.INJECTOR_READY, null);
  }

  function responseBackgroundPingMessage(data: unknown) {
    return true;
  }

  registerMessageListener(COMMUNICATION_MESSAGE_KEYS.PING, responseBackgroundPingMessage);

  onMounted(() => {
    appReadyNotification();
  });
}

export default useAppActivities;
