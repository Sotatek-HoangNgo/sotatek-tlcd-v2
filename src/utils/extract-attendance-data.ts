import { IOverviewAttendanceData } from '@/@types/attendance';

/**
 * Extract current month remain fund data in minutes
 * @param attendanceData - Array of attendance data containing fund information
 * @returns Object containing remain fund, fund used, and lacking work in minutes
 */
export function extractCurrentMonthFundData(attendanceData: IOverviewAttendanceData[]) {
  const currentMonthRemainFundData = attendanceData.find((item) => item.operation === 'total_remain_fund');
  const currentMonthFundUsedData = attendanceData.find((item) => item.operation === 'total_minus_fund');
  const currentMonthLackingWorkData = attendanceData.find((item) => item.operation === 'total_work_lack');

  const currentMonthRemainFund = currentMonthRemainFundData?.amount ?? -1;
  const currentMonthFundUsed = currentMonthFundUsedData?.amount ?? -1;
  const currentMonthLackingWork = currentMonthLackingWorkData?.amount ?? -1;

  return {
    remainFund: currentMonthRemainFund,
    fundUsed: currentMonthFundUsed,
    lackingWork: currentMonthLackingWork,
  };
}

/**
 * Extract current year leave data in hours
 * @param attendanceData - Array of attendance data containing leave information
 * @returns Object containing current year leave remain, last year leave remain, remote leave, and sick leave in hours
 */
export function extractCurrentYearLeaveData(attendanceData: IOverviewAttendanceData[]) {
  const currentMonth = new Date().getMonth();
  const isIn1stQuarter = currentMonth >= 0 && currentMonth <= 2;
  const remainLeaveData = attendanceData.find((item) => item.operation === 'leave_remain');
  const remainLeaves = ((remainLeaveData?.time_display as string) || '')?.split('\n') ?? [];

  const thisYearLeaveRemain =
    parseFloat(
      remainLeaves
        .find((item) => item.includes('Annual leave this year'))
        ?.slice('Annual leave this year:'.length)
        ?.trim() ?? '0',
    ) || 0;

  const lastYearLeaveRemain =
    parseFloat(
      remainLeaves
        .find((item) => item.includes('Annual leave last year'))
        ?.slice('Annual leave last year:'.length)
        ?.trim() ?? '0',
    ) || 0;

  const remainRemoteLeave =
    parseFloat(
      remainLeaves
        .find((item) => item.includes('Remote'))
        ?.slice('Remote:'.length)
        ?.trim() ?? '0',
    ) || 0;

  const remainSickLeave =
    parseFloat(
      remainLeaves
        .find((item) => item.includes('Sick leave'))
        ?.slice('Sick leave:'.length)
        ?.trim() ?? '0',
    ) || 0;

  return {
    currentYearRemainLeave: thisYearLeaveRemain,
    lastYearLeaveRemain: isIn1stQuarter ? lastYearLeaveRemain : 0,
    remainRemoteLeave,
    remainSickLeave,
  };
}
