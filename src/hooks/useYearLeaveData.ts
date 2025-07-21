import { IOverviewAttendanceData } from '@/@types/attendance';
import { STORAGE_KEYS } from '@/constants/config';
import { storageGet } from '@/utils/extension-helpers';
import { extractCurrentYearLeaveData } from '@/utils/extract-attendance-data';

export default function useYearLeaveData() {
  const yearLeaveData = ref({
    remainLeave: 0,
    lastYearLeaveRemain: 0,
    remainRemoteFund: 0,
    remainSickFund: 0,
  });

  async function retrieveYearLeaveData() {
    const { [STORAGE_KEYS.EMPLOYEE_ATTENDANCE]: attendanceData } = await storageGet(STORAGE_KEYS.EMPLOYEE_ATTENDANCE);
    const records = (attendanceData?.result?.records as IOverviewAttendanceData[]) ?? [];
    const leaveYearData = extractCurrentYearLeaveData(records);

    yearLeaveData.value = {
      lastYearLeaveRemain: leaveYearData.lastYearLeaveRemain,
      remainLeave: leaveYearData.currentYearRemainLeave,
      remainRemoteFund: leaveYearData.remainRemoteLeave,
      remainSickFund: leaveYearData.remainSickLeave,
    };
  }

  return {
    yearLeaveData,
    retrieveYearLeaveData,
  };
}
