import { LOG_PREFIX, STORAGE_KEYS } from '@/constants/config';
import { storageGet, storageSet } from './extension-helpers';

export function sleep(time: number) {
  return new Promise((res) => setTimeout(res, time));
}

export async function fetchGoHomeMessageText() {
  const currentDate = new Date();

  try {
    const { [STORAGE_KEYS.GO_HOME_MESSAGE]: storedMsgData } = await storageGet(STORAGE_KEYS.GO_HOME_MESSAGE);

    if (storedMsgData && storedMsgData.date === currentDate.getDate()) {
      return storedMsgData.message;
    }

    const commonMessages = [
      'Working hours are over &nbsp;&#128536;',
      `It's time to go home &nbsp;&#127969; &nbsp;&#127939;`,
    ];
    const fridayMessages = [
      'Happy weekend &nbsp;&#127881; &nbsp;&#127881; &nbsp;&#127881;',
      'Today is Friday &nbsp;&#128561;',
      'Two days for party &nbsp;&#129782;',
    ];

    const messagesPool = currentDate.getDay() === 5 ? fridayMessages : commonMessages;
    const randomMessage = messagesPool[Math.floor(Math.random() * messagesPool.length)];

    await storageSet({
      [STORAGE_KEYS.GO_HOME_MESSAGE]: {
        date: currentDate.getDate(),
        message: randomMessage,
      },
    });
    return randomMessage;
  } catch (error) {
    console.error(LOG_PREFIX, 'Error fetching go home message:', error);
    return 'Time to go home! Have a great one!'; // Fallback
  }
}
