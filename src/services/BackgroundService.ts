import { onMessage, sendMessage } from 'webext-bridge/background';
import { debounce as _debounce } from 'lodash';

import {
  COMMUNICATION_MESSAGE_KEYS,
  GOOGLE_CHAT_FULL_SCREEN_FRAME_ID,
  GOOGLE_CHAT_HOST,
  GOOGLE_MAIL_CHAT_URL,
  LOGIN_STATUS,
  PORTAL_DOMAIN,
  STORAGE_KEYS,
} from '@/constants/config';
import { storageGet, storageSet } from '@/utils/extension-helpers';
import * as utils from '@/utils/time';
import APIService from './API';
import UserService from './UserService';

enum REQUEST_PROCESS_ORIGIN {
  CONSTRUCTOR = 'constructor',
  COOKIE_LISTENER = 'cookie-listener',
  CONSTRUCTOR_RETRY = 'constructor-retry',
}

const FETCH_DATA_RETRY_INTERVAL = 10000;
const SERVICE_THROTTLE_TIME = 5000;

class BackgroundService {
  static SERVICE_NAME = 'BackgroundService';
  apiService: APIService;
  userService: UserService;
  currentTabId: number | null = null;
  currentIframeId: number | null = null;
  currentTabUrl: string | null = null;
  retryIntervalId: number | undefined = undefined;
  isProcessingData = false;
  injectedAppInfo: null | {
    tabId: number;
    iframeId?: number;
  } = null;
  debouncedProcessingData = _debounce(this.#processData, SERVICE_THROTTLE_TIME);

  constructor() {
    this.apiService = new APIService();
    this.userService = new UserService(this.apiService);

    this.#setupCookieListeners();
    this.#setupNavigationListeners();
    this.#setupBridgeMessageListener();
  }

  #setupBridgeMessageListener() {
    const refreshPortalLoginStatus = async () => {
      if (this.isProcessingData) {
        console.log(
          BackgroundService.SERVICE_NAME,
          'Bridge message',
          'Received message for refreshing Portal data. Processing already in progress. Skipping.',
        );

        return false; // Indicate not processed this time
      }

      const accessToken = this.userService.getUserSessionId();
      const email = await this.userService.getUserEmail();
      const canRetrieveUserData = accessToken && email;

      if (!canRetrieveUserData) {
        console.log(BackgroundService.SERVICE_NAME, 'Bridge message', 'No portal cookie found');

        return null;
      }

      await Promise.allSettled([this.#fetchUserOverallData(), this.#fetchAndStoreCheckInData(accessToken, email)]);

      return true;
    };

    onMessage(COMMUNICATION_MESSAGE_KEYS.SETUP_INJECTOR, (data) => {
      console.log(
        BackgroundService.SERVICE_NAME,
        'Bridge message',
        'Received bridge message with message and data: ',
        COMMUNICATION_MESSAGE_KEYS.SETUP_INJECTOR,
        data,
      );

      const senderData = data.data;
      const senderOrigin = (senderData as Record<string, string>).origin;

      this.injectedAppInfo = {
        tabId: this.currentTabId!,
        iframeId: senderOrigin === 'iframe' ? this.currentIframeId! : undefined,
      };
    });

    onMessage(COMMUNICATION_MESSAGE_KEYS.RESET_PORTAL_DATA, async (data) => {
      console.log(
        BackgroundService.SERVICE_NAME,
        'Bridge message',
        'Received bridge message with message and data: ',
        COMMUNICATION_MESSAGE_KEYS.RESET_PORTAL_DATA,
        data,
      );

      const isRefreshedData = await refreshPortalLoginStatus();
      if (isRefreshedData) {
        sendMessage(COMMUNICATION_MESSAGE_KEYS.REFRESH_COUNTDOWN, null, data.sender);
      }
    });
  }

  #setupCookieListeners() {
    chrome.cookies.onChanged.addListener(async (changeInfo) => {
      if (changeInfo.cookie.domain === PORTAL_DOMAIN) {
        await this.userService.retrieveUserSessionId();

        const cookie = this.userService.sessionId;

        if (!cookie) {
          return;
        }

        console.log(BackgroundService.SERVICE_NAME, 'Cookie change detected', changeInfo);

        if (changeInfo.cookie.value !== cookie) {
          this.debouncedProcessingData(REQUEST_PROCESS_ORIGIN.COOKIE_LISTENER);
          console.log(BackgroundService.SERVICE_NAME, 'Triggering data processing due to cookie change.');
        }
      }
    });
  }

  #setupNavigationListeners() {
    chrome.tabs.onRemoved.addListener(this.tabActiveListener);

    chrome.webNavigation.onCommitted.addListener((details) => {
      const isCurrentTabReload = details.transitionType === 'reload' && this.currentTabId === details.tabId;

      if (isCurrentTabReload) {
        console.log(BackgroundService.SERVICE_NAME, 'Detect tab reload');
        this.currentIframeId = null;
      }
    });

    chrome.webNavigation.onCompleted.addListener((details) => this.#navigationHandler(details), {
      url: [{ hostEquals: GOOGLE_CHAT_HOST }, { urlEquals: GOOGLE_MAIL_CHAT_URL }],
    });
  }

  async #navigationHandler(details: chrome.webNavigation.WebNavigationFramedCallbackDetails) {
    this.currentTabId = details.tabId;
    this.currentTabUrl = details.url;
    console.log(BackgroundService.SERVICE_NAME, 'Navigation completed:', details);

    // Clear any existing retry interval when new navigation occurs
    if (this.retryIntervalId) {
      clearInterval(this.retryIntervalId);
      this.retryIntervalId = undefined;
      console.log(BackgroundService.SERVICE_NAME, 'Cleared existing retry interval due to new navigation.');
    }

    if (!this.currentIframeId) {
      await this.#storeChatFrameId();
    }

    const isSuccess = await this.#processData(REQUEST_PROCESS_ORIGIN.CONSTRUCTOR);

    if (!isSuccess) {
      this.#setupRetryMechanism();
    }
  }

  #storeChatFrameId() {
    return new Promise((res, rej) => {
      if (!this.currentTabId) {
        rej(new Error(''));
        return;
      }

      this.injectedAppInfo = null;

      chrome.webNavigation.getAllFrames({ tabId: this.currentTabId }, (frames) => {
        if (!frames || frames.length === 0) {
          console.warn(BackgroundService.SERVICE_NAME, 'No frames found for the current tab.');

          rej(new Error('No frames found'));
        } else {
          const chatPanelFrame = frames.find((frame) => frame.url.includes(GOOGLE_CHAT_FULL_SCREEN_FRAME_ID));

          if (!chatPanelFrame) {
            rej(new Error('No chat panel frame found'));
          } else {
            this.currentIframeId = chatPanelFrame.frameId;

            console.log(BackgroundService.SERVICE_NAME, 'Chat panel frame found:', chatPanelFrame);
            res(this.currentIframeId);
          }
        }
      });
    });
  }

  async #fetchUserOverallData() {
    try {
      const sessionHeader = this.userService.getUserSessionId();
      if (!sessionHeader) {
        console.log(BackgroundService.SERVICE_NAME, 'No portal cookie found or error fetching it.');
        await storageSet({ [STORAGE_KEYS.LOGIN_PORTAL_STATUS]: LOGIN_STATUS.NO_COOKIE });

        return;
      }

      const data = await this.apiService.fetchUserOverallData(sessionHeader);

      await storageSet({
        [STORAGE_KEYS.EMPLOYEE_ATTENDANCE]: data,
      });
    } catch (error) {
      console.log(BackgroundService.SERVICE_NAME, 'Error fetching user overall data:', error);
    }
  }

  async #processData(caller: REQUEST_PROCESS_ORIGIN) {
    if (this.isProcessingData) {
      console.log(BackgroundService.SERVICE_NAME, `Processing already in progress. Caller: ${caller}. Skipping.`);
      return false; // Indicate not processed this time
    }
    this.isProcessingData = true;
    console.log(BackgroundService.SERVICE_NAME, `Starting data processing. Called by: ${caller}`);

    try {
      if (!this.currentTabId || !this.currentTabUrl) {
        console.warn(BackgroundService.SERVICE_NAME, 'Cannot process data: currentTabId or currentTabUrl is not set.');
        return false;
      }

      return await this.#mainDataHandler(this.currentTabId, this.currentTabUrl, this.currentIframeId!);
    } catch (error) {
      console.error(BackgroundService.SERVICE_NAME, `Error during data processing (Caller: ${caller}):`, error);
      if (this.currentTabId) this.injectOrNotifyCountdownToChatFrame(this.currentTabId, this.currentIframeId!); // Attempt to show error on page
      return false;
    } finally {
      this.isProcessingData = false;
      console.log(BackgroundService.SERVICE_NAME, 'Finished data processing.');
    }
  }

  tabActiveListener(tabId: number, removeInfo: chrome.tabs.TabRemoveInfo) {
    console.log(BackgroundService.SERVICE_NAME, 'tabActiveListener change detect', { tabId, removeInfo });

    if (this.injectedAppInfo?.tabId === tabId) {
      console.log(BackgroundService.SERVICE_NAME, 'Clear inject tab info');

      this.injectedAppInfo = null;
    }
  }

  injectOrNotifyCountdownToChatFrame(tabId: number, frameId: number) {
    if (this.injectedAppInfo) {
      sendMessage(COMMUNICATION_MESSAGE_KEYS.REFRESH_COUNTDOWN, null, {
        context: 'content-script',
        tabId: this.injectedAppInfo.tabId,
        frameId: this.injectedAppInfo.iframeId,
      });

      return;
    }

    chrome.scripting.executeScript(
      {
        target: { tabId, frameIds: [frameId] },
        files: ['dist/scripts/injector.js'],
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error(BackgroundService.SERVICE_NAME, 'Error injecting script: ', chrome.runtime.lastError.message);
        }
      },
    );

    chrome.scripting.insertCSS(
      {
        target: { tabId, frameIds: [frameId] },
        files: ['dist/assets/sotatek-tlcd-v2.css'],
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error(
            BackgroundService.SERVICE_NAME,
            'Error while injecting css: ',
            chrome.runtime.lastError.message,
          );
          return;
        }

        console.log(BackgroundService.SERVICE_NAME, 'Insert css successfully');
      },
    );
  }

  async #mainDataHandler(tabId: number, currentUrl: string, frameId: number) {
    if (currentUrl.includes('oi=1')) {
      console.log(BackgroundService.SERVICE_NAME, "URL includes 'oi=1', skipping handler.");
      return false; // Successfully skipped
    }
    const sessionHeader = this.userService.getUserSessionId();
    if (!sessionHeader) {
      console.log(BackgroundService.SERVICE_NAME, 'No portal cookie found or errors occured while fetching it.');

      await storageSet({ [STORAGE_KEYS.LOGIN_PORTAL_STATUS]: LOGIN_STATUS.NO_COOKIE });
      this.injectOrNotifyCountdownToChatFrame(tabId, frameId);

      return false;
    }

    const { needsUpdate } = await this.#checkIfDataUpdateNeeded();
    if (!needsUpdate) {
      console.log(BackgroundService.SERVICE_NAME, 'Data is fresh, and login session is up. Injecting content script.');
      this.injectOrNotifyCountdownToChatFrame(tabId, frameId);
      return true;
    }

    const sotatekEmail = await this.userService.getUserEmail();

    if (!sotatekEmail) {
      console.log(BackgroundService.SERVICE_NAME, "Cannot get user's email, try to access portal again");
      this.injectOrNotifyCountdownToChatFrame(tabId, frameId);

      return false;
    }

    await this.#fetchUserOverallData();
    return this.#fetchStoreCheckInDataAndInjectCountdown(sessionHeader, sotatekEmail, tabId, frameId);
  }

  async #checkIfDataUpdateNeeded() {
    try {
      const storedData = await storageGet([STORAGE_KEYS.EMPLOYEE_DATA, STORAGE_KEYS.LOGIN_PORTAL_STATUS]);

      const employeeData = storedData[STORAGE_KEYS.EMPLOYEE_DATA];
      const loginStatus = storedData[STORAGE_KEYS.LOGIN_PORTAL_STATUS];

      const userDataRecord = employeeData?.result?.records[0];
      const isCheckedToday =
        userDataRecord?.date_check === utils.getCurrentFormattedDate() && userDataRecord?.check_in !== false;
      const isLoggedIn = loginStatus === LOGIN_STATUS.SESSION_UP;
      const needsUpdate = !employeeData || !isCheckedToday;

      if (!needsUpdate && isLoggedIn) {
        return {
          needsUpdate,
        };
      }

      return {
        needsUpdate: true,
      };
    } catch (error) {
      console.error('Error checking if data update is needed:', error);
      return { needsUpdate: true }; // Assume update needed on error
    }
  }

  async #fetchAndStoreCheckInData(accessHeader: string, email: string) {
    if (!email) {
      console.error(BackgroundService.SERVICE_NAME, 'Sotatek email is missing, cannot fetch portal data.');
      await storageSet({ [STORAGE_KEYS.LOGIN_PORTAL_STATUS]: LOGIN_STATUS.SESSION_EXPIRED }); // Or a new status like "MISSING_EMAIL"

      return false;
    }

    console.log(BackgroundService.SERVICE_NAME, `Fetching user ID for email: ${email}`);

    const userId = await this.userService.getUserId();

    if (!userId) {
      console.error(BackgroundService.SERVICE_NAME, 'Failed to fetch user ID or session expired');
      await storageSet({ [STORAGE_KEYS.LOGIN_PORTAL_STATUS]: LOGIN_STATUS.SESSION_EXPIRED });

      return false;
    }

    await storageSet({ [STORAGE_KEYS.LOGIN_PORTAL_STATUS]: LOGIN_STATUS.SESSION_UP });

    // Fetch daily data
    const today = utils.getCurrentFormattedDate();
    const tomorrow = utils.getCurrentFormattedDate(1);

    console.log(BackgroundService.SERVICE_NAME, `Fetching daily data for user ${userId} from ${today} to ${tomorrow}`);

    const todayCheckinData = await this.apiService.fetchUserData(accessHeader, userId, today, tomorrow);

    console.log(BackgroundService.SERVICE_NAME, 'Fetched Daily Data:', todayCheckinData);

    let hasRetrievedTodayCheckinData = false;

    if (todayCheckinData.result !== undefined && !todayCheckinData.error) {
      await storageSet({ [STORAGE_KEYS.EMPLOYEE_DATA]: todayCheckinData });

      hasRetrievedTodayCheckinData = true;
      console.log(BackgroundService.SERVICE_NAME, 'Successfully fetched and stored daily user data.');
    } else {
      console.error(BackgroundService.SERVICE_NAME, 'Failed to fetch daily user data:', todayCheckinData.error);
    }

    // Fetch monthly data
    const { firstDay, lastDay } = utils.getFormattedMonthRange();
    const lastDayDate = new Date(lastDay);
    // API 'to' date is exclusive, so use the day after the actual last day.
    const nextDayAfterLast = utils.formatDate(
      new Date(lastDayDate.getFullYear(), lastDayDate.getMonth(), lastDayDate.getDate() + 1),
    );

    console.log(
      BackgroundService.SERVICE_NAME,
      `Fetching monthly data for user ${userId} from ${firstDay} to ${nextDayAfterLast}`,
    );

    const monthlyData = await this.apiService.fetchUserData(accessHeader, userId, firstDay, nextDayAfterLast);

    console.log(BackgroundService.SERVICE_NAME, 'Fetched Monthly Data:', monthlyData);

    if (monthlyData.result !== undefined && !monthlyData.error) {
      await storageSet({ [STORAGE_KEYS.EMPLOYEE_MONTH_DATA]: monthlyData });

      console.log(BackgroundService.SERVICE_NAME, 'Successfully fetched and stored monthly user data.');
    } else {
      console.error(BackgroundService.SERVICE_NAME, 'Failed to fetch monthly user data:', monthlyData.error);
    }

    const todayData = todayCheckinData?.result?.records?.[0];

    // If today check in is not push to the server yet, return false to trigger retry mechanism
    if (todayData && !todayData.check_in) {
      console.log(BackgroundService.SERVICE_NAME, "Failed to get today's checkin data, retry...");
      hasRetrievedTodayCheckinData = false;
    }

    return hasRetrievedTodayCheckinData;
  }

  async #fetchStoreCheckInDataAndInjectCountdown(
    sessionHeader: string,
    sotatekEmail: string,
    tabId: number,
    frameId: number,
  ) {
    const hasRetrievedTodayCheckinData = await this.#fetchAndStoreCheckInData(sessionHeader, sotatekEmail);

    this.injectOrNotifyCountdownToChatFrame(tabId, frameId);

    return hasRetrievedTodayCheckinData; // Overall success depends on fetching crucial daily data
  }

  #setupRetryMechanism() {
    if (this.retryIntervalId) {
      clearInterval(this.retryIntervalId); // Clear existing one if any
    }
    console.log(BackgroundService.SERVICE_NAME, 'Setting up retry mechanism for data processing.');
    this.retryIntervalId = setInterval(async () => {
      console.log(BackgroundService.SERVICE_NAME, 'Retrying data processing');
      const success = await this.#processData(REQUEST_PROCESS_ORIGIN.CONSTRUCTOR_RETRY);
      if (success) {
        console.log(BackgroundService.SERVICE_NAME, 'Successfully fetched and stored data, close retry mechanism.');
        clearInterval(this.retryIntervalId);
        this.retryIntervalId = undefined;
      } else {
        console.log(BackgroundService.SERVICE_NAME, 'Retry failed.');
      }
    }, FETCH_DATA_RETRY_INTERVAL); // Retry every 15 seconds
  }

  static setup() {
    return new BackgroundService();
  }
}

export default BackgroundService;
