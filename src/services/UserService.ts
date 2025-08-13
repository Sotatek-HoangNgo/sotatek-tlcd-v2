import { GOOGLE_CHAT_HOST, GOOGLE_MAIL_CHAT_URL, PORTAL_DOMAIN, STORAGE_KEYS } from '@/constants/config';
import APIService from './API';
import { executeScript, storageSet } from '@/utils/extension-helpers';

enum EUSER_REQUEST_ID {
  GET_USER_EMAIL = 'get-user-email',
  GET_USER_ID = 'get-user-id',
}

interface IValueWithStatus {
  value: string;
  status: 'initial' | 'staled' | 'loading' | 'fresh' | 'error';
}

class UserService {
  private email: IValueWithStatus = {
    status: 'initial',
    value: '',
  };
  private uid: IValueWithStatus = {
    status: 'initial',
    value: '',
  };
  private pendingRequests: { id: string; request: Promise<any> }[] = [];
  sessionId: string = '';

  constructor(private apiService: APIService) {
    this.setup();
  }

  async setup() {
    await this.retrieveUserSessionId();
    await this.fetchUserEmail();
    await this.fetchUserCheckInId();
  }

  async retrieveUserSessionId() {
    try {
      const cookies = await chrome.cookies.getAll({ domain: PORTAL_DOMAIN });
      const sessionId = cookies.find((cookie) => cookie.name === 'session_id')?.value;

      this.sessionId = sessionId ?? '';
    } catch (error) {
      console.error('UserService', "Error occured while getting portal's cookies, check the site");
    }
  }

  async fetchUserCheckInId() {
    const userEmail = await this.getUserEmail();

    if (!userEmail) {
      return;
    }

    const pendingRetrieveRequest = this.pendingRequests.find((request) => request.id === EUSER_REQUEST_ID.GET_USER_ID);

    if (pendingRetrieveRequest) {
      return;
    }

    try {
      this.uid.status = 'loading';
      const request = this.apiService.fetchUserId(`session_id=${this.sessionId}`, userEmail);

      this.pendingRequests.push({
        id: EUSER_REQUEST_ID.GET_USER_ID,
        request,
      });

      const userResponse = await request;

      console.log('UserService', 'Fetched User Response:', userResponse);

      if (userResponse.error || !userResponse.result?.records?.length) {
        this.uid.status = 'error';
        console.error(
          'UserService',
          'Failed to fetch user ID or session expired:',
          userResponse.error || 'No user records',
        );

        return;
      }

      const userId = userResponse.result.records[0].attendance_machine_id;
      console.log('UserService', 'Fetched User ID:', userId);

      this.uid.status = 'fresh';
      this.uid.value = userId;
    } catch (error) {
      console.error('UserService', 'Encountered error while retrieving user ID', error);
      this.uid.status = 'error';
    } finally {
      this.pendingRequests = this.pendingRequests.filter((request) => request.id !== EUSER_REQUEST_ID.GET_USER_ID);
    }
  }

  async fetchUserEmail() {
    if (!this.sessionId) {
      console.log('UserService', 'Cannot retrieve session cookie, login portal again');

      return;
    }

    const pendingRetrieveRequest = this.pendingRequests.find(
      (request) => request.id === EUSER_REQUEST_ID.GET_USER_EMAIL,
    );

    if (pendingRetrieveRequest) {
      return;
    }

    this.email.status = 'loading';

    try {
      const retrieveRequest = this.apiService.retrieveUserPortalHompage(`session_id=${this.sessionId}`);

      this.pendingRequests.push({
        id: EUSER_REQUEST_ID.GET_USER_EMAIL,
        request: retrieveRequest,
      });

      const result = await retrieveRequest;
      if (result.result) {
        const userHomepageHtml = result.result;
        const userInfo = JSON.parse(
          (
            userHomepageHtml
              .match(/(?<=<script type="text\/javascript">)(.|\n)*?(?=<\/script>)/g)
              ?.map((str) => str.trim())
              .find((str) => str.startsWith('odoo.session_info = ')) || ''
          ).slice('odoo.session_info = '.length, -1),
        );

        this.email.value = userInfo.username;
        this.email.status = 'fresh';
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      this.email.status = 'error';
      console.log(
        'UserService',
        "Encountered error while retrieving user email, fallback to chat's email extraction, error info:",
        error,
      );

      await this.extractUserEmailFromGmailChatTab();
    } finally {
      this.pendingRequests = this.pendingRequests.filter((request) => request.id !== EUSER_REQUEST_ID.GET_USER_EMAIL);
      await storageSet({ [STORAGE_KEYS.SOTATEK_EMAIL]: this.email.value });
    }
  }

  async getUserEmail() {
    if (this.email.status === 'error') {
      this.fetchUserEmail();

      return (this.email.value = '');
    }

    if (this.email.status === 'loading') {
      const userEmailRetrieveRequest = this.pendingRequests.find(
        (request) => request.id === EUSER_REQUEST_ID.GET_USER_EMAIL,
      )?.request;

      if (userEmailRetrieveRequest) {
        await userEmailRetrieveRequest;
      }
    }

    if (this.email.status === 'staled') {
      this.fetchUserEmail();
    }

    return this.email.value;
  }

  async getUserId() {
    if (this.uid.status === 'error') {
      this.fetchUserCheckInId();

      return (this.uid.value = '');
    }

    if (this.uid.status === 'loading') {
      const pendingUserIdRetrieveRequest = this.pendingRequests.find(
        (request) => request.id === EUSER_REQUEST_ID.GET_USER_ID,
      )?.request;

      if (pendingUserIdRetrieveRequest) {
        await pendingUserIdRetrieveRequest;
      }
    }

    if (this.uid.status === 'staled') {
      this.fetchUserCheckInId();
    }

    return this.uid.value;
  }

  getUserSessionId() {
    return this.sessionId ? `session_id=${this.sessionId}` : '';
  }

  async extractUserEmailFromGmailChatTab() {
    const mailTabs = await chrome.tabs.query({ url: `${GOOGLE_MAIL_CHAT_URL}/*` });
    if (!mailTabs.length) {
      console.log('UserService', 'Failed to get gmail chat tab, check to see if the tab is closed');

      return;
    }

    const mailTab = mailTabs[0];
    const tabId = mailTab.id;

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
        console.log('UserService', 'Extracted Sotatek email:', email);
        this.email.status = 'fresh';
        return (this.email.value = email);
      }

      console.warn('UserService', 'Could not extract Sotatek email from the page.');

      return null;
    } catch (error) {
      console.error('UserService', 'Error executing script to extract email:', error);

      return null;
    }
  }
}

export default UserService;
