import { createApp } from 'vue';
import CountdownApp from '@/modules/injector/index.vue';
import { GCHAT_INJECT_TARGET_SELECTOR, LOG_PREFIX, UI_IDS } from '@/constants/config';

import '@/styles/styles.css';

function waitForSiteReady() {
  return new Promise((res) => {
    const isDocumentReady = document.readyState === 'complete';

    if (isDocumentReady) {
      res(true);
      return;
    }

    document.onreadystatechange = () => {
      if (document.readyState === 'complete') {
        res(true);

        document.onreadystatechange = null;
      }
    };
  });
}

function setupUI() {
  const app = createApp(CountdownApp);
  const isInjectToIframe = window.parent !== window;
  const injectedAppElement = document.querySelector(`.${UI_IDS.APP_CONTAINER}`);

  if (injectedAppElement) {
    return;
  }

  const iframeLeftPanel = document.querySelector(GCHAT_INJECT_TARGET_SELECTOR.IFRAME_LEFT_PANEL);
  const leftPanelContainer = document.querySelector(GCHAT_INJECT_TARGET_SELECTOR.LEFT_PANEL_CONTAINER);

  let container = leftPanelContainer;

  if (isInjectToIframe) {
    const injectContainer = document.createElement('div');

    iframeLeftPanel?.insertAdjacentElement('afterend', injectContainer);

    container = injectContainer;
  }

  if (!container) {
    console.log(LOG_PREFIX, 'Failed to find container for injector.', app);

    return;
  }

  container.classList.add(UI_IDS.APP_CONTAINER);

  app.mount(container);

  console.log(LOG_PREFIX, 'UI containers set up.', app);
}

waitForSiteReady().then(setupUI);
