import { COMMUNICATION_MESSAGE_KEYS, LOG_PREFIX } from '@/constants/config';
import useBrigdeMessaging from './useBridgeMessage';
import logger from '@/utils/logger';

function useAppActivities() {
  const { registerMessageListener, sendMessage } = useBrigdeMessaging();

  function appReadyNotification() {
    sendMessage(COMMUNICATION_MESSAGE_KEYS.INJECTOR_READY, null);
  }

  function responseBackgroundPingMessage(data: unknown) {
    logger.log(LOG_PREFIX, 'Received Ping message: ', data);

    return true;
  }

  registerMessageListener(COMMUNICATION_MESSAGE_KEYS.PING, responseBackgroundPingMessage);

  onMounted(() => {
    appReadyNotification();
  });
}

export default useAppActivities;
