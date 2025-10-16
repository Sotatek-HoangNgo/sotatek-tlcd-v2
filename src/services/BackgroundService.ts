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
import InjectorService from './InjectorService';
import logger from '@/utils/logger';

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
  injectorService: InjectorService;
  isProcessingData = false;
  retryIntervalId: number | undefined = undefined;
  debouncedProcessingData = _debounce(this.#processData, SERVICE_THROTTLE_TIME);

  constructor() {
    this.apiService = new APIService();
    this.injectorService = new InjectorService();
    this.userService = new UserService(this.apiService);

    this.injectorService.registerEventListener();
    this.#setupCookieListeners();
    this.#setupNavigationListeners();
    this.#setupBridgeMessageListener();
  }

  #setupBridgeMessageListener() {
    const refreshPortalLoginStatus = async () => {
      if (this.isProcessingData) {
        logger.log(
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
        logger.log(BackgroundService.SERVICE_NAME, 'Bridge message', 'No portal cookie found');

        return null;
      }

      await Promise.allSettled([this.#fetchUserOverallData(), this.#fetchAndStoreCheckInData(accessToken, email)]);

      return true;
    };

    onMessage(COMMUNICATION_MESSAGE_KEYS.RESET_PORTAL_DATA, async (data) => {
      logger.log(
        BackgroundService.SERVICE_NAME,
        'Bridge message',
        'Received bridge message with message and data: ',
        COMMUNICATION_MESSAGE_KEYS.RESET_PORTAL_DATA,
        data,
      );

      const isRefreshedData = await refreshPortalLoginStatus();
      if (isRefreshedData) {
        sendMessage(COMMUNICATION_MESSAGE_KEYS.REFRESH_COUNTDOWN, null, data.sender);
        this.injectorService.injectOrNotifyCountdownToChatFrame();
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

        logger.log(BackgroundService.SERVICE_NAME, 'Cookie change detected', changeInfo);

        if (changeInfo.cookie.value !== cookie) {
          this.debouncedProcessingData(REQUEST_PROCESS_ORIGIN.COOKIE_LISTENER);
          logger.log(BackgroundService.SERVICE_NAME, 'Triggering data processing due to cookie change.');
        }
      }
    });
  }

  #setupNavigationListeners() {
    chrome.webNavigation.onCommitted.addListener((details) => {
      const url = new URL(details.url);
      if (url.host === GOOGLE_CHAT_HOST && url.search.includes(GOOGLE_CHAT_FULL_SCREEN_FRAME_ID)) {
        logger.log(BackgroundService.SERVICE_NAME, 'Detect chat page', details);

        this.injectorService.addFrame(details.tabId, details.frameId);
      }
    });

    chrome.webNavigation.onCompleted.addListener((details) => this.#navigationHandler(details), {
      url: [{ hostEquals: GOOGLE_CHAT_HOST }, { urlEquals: GOOGLE_MAIL_CHAT_URL }],
    });
  }

  async #navigationHandler(details: chrome.webNavigation.WebNavigationFramedCallbackDetails) {
    logger.log(BackgroundService.SERVICE_NAME, 'Navigation completed:', details);

    // Clear any existing retry interval when new navigation occurs
    if (this.retryIntervalId) {
      clearInterval(this.retryIntervalId);
      this.retryIntervalId = undefined;
      logger.log(BackgroundService.SERVICE_NAME, 'Cleared existing retry interval due to new navigation.');
    }

    const isSuccess = await this.#processData(REQUEST_PROCESS_ORIGIN.CONSTRUCTOR);

    if (!isSuccess) {
      this.#setupRetryMechanism();
    }
  }

  async #fetchUserOverallData() {
    try {
      const sessionHeader = this.userService.getUserSessionId();
      if (!sessionHeader) {
        logger.log(BackgroundService.SERVICE_NAME, 'No portal cookie found or error fetching it.');
        await storageSet({ [STORAGE_KEYS.LOGIN_PORTAL_STATUS]: LOGIN_STATUS.NO_COOKIE });

        return;
      }

      const result = await this.apiService.fetchUserOverallData(sessionHeader);

      if (result.error) {
        logger.log(BackgroundService.SERVICE_NAME, 'Error fetching user overall data:', result);

        return;
      }

      const data = result.result;

      await storageSet({
        [STORAGE_KEYS.EMPLOYEE_ATTENDANCE]: data,
      });
    } catch (error) {
      logger.log(BackgroundService.SERVICE_NAME, 'Error fetching user overall data:', error);
    }
  }

  async #processData(caller: REQUEST_PROCESS_ORIGIN) {
    if (this.isProcessingData) {
      logger.log(BackgroundService.SERVICE_NAME, `Processing already in progress. Caller: ${caller}. Skipping.`);
      return false; // Indicate not processed this time
    }
    this.isProcessingData = true;
    logger.log(BackgroundService.SERVICE_NAME, `Starting data processing. Called by: ${caller}`);

    try {
      return await this.#mainDataHandler();
    } catch (error) {
      logger.error(BackgroundService.SERVICE_NAME, `Error during data processing (Caller: ${caller}):`, error);

      this.injectorService.injectOrNotifyCountdownToChatFrame(); // Attempt to show error on page
      return false;
    } finally {
      this.isProcessingData = false;
      logger.log(BackgroundService.SERVICE_NAME, 'Finished data processing.');
    }
  }

  async #mainDataHandler() {
    const sessionHeader = this.userService.getUserSessionId();
    if (!sessionHeader) {
      logger.log(BackgroundService.SERVICE_NAME, 'No portal cookie found or errors occured while fetching it.');

      await storageSet({ [STORAGE_KEYS.LOGIN_PORTAL_STATUS]: LOGIN_STATUS.NO_COOKIE });
      this.injectorService.injectOrNotifyCountdownToChatFrame();

      return false;
    }

    const { needsUpdate } = await this.#checkIfDataUpdateNeeded();
    if (!needsUpdate) {
      logger.log(BackgroundService.SERVICE_NAME, 'Data is fresh, and login session is up. Injecting content script.');
      this.injectorService.injectOrNotifyCountdownToChatFrame();

      return true;
    }

    const sotatekEmail = await this.userService.getUserEmail();

    if (!sotatekEmail) {
      logger.log(BackgroundService.SERVICE_NAME, "Cannot get user's email, try to access portal again");
      this.injectorService.injectOrNotifyCountdownToChatFrame();

      return false;
    }

    await this.#fetchUserOverallData();
    return this.#fetchStoreCheckInDataAndInjectCountdown(sessionHeader, sotatekEmail);
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
      logger.error('Error checking if data update is needed:', error);
      return { needsUpdate: true }; // Assume update needed on error
    }
  }

  async #fetchAndStoreCheckInData(accessHeader: string, email: string) {
    if (!email) {
      logger.error(BackgroundService.SERVICE_NAME, 'Sotatek email is missing, cannot fetch portal data.');
      await storageSet({ [STORAGE_KEYS.LOGIN_PORTAL_STATUS]: LOGIN_STATUS.SESSION_EXPIRED }); // Or a new status like "MISSING_EMAIL"

      return false;
    }

    logger.log(BackgroundService.SERVICE_NAME, `Fetching user ID for email: ${email}`);

    const userId = await this.userService.getUserId();

    if (!userId) {
      logger.error(BackgroundService.SERVICE_NAME, 'Failed to fetch user ID or session expired');
      await storageSet({ [STORAGE_KEYS.LOGIN_PORTAL_STATUS]: LOGIN_STATUS.SESSION_EXPIRED });

      return false;
    }

    await storageSet({ [STORAGE_KEYS.LOGIN_PORTAL_STATUS]: LOGIN_STATUS.SESSION_UP });

    // Fetch daily data
    const today = utils.getCurrentFormattedDate();
    const tomorrow = utils.getCurrentFormattedDate(1);

    logger.log(BackgroundService.SERVICE_NAME, `Fetching daily data for user ${userId} from ${today} to ${tomorrow}`);

    const todayCheckinData = await this.apiService.fetchUserData(accessHeader, userId, today, tomorrow);

    logger.log(BackgroundService.SERVICE_NAME, 'Fetched Daily Data:', todayCheckinData);

    let hasRetrievedTodayCheckinData = false;

    if (todayCheckinData.result !== undefined && !todayCheckinData.error) {
      await storageSet({ [STORAGE_KEYS.EMPLOYEE_DATA]: todayCheckinData });

      hasRetrievedTodayCheckinData = true;
      logger.log(BackgroundService.SERVICE_NAME, 'Successfully fetched and stored daily user data.');
    } else {
      logger.error(BackgroundService.SERVICE_NAME, 'Failed to fetch daily user data:', todayCheckinData.error);
    }

    // Fetch monthly data
    const { firstDay, lastDay } = utils.getFormattedMonthRange();
    const lastDayDate = new Date(lastDay);
    // API 'to' date is exclusive, so use the day after the actual last day.
    const nextDayAfterLast = utils.formatDate(
      new Date(lastDayDate.getFullYear(), lastDayDate.getMonth(), lastDayDate.getDate() + 1),
    );

    logger.log(
      BackgroundService.SERVICE_NAME,
      `Fetching monthly data for user ${userId} from ${firstDay} to ${nextDayAfterLast}`,
    );

    const monthlyData = await this.apiService.fetchUserData(accessHeader, userId, firstDay, nextDayAfterLast);

    logger.log(BackgroundService.SERVICE_NAME, 'Fetched Monthly Data:', monthlyData);

    if (monthlyData.result !== undefined && !monthlyData.error) {
      await storageSet({ [STORAGE_KEYS.EMPLOYEE_MONTH_DATA]: monthlyData });

      logger.log(BackgroundService.SERVICE_NAME, 'Successfully fetched and stored monthly user data.');
    } else {
      logger.error(BackgroundService.SERVICE_NAME, 'Failed to fetch monthly user data:', monthlyData.error);
    }

    const todayData = todayCheckinData?.result?.records?.[0];

    // If today check in is not push to the server yet, return false to trigger retry mechanism
    if (todayData && !todayData.check_in) {
      logger.log(BackgroundService.SERVICE_NAME, "Failed to get today's checkin data, retry...");
      hasRetrievedTodayCheckinData = false;
    }

    return hasRetrievedTodayCheckinData;
  }

  async #fetchStoreCheckInDataAndInjectCountdown(sessionHeader: string, sotatekEmail: string) {
    const hasRetrievedTodayCheckinData = await this.#fetchAndStoreCheckInData(sessionHeader, sotatekEmail);

    this.injectorService.injectOrNotifyCountdownToChatFrame();

    return hasRetrievedTodayCheckinData; // Overall success depends on fetching crucial daily data
  }

  #setupRetryMechanism() {
    if (this.retryIntervalId) {
      clearInterval(this.retryIntervalId); // Clear existing one if any
    }
    logger.log(BackgroundService.SERVICE_NAME, 'Setting up retry mechanism for data processing.');
    this.retryIntervalId = setInterval(async () => {
      logger.log(BackgroundService.SERVICE_NAME, 'Retrying data processing');
      const success = await this.#processData(REQUEST_PROCESS_ORIGIN.CONSTRUCTOR_RETRY);
      if (success) {
        logger.log(BackgroundService.SERVICE_NAME, 'Successfully fetched and stored data, close retry mechanism.');
        clearInterval(this.retryIntervalId);
        this.retryIntervalId = undefined;
      } else {
        logger.log(BackgroundService.SERVICE_NAME, 'Retry failed.');
      }
    }, FETCH_DATA_RETRY_INTERVAL); // Retry every 15 seconds
  }

  static setup() {
    return new BackgroundService();
  }
}

export default BackgroundService;
