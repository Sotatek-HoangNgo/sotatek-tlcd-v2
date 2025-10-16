let isEnableLog = import.meta.env.MODE === 'development';

function log(...info: any[]) {
  if (isEnableLog) {
    console.log(...info);
  }
}

function error(...info: any[]) {
  if (isEnableLog) {
    console.error(...info);
  }
}

function toggleLog() {
  isEnableLog = !isEnableLog;
}

function enable() {
  isEnableLog = true;
}

const logger = {
  log,
  error,
  toggle: toggleLog,
  enable,
};

globalThis.logger = logger;

export default logger;
