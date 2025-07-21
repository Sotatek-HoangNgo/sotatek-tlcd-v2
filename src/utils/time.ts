// src/utils/time.ts

export const stringToTime = (timeString: string): Date => {
  const [hh, mm, ss] = timeString.split(':');
  const time = new Date();
  time.setHours(+hh);
  time.setMinutes(+mm);
  time.setSeconds(+ss);
  return time;
};

export const normalizeTime = (time: Date): Date => {
  const normalizeTime = new Date();
  if (time.getHours() < 8) {
    normalizeTime.setHours(8);
    normalizeTime.setMinutes(0);
    normalizeTime.setSeconds(0);
    return normalizeTime;
  }
  if (time.getHours() >= 9 && time.getHours() < 12) {
    normalizeTime.setHours(9);
    normalizeTime.setMinutes(0);
    normalizeTime.setSeconds(0);
    return normalizeTime;
  }
  if (time.getHours() >= 12 && time.getHours() < 17) {
    normalizeTime.setHours(8);
    normalizeTime.setMinutes(30);
    normalizeTime.setSeconds(0);
    return normalizeTime;
  }
  if ((time.getHours() === 18 && time.getMinutes() > 30) || time.getHours() > 18) {
    normalizeTime.setHours(18);
    normalizeTime.setMinutes(30);
    normalizeTime.setSeconds(0);
    return normalizeTime;
  }
  return time;
};

export const dateToString = (time: Date): string => {
  const hour = String(time.getHours()).padStart(2, '0');
  const minute = String(time.getMinutes()).padStart(2, '0');
  const second = String(time.getSeconds()).padStart(2, '0');
  return `${hour}:${minute}:${second}`;
};

const padTo2Digits = (num: number): string => {
  return num.toString().padStart(2, '0');
};

export const convertMsToTime = (milliseconds: number): string => {
  let seconds = Math.floor(milliseconds / 1000);
  let minutes = Math.floor(seconds / 60);
  let hours = Math.floor(minutes / 60);
  seconds = seconds % 60;
  minutes = minutes % 60;
  hours = hours % 24;
  return `${padTo2Digits(hours)}:${padTo2Digits(minutes)}:${padTo2Digits(seconds)}`;
};

export const formatDate = (date: Date): string => {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0'); // Month is 0-indexed
  const yyyy = date.getFullYear();
  return `${yyyy}-${mm}-${dd}`;
};

export const getCurrentFormattedDate = (addDays: number = 0): string => {
  const currentDate = new Date();
  if (addDays) {
    currentDate.setDate(currentDate.getDate() + addDays);
  }
  return formatDate(currentDate);
};

export const getFormattedMonthRange = (): { firstDay: string; lastDay: string } => {
  const date = new Date();
  const firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { firstDay: formatDate(firstDay), lastDay: formatDate(lastDay) };
};
