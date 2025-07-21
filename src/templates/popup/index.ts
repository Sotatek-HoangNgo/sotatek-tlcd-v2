import { createApp } from 'vue';
import PopupApp from '@/modules/popup/index.vue';

console.log('Popup script loaded');

const app = createApp(PopupApp);

app.mount('#app');
