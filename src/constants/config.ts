// src/constants.js
export const PORTAL_DOMAIN = 'portal.sotatek.com';
export const GOOGLE_CHAT_HOST = 'chat.google.com';
export const GOOGLE_MAIL_CHAT_URL = 'https://mail.google.com/chat';
export const GOOGLE_CHAT_FULL_SCREEN_FRAME_ID = 'id=single_full_screen';
export const LOG_PREFIX = 'Sotatek TLCD Injector:';

export const STORAGE_KEYS = {
  EMPLOYEE_DATA: 'employee_data',
  EMPLOYEE_MONTH_DATA: 'employee_month_data',
  LOGIN_PORTAL_STATUS: 'login_portal_status',
  SOTATEK_EMAIL: 'sotatek_email',
  GO_HOME_MESSAGE: 'go_home_message',
  EMPLOYEE_ATTENDANCE: 'employee_attendance',
} as const;

export const LOGIN_STATUS = {
  NO_COOKIE: 'no_cookie',
  SESSION_EXPIRED: 'session_expired',
  SESSION_UP: 'session_up',
  UNKNOWN: 'unknown',
} as const;

export const COMMUNICATION_MESSAGE_KEYS = {
  INIT_CONNECTION: 'init_connection',
  REFRESH_COUNTDOWN: 'refresh_countdown',
  RESET_PORTAL_DATA: 'reset_portal_data',
  SETUP_INJECTOR: 'setup_injector',
} as const;

// Constants for UI elements and classes (will be used in refactored version)
export const UI_IDS = {
  CONTAINER: 'tlcd',
  COLLAPSED_CONTAINER: 'tlcd-collapsed',
  TIME_LEFT_ELEMENT: 'timeLeft',
  MESSAGE_ELEMENT: 'tlcd_message',
  APP_CONTAINER: 'sotatek-tlcd',
};

// Class names for Google Chat UI (these are fragile and might change)
export const GCHAT_INJECT_TARGET_SELECTOR = {
  LEFT_PANEL_CONTAINER: '.oy8Mbf:not(.bGI)',
  IFRAME_LEFT_PANEL: '.SuElue',
};

// Other constants
export const TIMEZONE_OFFSET_HOURS = 7; // For converting UTC check-in to local time
export const LATEST_ON_TIME_MORNING_HOUR = 9;
export const MAX_LATE_MINUTES_PER_INSTANCE = 60;
export const MONTHLY_LATE_ALLOWANCE_MINUTES = 90;
export const WORKING_HOURS_DURATION = 9; // Total hours from normalized check-in
export const WORKING_MINUTES_DURATION = 30; // Additional minutes
