import { COMMUNICATION_MESSAGE_KEYS } from '@/constants/config';
import logger from '@/utils/logger';
import { onMessage, sendMessage } from 'webext-bridge/background';

interface IInjectFrame {
  frameId: number;
  tabId: number;
  injected: boolean;
  ready: boolean;
}

const POLLING_INTERVAL = 2000;

class InjectorService {
  static SERVICE_NAME = 'InjectorService';

  private framesList: IInjectFrame[] = [];
  private intervalId: number | null = null;

  registerEventListener() {
    this.registerBridgeMessageListener();
    this.registerNavigationListener();
  }

  registerNavigationListener() {
    chrome.tabs.onRemoved.addListener((tabId: number, removeInfo: chrome.tabs.TabRemoveInfo) => {
      logger.log(InjectorService.SERVICE_NAME, 'tabActiveListener change detect', { tabId, removeInfo });

      this.removeFrames(this.framesList.filter((frame) => frame.tabId === tabId));
    });
  }

  registerBridgeMessageListener() {
    onMessage(COMMUNICATION_MESSAGE_KEYS.INJECTOR_READY, (data) => {
      logger.log(
        InjectorService.SERVICE_NAME,
        'Bridge message',
        'Received bridge message with message and data: ',
        COMMUNICATION_MESSAGE_KEYS.INJECTOR_READY,
        data,
      );

      const injectOwnerTab = data.sender.tabId;

      this.framesList.forEach((frame) => {
        if (frame.tabId === injectOwnerTab) {
          frame.ready = true;
        }
      });
    });
  }

  addFrame(tabId: number, frameId: number) {
    if (this.framesList.find((item) => item.tabId === tabId && item.frameId === frameId)) {
      return;
    }

    this.framesList.push({
      tabId,
      frameId,
      injected: false,
      ready: false,
    });

    this.chatFrameActivityObserver();
  }

  removeFrames(frames: IInjectFrame[]) {
    this.framesList = this.framesList.filter((frame) => !frames.includes(frame));

    if (!this.framesList.length && this.intervalId) {
      clearInterval(this.intervalId);

      this.intervalId = null;
    }
  }

  chatFrameActivityObserver() {
    if (this.intervalId) {
      return;
    }

    this.intervalId = setInterval(() => {
      this.trackingChatFrameActivity();
    }, POLLING_INTERVAL);
  }

  injectOrNotifyCountdownToChatFrame() {
    this.framesList.forEach((frameItem) => {
      if (frameItem.ready) {
        sendMessage(COMMUNICATION_MESSAGE_KEYS.REFRESH_COUNTDOWN, null, {
          context: 'content-script',
          tabId: frameItem.tabId,
          frameId: frameItem.frameId,
        });

        return;
      }

      if (frameItem.injected) {
        return;
      }

      frameItem.injected = true;

      chrome.scripting.executeScript(
        {
          target: { tabId: frameItem.tabId, frameIds: [frameItem.frameId] },
          files: ['dist/scripts/injector.js'],
        },
        () => {
          if (chrome.runtime.lastError) {
            logger.error(InjectorService.SERVICE_NAME, 'Error injecting script: ', chrome.runtime.lastError.message);
          }

          logger.log(InjectorService.SERVICE_NAME, 'Insert js successfully');
        },
      );

      chrome.scripting.insertCSS(
        {
          target: { tabId: frameItem.tabId, frameIds: [frameItem.frameId] },
          files: ['dist/assets/sotatek-tlcd-v2.css'],
        },
        () => {
          if (chrome.runtime.lastError) {
            logger.error(InjectorService.SERVICE_NAME, 'Error while injecting css: ', chrome.runtime.lastError.message);
            return;
          }

          logger.log(InjectorService.SERVICE_NAME, 'Insert css successfully');
        },
      );
    });
  }

  async trackingChatFrameActivity() {
    const inactiveFrames: IInjectFrame[] = [];
    const runningFrames = this.framesList.filter((frame) => frame.ready);

    const requestList = await Promise.allSettled(
      runningFrames.map((frame) =>
        sendMessage(COMMUNICATION_MESSAGE_KEYS.PING, null, {
          context: 'content-script',
          tabId: frame.tabId,
          frameId: frame.frameId,
        }),
      ),
    );

    requestList.forEach((request, i) => {
      if (request.status === 'rejected' && this.framesList[i].ready) {
        logger.log(InjectorService.SERVICE_NAME, 'Frame inactive: ', request);

        inactiveFrames.push(runningFrames[i]);
      }
    });

    if (inactiveFrames.length) {
      this.removeFrames(inactiveFrames);
    }
  }
}

export default InjectorService;
