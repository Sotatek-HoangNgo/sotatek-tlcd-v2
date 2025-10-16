declare const __DEV__: boolean;

declare global {
  const logger: {
    log: (...info: any[]) => void;
    error: (...info: any[]) => void;
    toggle: () => void;
    enable: () => void;
  };
}
