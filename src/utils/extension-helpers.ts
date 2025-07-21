// src/extension-helpers.ts

/**
 * Promisified chrome.storage.local.get
 */
export function storageGet(keys: string | string[] | Record<string, any> | null): Promise<Record<string, any>> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      resolve(result);
    });
  });
}

/**
 * Promisified chrome.storage.local.set
 */
export function storageSet(items: Record<string, any>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      resolve();
    });
  });
}

/**
 * Promisified chrome.storage.local.clear
 */
export function storageClear(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    chrome.storage.local.clear(() => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      resolve();
    });
  });
}

/**
 * Promisified chrome.cookies.getAll
 */
export function cookiesGetAll(details: chrome.cookies.GetAllDetails): Promise<chrome.cookies.Cookie[]> {
  return new Promise((resolve, reject) => {
    chrome.cookies.getAll(details, (cookies) => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      resolve(cookies || []);
    });
  });
}

/**
 * Promisified chrome.scripting.executeScript
 */
export function executeScript(injection: any): Promise<chrome.scripting.InjectionResult[]> {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript(injection, (results) => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      resolve(results || []);
    });
  });
}
