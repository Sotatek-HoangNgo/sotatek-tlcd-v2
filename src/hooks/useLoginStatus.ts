import { LOG_PREFIX, LOGIN_STATUS, STORAGE_KEYS } from '@/constants/config';
import { storageGet } from '@/utils/extension-helpers';

export default function useLoginStatus() {
  const loginStatus = ref<string>(LOGIN_STATUS.NO_COOKIE);

  const isLoggedIn = computed(() => {
    return loginStatus.value === LOGIN_STATUS.SESSION_UP;
  });

  async function retrieveLoginStatus(onLoginError?: (error: unknown) => void) {
    try {
      const { [STORAGE_KEYS.LOGIN_PORTAL_STATUS]: status } = await storageGet(STORAGE_KEYS.LOGIN_PORTAL_STATUS);

      loginStatus.value = status;

      return status === LOGIN_STATUS.SESSION_UP;
    } catch (error) {
      console.error(LOG_PREFIX, 'Error while getting user login status:', error);
      onLoginError?.(error);
    }
  }

  return {
    status: loginStatus,
    isLoggedIn,
    retrieveLoginStatus,
  };
}
