import { LOG_PREFIX, UI_IDS } from '@/constants/config';
import CountdownApp from '@/modules/injector/index.vue';
import { createApp } from 'vue';
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

  if (document.querySelector(`.${UI_IDS.APP_CONTAINER}`)) {
    const container = document.querySelector(`.${UI_IDS.APP_CONTAINER}`);

    app.mount(container!);
    console.log(LOG_PREFIX, 'UI containers set up.', app);
    return;
  }

  let previousSiblings = document.querySelector('.SuElue');

  if (!previousSiblings) {
    previousSiblings = document.querySelector('.cYHKzf');

    if (!previousSiblings) {
      previousSiblings = document.body.firstElementChild;
    }
  }

  const container = document.createElement('div');
  container.classList.add(UI_IDS.APP_CONTAINER);

  previousSiblings?.insertAdjacentElement('afterend', container);

  app.mount(container);
  console.log(LOG_PREFIX, 'UI containers set up.', app);
}

waitForSiteReady().then(setupUI);
