import BackgroundService from '@/services/BackgroundService';

const backgroundService = BackgroundService.setup();

// @ts-ignore
globalThis.service = backgroundService;
