<template>
  <div class="tw:px-4 tw:py-2 tw:text-base">
    <h1 class="tw:mb-2 tw:text-center tw:text-base tw:font-bold">Sotatek TLCD</h1>

    <div
      v-if="!isLoggedIn"
      class="tw:rounded tw:border tw:border-solid tw:border-blue-500 tw:bg-blue-500/25 tw:px-1 tw:py-2 tw:text-center tw:text-base"
    >
      <p class="tw:mb-1">Portal login session expired!</p>
      <a
        href="https://portal.sotatek.com"
        target="_blank"
        rel="noopener noreferrer"
        class="tw:font-bold tw:text-green-400"
        >👉 Click here to access portal</a
      >
    </div>

    <div
      v-if="overrideMessage.message"
      class="tw:mb-2 tw:rounded tw:border tw:px-4 tw:py-1.5"
      :class="{
        'tw:border-red-400 tw:bg-red-100 tw:text-red-700': overrideMessage.type === 'error',
        'tw:border-blue-400 tw:bg-blue-100 tw:text-blue-700': overrideMessage.type === 'info',
      }"
      role="alert"
    >
      <p
        class="tw:font-bold"
        v-html="overrideMessage.message"
      ></p>
    </div>
    <div v-else>
      <div
        v-if="message.message"
        class="tw:mb-2 tw:rounded tw:border tw:border-solid tw:px-1 tw:py-0.5 tw:text-sm"
        :class="{
          'tw:border-yellow-400 tw:bg-yellow-300/75': message.type === 'info',
          'tw:border-red-500 tw:bg-red-500/50': message.type === 'error',
        }"
      >
        {{ message.message }}
      </div>
      <p class="tw:mb-1 tw:text-center tw:text-base tw:font-bold">Time left</p>
      <div class="tw:mb-2 tw:text-center tw:text-3xl tw:font-bold">
        {{ workInfo.timeLeft }}
      </div>

      <div class="tw:mb-1 tw:flex tw:justify-start tw:gap-2 tw:text-left tw:text-base">
        <p class="tw:font-bold">Check in at</p>
        <p>
          {{ workInfo.checkIn }}
        </p>
      </div>
    </div>

    <div class="tw:w-full">
      <div
        class="tw:px-1"
        :class="{
          'tw:bg-yellow-400/75': currentMonthFundUsed > 0,
          'tw:bg-green-400/75': currentMonthFundUsed === 0,
        }"
      >
        <span>Remain fund: </span>
        <span>{{ remainMonthlyLateFund }} mins</span>
      </div>

      <div class="tw:mt-1">
        <div
          v-if="workLackDates.length === 0"
          class="tw:px-1"
        >
          <span>Lacking work: </span>
          <span>{{ currentMonthLateMinutes }} mins</span>
        </div>
        <details v-else>
          <summary class="tw:px-1">
            <span>Lacking work: </span>
            <span>{{ currentMonthLateMinutes }} mins</span>
          </summary>
          <div class="tw:space-x-0.5 tw:py-1">
            <span
              v-for="workLack of workLackDates"
              class="tw:rounded tw:border tw:px-1 tw:py-0.5 tw:text-sm"
              :class="{
                'tw:border-black tw:bg-white tw:text-black': workLack.workLack === 0,
                'tw:border-yellow-500 tw:bg-yellow-500/25 tw:text-yellow-500':
                  workLack.workLack > 0 && workLack.minusFund > 0,
                'tw:border-red-500 tw:bg-red-500/25 tw:text-red-500': workLack.workLack > 0 && workLack.minusFund === 0,
              }"
              :title="workLack.dateLackInfo"
            >
              {{ workLack.date }}
            </span>
          </div>
        </details>
      </div>
    </div>

    <table class="tw:w-full tw:text-sm">
      <tbody>
        <tr>
          <td class="tw:px-1">
            <span>Remain leave: </span>
            <span>{{ yearLeaveData.remainLeave }} hours</span>
          </td>
          <td class="tw:px-1">
            <span>Last year remain leave: </span>
            <span>{{ yearLeaveData.lastYearLeaveRemain }} hours</span>
          </td>
        </tr>
        <tr>
          <td class="tw:px-1">
            <span>Remote: </span>
            <span>{{ yearLeaveData.remainRemoteFund }} hours</span>
          </td>
          <td class="tw:px-1">
            <span>Sick leave: </span>
            <span>{{ yearLeaveData.remainSickFund }} hours</span>
          </td>
        </tr>
      </tbody>
    </table>

    <div class="tw:mt-2 tw:text-xs">
      <div class="tw:mb-1 tw:w-full tw:px-5">
        <div class="tw:w-full tw:border-0 tw:border-t tw:border-solid tw:border-black"></div>
      </div>
      <div class="tw:mb-1 tw:flex tw:justify-between">
        <p><strong>Author: </strong> Ngô Việt Hoàng (Hoangzzzsss - Hz)</p>
      </div>
      <div class="tw:flex tw:justify-between">
        <p><strong>Mail ID: </strong> hoang.ngo</p>
        <p>Version: 2.0</p>
        <p>Github repo: <a href="https://github.com/Sotatek-HoangNgo/sotatek-tlcd-v2">Link</a></p>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { IMessage } from '@/@types/mics';
import useCalculateMonthlyLateness from '@/hooks/useCalculateMonthlyLateness';
import { useCountdownTimeLeft } from '@/hooks/useCountdownTimeLeft';
import useLoginStatus from '@/hooks/useLoginStatus';
import useYearLeaveData from '@/hooks/useYearLeaveData';
import { fetchGoHomeMessageText } from '@/utils/mics';
import { ref } from 'vue';
import _once from 'lodash/once';
import useBrigdeMessaging from './hooks/useBrigdeMessaging';

const overrideMessage = ref<IMessage>({
  message: '',
  type: 'info',
});

const { yearLeaveData, retrieveYearLeaveData } = useYearLeaveData();
const { retrieveLoginStatus, isLoggedIn } = useLoginStatus();
const {
  calculateCurrentMonthLateTime,
  lackingWorkMinutes: currentMonthLateMinutes,
  remainFund: remainMonthlyLateFund,
  fundUsed: currentMonthFundUsed,
  workLackDates,
} = useCalculateMonthlyLateness();
const { getUserAttendanceInfo, message, workInfo } = useCountdownTimeLeft({
  onNoCheckingData: noTodayCheckinDataNotify,
  onCountdownEnd: displayGoHomeMessage,
});

const { registerRefreshCountdownListener, requestRefreshData } = useBrigdeMessaging();

function noTodayCheckinDataNotify(isCheckedIn: boolean) {
  overrideMessage.value = {
    message: isCheckedIn ? 'No user data found for today' : 'You have not checked in yet',
    type: 'info',
  };
}

function showErrorMessageWhenFailedToGetLoginStatus() {
  overrideMessage.value = {
    message: 'Error loading login status. Check console.',
    type: 'error',
  };
}

async function displayGoHomeMessage() {
  overrideMessage.value = {
    message: await fetchGoHomeMessageText(),
    type: 'info',
  };
}

async function getAuthenStatusAndInitPopup() {
  let hasInitData = false;

  try {
    const isLoggedIn = await retrieveLoginStatus(showErrorMessageWhenFailedToGetLoginStatus);
    if (isLoggedIn) {
      await Promise.allSettled([getUserAttendanceInfo(), calculateCurrentMonthLateTime(), retrieveYearLeaveData()]);

      hasInitData = true;
    }
  } catch (error) {
    console.log('POPUP', 'Error while get authen status: ', error);
  }

  return hasInitData;
}

onMounted(() => {
  getAuthenStatusAndInitPopup().then((isLatestLoginSession) => {
    if (!isLatestLoginSession) {
      requestRefreshData();
    }
  });
  registerRefreshCountdownListener(getAuthenStatusAndInitPopup);
});
</script>
