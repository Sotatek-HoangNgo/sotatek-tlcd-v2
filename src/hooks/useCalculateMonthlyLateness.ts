import { IOverviewAttendanceData, ITimekeepingRecord } from '@/@types/attendance';
import { LOG_PREFIX, MONTHLY_LATE_ALLOWANCE_MINUTES, STORAGE_KEYS } from '@/constants/config';
import { storageGet } from '@/utils/extension-helpers';
import { extractCurrentMonthFundData } from '@/utils/extract-attendance-data';

interface ILateDates {
  date: string;
  lateAmount: number;
  minusFund: number;
  workLack: number;
  dateLackInfo: string;
  time: number;
}

export default function useCalculateMonthlyLateness() {
  const remainMonthlyLateFund = ref(0);
  const currentMonthLateMinutes = ref(0);
  const currentMonthFundUsed = ref(0);
  const lateDates = ref<ILateDates[]>([]);

  async function calculateCurrentMonthLateTime() {
    const { [STORAGE_KEYS.EMPLOYEE_ATTENDANCE]: attendanceData } = await storageGet(STORAGE_KEYS.EMPLOYEE_ATTENDANCE);
    const records = (attendanceData?.result?.records as IOverviewAttendanceData[]) ?? [];
    const extractedMonthlyData = extractCurrentMonthFundData(records);
    const cannotExtractMonthlyData = extractedMonthlyData.remainFund < 0;

    lateDates.value = await getLateDatesInCurrentMonth();
    console.log(LOG_PREFIX, 'Calculated monthly lateness getLateDatesInCurrentMonth:', lateDates.value);

    if (!records?.length || cannotExtractMonthlyData) {
      return manualCalculateMonthLatest();
    }

    remainMonthlyLateFund.value = extractedMonthlyData.remainFund;
    currentMonthLateMinutes.value = extractedMonthlyData.lackingWork;
    currentMonthFundUsed.value = extractedMonthlyData.fundUsed;
  }

  async function manualCalculateMonthLatest() {
    try {
      const { [STORAGE_KEYS.EMPLOYEE_MONTH_DATA]: monthData } = await storageGet(STORAGE_KEYS.EMPLOYEE_MONTH_DATA);

      const records = monthData?.result?.records as ITimekeepingRecord[];

      if (!records) {
        remainMonthlyLateFund.value = 0;
        currentMonthLateMinutes.value = 0;
        currentMonthFundUsed.value = 0;
        return;
      }

      let cumulatedUsedFund = 0;
      let cumulatedLackingWorks = 0;

      records.forEach((record) => {
        const recordDate = record.date_check ? new Date(record.date_check) : null;

        if (
          !record ||
          !recordDate ||
          record.is_weekend ||
          record.is_holiday ||
          Boolean(record.leave_ids?.length) ||
          !record.check_in
        ) {
          return;
        }

        if (record.late) {
          const usedFund = record.minus_fund;
          const lackWorks = record.work_lack;

          cumulatedUsedFund += usedFund ?? 0;
          cumulatedLackingWorks += lackWorks ?? 0;
        }
      });

      currentMonthFundUsed.value = Math.min(cumulatedUsedFund, MONTHLY_LATE_ALLOWANCE_MINUTES);
      remainMonthlyLateFund.value = Math.max(0, MONTHLY_LATE_ALLOWANCE_MINUTES - cumulatedUsedFund);
      currentMonthLateMinutes.value = cumulatedLackingWorks;
      console.log(LOG_PREFIX, 'Calculated monthly lateness:', remainMonthlyLateFund.value, 'mins');
    } catch (error) {
      console.error(LOG_PREFIX, 'Error calculating monthly lateness:', error);
      remainMonthlyLateFund.value = 0; // Default on error
    }
  }

  async function getLateDatesInCurrentMonth() {
    try {
      const { [STORAGE_KEYS.EMPLOYEE_MONTH_DATA]: monthData } = await storageGet(STORAGE_KEYS.EMPLOYEE_MONTH_DATA);
      const records = monthData?.result?.records as ITimekeepingRecord[];

      if (!records?.length) {
        return [];
      }

      const lackingWorkDates: ILateDates[] = [];

      records.forEach((record) => {
        const recordDate = record.date_check ? new Date(record.date_check) : null;
        if (
          !record ||
          !recordDate ||
          record.is_weekend ||
          record.is_holiday ||
          Boolean(record.leave_ids?.length) ||
          !record.check_in
        ) {
          return;
        }

        const lateAmount = (record.minus_fund ?? 0) + (record.work_lack ?? 0);

        if (lateAmount > 0) {
          const usedFund = record.minus_fund ?? 0;
          const workLack = record.work_lack ?? 0;
          let dateLackInfo = `Date ${recordDate.getDate() + 1}/${recordDate.getMonth() + 1}`;

          if (usedFund > 0) {
            dateLackInfo += ` used ${usedFund} mins fund,`;
          }

          if (workLack > 0) {
            dateLackInfo += ` lack ${workLack} mins work`;
          }

          lackingWorkDates.push({
            date: `${recordDate.getDate() + 1}/${recordDate.getMonth() + 1}`,
            lateAmount,
            minusFund: usedFund,
            workLack,
            dateLackInfo,
            time: recordDate.getTime(),
          });
        }
      });

      lackingWorkDates.sort((dateA, dateB) => dateA.time - dateB.time);

      return lackingWorkDates;
    } catch (error) {
      console.log('Error while retrieve lacking work dates');

      return [];
    }
  }

  return {
    remainFund: remainMonthlyLateFund,
    lackingWorkMinutes: currentMonthLateMinutes,
    calculateCurrentMonthLateTime,
    fundUsed: currentMonthFundUsed,
    workLackDates: lateDates,
  };
}
