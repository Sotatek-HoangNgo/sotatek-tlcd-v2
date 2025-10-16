import { COMMUNICATION_MESSAGE_KEYS } from '@/constants/config';
import useBrigdeMessaging from './useBridgeMessage';

function useCountdownActivities(origin = 'popup') {
  const { registerMessageListener, unregisterMessageListener, sendMessage } = useBrigdeMessaging();

  function requestRefreshData() {
    return sendMessage(COMMUNICATION_MESSAGE_KEYS.RESET_PORTAL_DATA, {
      origin,
    });
  }

  function registerRefreshCountdownListener(handler: (data: unknown) => void) {
    registerMessageListener(COMMUNICATION_MESSAGE_KEYS.REFRESH_COUNTDOWN, handler);
  }

  function unregisterRefreshCountdownListener(handler: (data: any) => void) {
    unregisterMessageListener(COMMUNICATION_MESSAGE_KEYS.REFRESH_COUNTDOWN, handler);
  }

  return { registerRefreshCountdownListener, unregisterRefreshCountdownListener, requestRefreshData };
}

export default useCountdownActivities;
