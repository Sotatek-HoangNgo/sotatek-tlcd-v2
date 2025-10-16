import { ITimekeepingRecord } from '@/@types/attendance';
import { IMessage } from '@/@types/mics';
import {
  LOG_PREFIX,
  STORAGE_KEYS,
  TIMEZONE_OFFSET_HOURS,
  WORKING_HOURS_DURATION,
  WORKING_MINUTES_DURATION,
} from '@/constants/config';
import { storageGet } from '@/utils/extension-helpers';
import logger from '@/utils/logger';
import * as utils from '@/utils/time';

interface IProps {
  onNoCheckingData: (isCheckedIn: boolean) => void;
  onCountdownEnd: () => void;
}

type TWorkingInfo = {
  checkIn: string;
  timeLeft: string;
};

export function useCountdownTimeLeft({ onNoCheckingData, onCountdownEnd }: IProps) {
  let countdownIntervalId: ReturnType<typeof setInterval> | undefined = undefined;

  const attendanceMessage = ref<IMessage>({
    type: 'info',
    message: '',
  });

  const workInfo = ref<TWorkingInfo>({
    checkIn: '--:--:--',
    timeLeft: '--:--:--',
  });

  const todayCheckinData = ref<ITimekeepingRecord | undefined>();

  async function getUserAttendanceInfo() {
    const { [STORAGE_KEYS.EMPLOYEE_DATA]: employeeData } = await storageGet(STORAGE_KEYS.EMPLOYEE_DATA);
    const checkinData = employeeData?.result?.records[0];

    todayCheckinData.value = checkinData;

    if (!checkinData?.check_in) {
      logger.log(LOG_PREFIX, 'No checkin data');
      return onNoCheckingData(!checkinData);
    }

    const checkInTime = utils.stringToTime(checkinData.check_in.split(' ')[1]);
    checkInTime.setHours(checkInTime.getHours() + TIMEZONE_OFFSET_HOURS);
    const checkInText = utils.dateToString(checkInTime);
    const normalizedCheckIn = utils.normalizeTime(checkInTime); // Uses the specific utils.normalizeTime
    const timeOff = calculateExpectedTimeOff(normalizedCheckIn);
    const currentTimestamp = Date.now();

    if (timeOff.getTime() <= currentTimestamp) {
      return onCountdownEnd();
    }
    const workingTimeLeft = timeOff.getTime() - currentTimestamp;

    workInfo.value = {
      checkIn: checkInText,
      timeLeft: utils.convertMsToTime(workingTimeLeft),
    };

    if (checkInTime.getHours() >= 12 && checkInTime.getHours() < 17) {
      attendanceMessage.value = {
        type: 'info',
        message: 'Afternoon check-in: Time-off calculation adjusted.',
      };
    }

    startCountdown(timeOff);
  }

  function calculateExpectedTimeOff(normalizedCheckIn: Date) {
    const timeOff = new Date(normalizedCheckIn.getTime());

    timeOff.setHours(timeOff.getHours() + WORKING_HOURS_DURATION);
    timeOff.setMinutes(timeOff.getMinutes() + WORKING_MINUTES_DURATION);

    return utils.normalizeTime(timeOff); // Apply defined normalization rules
  }

  function startCountdown(targetEndTime: Date) {
    countdownIntervalId && clearInterval(countdownIntervalId);

    countdownIntervalId = setInterval(() => {
      const timeLeft = targetEndTime.getTime() - Date.now();

      if (timeLeft <= 0) {
        onCountdownEnd();
        if (countdownIntervalId) {
          clearInterval(countdownIntervalId);
          countdownIntervalId = undefined;
        }

        return;
      }

      workInfo.value.timeLeft = utils.convertMsToTime(timeLeft);
    }, 1000);
  }

  return {
    workInfo,
    todayCheckinData,
    message: attendanceMessage,
    getUserAttendanceInfo,
  };
}
