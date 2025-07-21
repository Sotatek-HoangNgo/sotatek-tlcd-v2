<template>
  <div
    class="tw:box-border tw:block tw:w-full tw:py-1 tw:pr-3.5 tw:pl-5 tw:text-black tw:**:box-border"
    :class="UI_IDS.CONTAINER"
  >
    <div
      v-if="!isLoggedIn"
      class="tw:bg-blue-300 tw:px-1 tw:py-0.5"
    >
      <span class="">You're not logged in to portal</span>
      <a
        href="https://portal.sotatek.com"
        target="_blank"
        rel="noopener noreferrer"
        class="tw:ml-0.5 tw:text-green-600"
        >Login here</a
      >
    </div>
    <div v-else>
      <p
        v-if="latenessStatusMessage.message"
        class="tw:px-1 tw:py-0.5 tw:text-sm"
        :class="{
          'tw:bg-green-500': latenessStatusMessage.status === 'good',
          'tw:bg-red-500 tw:text-white': latenessStatusMessage.status === 'bad',
          'tw:bg-yellow-500': latenessStatusMessage.status === 'warning',
        }"
      >
        {{ latenessStatusMessage.message }}
      </p>

      <div>
        <div
          v-if="overrideMessage.message"
          :class="{
            'tw:bg-blue-300': overrideMessage.type === 'info',
            'tw:bg-red-500': overrideMessage.type === 'error',
          }"
          class="tw:px-1 tw:py-0.5 tw:text-sm"
          v-html="overrideMessage.message"
        ></div>

        <div
          v-else
          class="tw:w-full tw:rounded"
        >
          <div
            v-if="message.message"
            class="tw:px-1 tw:py-0.5 tw:text-sm"
            :class="{
              'tw:bg-blue-300': message.type === 'info',
              'tw:bg-red-500': message.type === 'error',
            }"
          >
            {{ message.message }}
          </div>

          <div class="tw:flex tw:border-0 tw:border-b tw:border-black">
            <div
              class="tw:w-28 tw:shrink-0 tw:grow-0 tw:basis-28 tw:border-0 tw:border-r tw:border-solid tw:border-black tw:bg-sky-400 tw:px-1.5"
            >
              Check in
            </div>
            <div class="tw:w-full tw:flex-auto tw:bg-white tw:px-1.5">{{ workInfo.checkIn }}</div>
          </div>
          <div class="tw:flex">
            <div
              class="tw:w-28 tw:shrink-0 tw:grow-0 tw:basis-28 tw:border-0 tw:border-r tw:border-solid tw:border-black tw:bg-sky-400 tw:px-1.5"
            >
              Time left
            </div>
            <div class="tw:w-full tw:flex-auto tw:bg-white tw:px-1.5">{{ workInfo.timeLeft }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { IMessage } from '@/@types/mics';
import { MONTHLY_LATE_ALLOWANCE_MINUTES, UI_IDS } from '@/constants/config';
import useCalculateMonthlyLateness from '@/hooks/useCalculateMonthlyLateness';
import { useCountdownTimeLeft } from '@/hooks/useCountdownTimeLeft';
import useLoginStatus from '@/hooks/useLoginStatus';
import { fetchGoHomeMessageText } from '@/utils/mics';

const { getUserAttendanceInfo, message, workInfo } = useCountdownTimeLeft({
  onNoCheckingData: noTodayCheckinDataNotify,
  onCountdownEnd: displayGoHomeMessage,
});

const {
  calculateCurrentMonthLateTime,
  lackingWorkMinutes: currentMonthLateMinutes,
  remainFund: remainMonthlyLateFund,
} = useCalculateMonthlyLateness();

const { retrieveLoginStatus, isLoggedIn } = useLoginStatus();

const overrideMessage = ref<IMessage>({
  message: '',
  type: 'info',
});

const latenessStatusMessage = computed<{
  status: 'good' | 'bad' | 'warning';
  message: string;
}>(() => {
  const isWarningStatus = remainMonthlyLateFund.value > 0;
  const hasLackingWork = currentMonthLateMinutes.value > 0;

  if (remainMonthlyLateFund.value === MONTHLY_LATE_ALLOWANCE_MINUTES) {
    return {
      status: 'good',
      message: `Remain fund: ${MONTHLY_LATE_ALLOWANCE_MINUTES} mins`,
    };
  }

  if (isWarningStatus) {
    if (hasLackingWork) {
      return {
        status: 'warning',
        message: `Remain allowances: ${remainMonthlyLateFund.value} mins`,
      };
    }

    return {
      status: 'good',
      message: `Remain allowances: ${remainMonthlyLateFund.value} mins`,
    };
  }

  return {
    status: 'bad',
    message: `Oops! ${currentMonthLateMinutes.value} mins late this month.`,
  };
});

function showErrorMessageWhenFailedToGetLoginStatus() {
  overrideMessage.value = {
    message: 'Error loading login status. Check console.',
    type: 'error',
  };
}

function noTodayCheckinDataNotify(isCheckedIn: boolean) {
  overrideMessage.value = {
    message: isCheckedIn ? 'No user data found for today' : 'You have not checked in yet',
    type: 'info',
  };
}

async function displayGoHomeMessage() {
  overrideMessage.value = {
    message: await fetchGoHomeMessageText(),
    type: 'info',
  };
}

onMounted(async () => {
  try {
    const isLoggedIn = await retrieveLoginStatus(showErrorMessageWhenFailedToGetLoginStatus);
    if (isLoggedIn) {
      await Promise.allSettled([calculateCurrentMonthLateTime(), getUserAttendanceInfo()]);
    }
  } catch (error) {
    console.log('Encoutered while get data: ', error);
  }
});
</script>
