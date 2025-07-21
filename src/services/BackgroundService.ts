import {
  COMMUNICATION_MESSAGE_KEYS,
  GOOGLE_CHAT_FULL_SCREEN_FRAME_ID,
  GOOGLE_CHAT_HOST,
  GOOGLE_MAIL_CHAT_URL,
  LOG_PREFIX,
  LOGIN_STATUS,
  PORTAL_DOMAIN,
  STORAGE_KEYS,
} from '@/constants/config';
import { cookiesGetAll, executeScript, storageClear, storageGet, storageSet } from '@/utils/extension-helpers';
import { sleep } from '@/utils/mics';
import * as utils from '@/utils/time';
import APIService from './API';
import { onMessage, sendMessage } from 'webext-bridge/background';

enum REQUEST_PROCESS_ORIGIN {
  CONSTRUCTOR = 'constructor',
  COOKIE_LISTENER = 'cookie-listener',
  CONSTRUCTOR_RETRY = 'constructor-retry',
}
const FETCH_DATA_RETRY_INTERVAL = 10000;

class BackgroundService {
  currentTabId: number | null = null;
  currentIframeId: number | null = null;
  currentTabUrl: string | null = null;
  retryIntervalId: number | undefined = undefined;
  isProcessingData = false;
  apiService: APIService;

  constructor() {
    this.apiService = new APIService();
    this.#setupCookieListeners();
    this.#setupNavigationListeners();
    this.#setupBridgeMessageListener();
  }

  #setupBridgeMessageListener() {
    const refreshPortalLoginStatus = async () => {
      if (this.isProcessingData) {
        console.log(
          'Bridge message',
          'Received message for refreshing Portal data. Processing already in progress. Skipping.',
        );

        return false; // Indicate not processed this time
      }

      const cookie = await this.#getPortalCookie();

      if (!cookie) {
        console.log('Bridge message', 'No portal cookie found');
        await storageSet({ [STORAGE_KEYS.LOGIN_PORTAL_STATUS]: LOGIN_STATUS.NO_COOKIE });

        return null;
      }

      const { [STORAGE_KEYS.SOTATEK_EMAIL]: email } = await storageGet(STORAGE_KEYS.SOTATEK_EMAIL);
      const accessToken = `session_id=${cookie.value}`;

      await Promise.allSettled([this.#fetchUserOverallData(), this.#fetchAndStoreCheckInData(accessToken, email)]);

      return true;
    };

    onMessage(COMMUNICATION_MESSAGE_KEYS.RESET_PORTAL_DATA, async (data) => {
      console.log(
        'Background service',
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
        const cookie = await this.#getPortalCookie();

        if (!cookie) {
          console.log('No portal cookie found');
        }

        if (changeInfo.cookie.value !== cookie?.value) {
          // Debounce or delay to prevent rapid firing if multiple cookie changes occur
          await sleep(5000); // 5-second debounce/delay
          this.#processData(REQUEST_PROCESS_ORIGIN.COOKIE_LISTENER);
          console.log('Triggering data processing due to cookie change.');
        }
      }
    });
  }

  #setupNavigationListeners() {
    chrome.webNavigation.onCompleted.addListener((details) => this.#navigationHandler(details), {
      url: [{ hostEquals: GOOGLE_CHAT_HOST }, { urlEquals: GOOGLE_MAIL_CHAT_URL }],
    });
  }

  async #navigationHandler(details: chrome.webNavigation.WebNavigationFramedCallbackDetails) {
    this.currentTabId = details.tabId;
    this.currentTabUrl = details.url;
    console.log('Navigation completed:', details);

    // Clear any existing retry interval when new navigation occurs
    if (this.retryIntervalId) {
      clearInterval(this.retryIntervalId);
      this.retryIntervalId = undefined;
      console.log('Cleared existing retry interval due to new navigation.');
    }

    await this.#storeChatFrameId();

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

      chrome.webNavigation.getAllFrames({ tabId: this.currentTabId }, (frames) => {
        if (!frames || frames.length === 0) {
          console.warn('No frames found for the current tab.');
          rej(new Error('No frames found'));
          return;
        }

        const chatPanelFrame = frames.find((frame) => frame.url.includes(GOOGLE_CHAT_FULL_SCREEN_FRAME_ID));

        if (!chatPanelFrame) {
          rej(new Error('No chat panel frame found'));
          return;
        }

        this.currentIframeId = chatPanelFrame.frameId;
        console.log('Chat panel frame found:', chatPanelFrame);
        res(this.currentIframeId);
      });
    });
  }

  async #fetchUserOverallData() {
    try {
      const portalCookie = await this.#getPortalCookie();
      if (!portalCookie) {
        console.log(LOG_PREFIX, 'No portal cookie found or error fetching it.');

        await storageSet({ [STORAGE_KEYS.LOGIN_PORTAL_STATUS]: LOGIN_STATUS.NO_COOKIE });

        return;
      }
      const sessionHeader = `session_id=${portalCookie.value}`;

      const data = await this.apiService.fetchUserOverallData(sessionHeader);

      await storageSet({
        [STORAGE_KEYS.EMPLOYEE_ATTENDANCE]: data,
      });
    } catch (error) {
      console.log(LOG_PREFIX, 'Error fetching user overall data:', error);
    }
  }

  async #processData(caller: REQUEST_PROCESS_ORIGIN) {
    if (this.isProcessingData) {
      console.log(`Processing already in progress. Caller: ${caller}. Skipping.`);
      return false; // Indicate not processed this time
    }
    this.isProcessingData = true;
    console.log(`Starting data processing. Called by: ${caller}`);

    try {
      if (!this.currentTabId || !this.currentTabUrl) {
        console.warn('Cannot process data: currentTabId or currentTabUrl is not set.');
        return false;
      }

      console.log('Clearing local storage before processing.');
      await storageClear();

      return await this.#mainDataHandler(this.currentTabId, this.currentTabUrl, this.currentIframeId!);
    } catch (error) {
      console.error(`Error during data processing (Caller: ${caller}):`, error);
      if (this.currentTabId) this.injectOrNotifyCountdownToChatFrame(this.currentTabId, this.currentIframeId!); // Attempt to show error on page
      return false;
    } finally {
      this.isProcessingData = false;
      console.log('Finished data processing.');
    }
  }

  tabActiveListener(tabId: number, removeInfo: chrome.tabs.TabRemoveInfo) {}

  injectOrNotifyCountdownToChatFrame(tabId: number, frameId: number) {
    chrome.scripting.executeScript(
      {
        target: { tabId, frameIds: [frameId] },
        files: ['dist/scripts/injector.js'],
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error('Error injecting script: ', chrome.runtime.lastError.message);
        }

        chrome.tabs.onRemoved.addListener(this.tabActiveListener);
      },
    );

    chrome.scripting.insertCSS(
      {
        target: { tabId, frameIds: [frameId] },
        files: ['dist/assets/sotatek-tlcd-v2.css'],
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error('Error while injecting css: ', chrome.runtime.lastError.message);
          return;
        }

        console.log('Insert css successfully');
      },
    );
  }

  async #mainDataHandler(tabId: number, currentUrl: string, frameId: number) {
    if (currentUrl.includes('oi=1')) {
      console.log("URL includes 'oi=1', skipping handler.");
      return false; // Successfully skipped
    }

    const portalCookie = await this.#getPortalCookie();
    if (!portalCookie) {
      console.log('No portal cookie found or error fetching it.');

      await storageSet({ [STORAGE_KEYS.LOGIN_PORTAL_STATUS]: LOGIN_STATUS.NO_COOKIE });
      this.injectOrNotifyCountdownToChatFrame(tabId, frameId);

      return false;
    }
    const sessionHeader = `session_id=${portalCookie.value}`;

    const { needsUpdate, sotatekEmail } = await this.#checkIfDataUpdateNeeded(tabId);
    if (!needsUpdate) {
      console.log('Data is fresh, and login session is up. Injecting content script.');
      this.injectOrNotifyCountdownToChatFrame(tabId, frameId);
      return true;
    }

    // If email extraction failed previously and we need an update, try again or fail.
    if (!sotatekEmail && needsUpdate) {
      const extractedEmail = await this.#extractSotatekEmail(tabId);
      if (!extractedEmail) {
        console.error('Failed to extract Sotatek email, cannot proceed with data update.');
        this.injectOrNotifyCountdownToChatFrame(tabId, frameId);
        return false;
      }
      await storageSet({ [STORAGE_KEYS.SOTATEK_EMAIL]: extractedEmail });
      this.#fetchUserOverallData();

      // Re-call #fetchStoreCheckInDataAndInjectCountdown with the now available email
      return this.#fetchStoreCheckInDataAndInjectCountdown(sessionHeader, extractedEmail, tabId, frameId);
    } else if (sotatekEmail) {
      this.#fetchUserOverallData();
      return this.#fetchStoreCheckInDataAndInjectCountdown(sessionHeader, sotatekEmail, tabId, frameId);
    }

    // Should not be reached if logic is correct
    console.warn('Unexpected state in _mainDataHandler');
    return false;
  }

  async #getPortalCookie() {
    try {
      const cookies = await cookiesGetAll({ domain: PORTAL_DOMAIN });
      return cookies[0] || null;
    } catch (error) {
      console.error('Error getting portal cookies:', error);
      return null;
    }
  }

  async #checkIfDataUpdateNeeded(tabId: number) {
    try {
      const storedData = await storageGet([
        STORAGE_KEYS.EMPLOYEE_DATA,
        STORAGE_KEYS.LOGIN_PORTAL_STATUS,
        STORAGE_KEYS.SOTATEK_EMAIL,
      ]);

      const employeeData = storedData[STORAGE_KEYS.EMPLOYEE_DATA];
      const loginStatus = storedData[STORAGE_KEYS.LOGIN_PORTAL_STATUS];
      const sotatekEmail = storedData[STORAGE_KEYS.SOTATEK_EMAIL];

      const userDataRecord = employeeData?.result?.records[0];
      const isCheckedToday =
        userDataRecord?.date_check === utils.getCurrentFormattedDate() && userDataRecord?.check_in !== false;
      const isLoggedIn = loginStatus === LOGIN_STATUS.SESSION_UP;
      const needsUpdate = !employeeData || !isCheckedToday;

      if (!needsUpdate && isLoggedIn) {
        return {
          needsUpdate,
          sotatekEmail,
        };
      }

      return {
        needsUpdate: true,
        sotatekEmail: await this.#extractSotatekEmail(tabId),
      };
    } catch (error) {
      console.error('Error checking if data update is needed:', error);
      return { needsUpdate: true, sotatekEmail: await this.#extractSotatekEmail(tabId) }; // Assume update needed on error
    }
  }

  async #extractSotatekEmail(tabId: number) {
    try {
      const injectionResults = await executeScript({
        target: { tabId: tabId },
        func: () => {
          const elements = document.querySelectorAll('script');
          const emailRegex = /"([\w.-]+@sotatek\.com)"/i; // Case-insensitive, capturing group
          for (const element of elements) {
            const textContent = element.textContent || element.innerText || '';
            const match = textContent.match(emailRegex);
            if (match && match[1]) {
              return match[1]; // Return the captured email
            }
          }
          return null; // No email found
        },
      });
      const email = injectionResults?.[0]?.result;
      if (email) {
        console.log('Extracted Sotatek email:', email);
        await storageSet({ [STORAGE_KEYS.SOTATEK_EMAIL]: email });
        return email;
      }
      console.warn('Could not extract Sotatek email from the page.');
      return null;
    } catch (error) {
      console.error('Error executing script to extract email:', error);
      return null;
    }
  }

  async #fetchAndStoreCheckInData(accessHeader: string, email: string) {
    if (!email) {
      console.error('Sotatek email is missing, cannot fetch portal data.');
      await storageSet({ [STORAGE_KEYS.LOGIN_PORTAL_STATUS]: LOGIN_STATUS.SESSION_EXPIRED }); // Or a new status like "MISSING_EMAIL"

      return false;
    }

    console.log(`Fetching user ID for email: ${email}`);
    const userResponse = await this.apiService.fetchUserId(accessHeader, email);

    console.log('Fetched User Response:', userResponse);

    if (userResponse.error || !userResponse.result?.records?.length) {
      console.error('Failed to fetch user ID or session expired:', userResponse.error || 'No user records');
      await storageSet({ [STORAGE_KEYS.LOGIN_PORTAL_STATUS]: LOGIN_STATUS.SESSION_EXPIRED });

      return false;
    }

    await storageSet({ [STORAGE_KEYS.LOGIN_PORTAL_STATUS]: LOGIN_STATUS.SESSION_UP });
    const userId = userResponse.result.records[0].attendance_machine_id;
    console.log('Fetched User ID:', userId);

    // Fetch daily data
    const today = utils.getCurrentFormattedDate();
    const tomorrow = utils.getCurrentFormattedDate(1);
    console.log(`Fetching daily data for user ${userId} from ${today} to ${tomorrow}`);
    const todayCheckinData = await this.apiService.fetchUserData(accessHeader, userId, today, tomorrow);
    console.log('Fetched Daily Data:', todayCheckinData);

    let hasRetrievedTodayCheckinData = false;

    if (todayCheckinData.result !== undefined && !todayCheckinData.error) {
      await storageSet({ [STORAGE_KEYS.EMPLOYEE_DATA]: todayCheckinData });

      hasRetrievedTodayCheckinData = true;
      console.log('Successfully fetched and stored daily user data.');
    } else {
      console.error('Failed to fetch daily user data:', todayCheckinData.error);
    }

    // Fetch monthly data
    const { firstDay, lastDay } = utils.getFormattedMonthRange();
    const lastDayDate = new Date(lastDay);
    // API 'to' date is exclusive, so use the day after the actual last day.
    const nextDayAfterLast = utils.formatDate(
      new Date(lastDayDate.getFullYear(), lastDayDate.getMonth(), lastDayDate.getDate() + 1),
    );

    console.log(`Fetching monthly data for user ${userId} from ${firstDay} to ${nextDayAfterLast}`);
    const monthlyData = await this.apiService.fetchUserData(accessHeader, userId, firstDay, nextDayAfterLast);
    console.log('Fetched Monthly Data:', monthlyData);
    if (monthlyData.result !== undefined && !monthlyData.error) {
      await storageSet({ [STORAGE_KEYS.EMPLOYEE_MONTH_DATA]: monthlyData });
      console.log('Successfully fetched and stored monthly user data.');
    } else {
      console.error('Failed to fetch monthly user data:', monthlyData.error);
    }

    const todayData = todayCheckinData?.result?.records?.[0];

    // If today check in is not push to the server yet, return false to trigger retry mechanism
    if (todayData && !todayData.check_in) {
      console.log("Failed to get today's checkin data, retry...");
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
    console.log('Setting up retry mechanism for data processing.');
    this.retryIntervalId = setInterval(async () => {
      console.log('Retrying data processing');
      const success = await this.#processData(REQUEST_PROCESS_ORIGIN.CONSTRUCTOR_RETRY);
      if (success) {
        console.log('Successfully fetched and stored data, close retry mechanism.');
        clearInterval(this.retryIntervalId);
        this.retryIntervalId = undefined;
      } else {
        console.log('Retry failed.');
      }
    }, FETCH_DATA_RETRY_INTERVAL); // Retry every 15 seconds
  }

  static setup() {
    return new BackgroundService();
  }
}

export default BackgroundService;
