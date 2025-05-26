import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/dist/locale/zh-cn.mjs';
import 'element-plus/dist/index.css';
import App from './App.vue';
import router from './router';
import store from './store';

const app = createApp(App);

app.use(ElementPlus, {
  locale: zhCn,
});

// 先初始化 store，这样路由守卫可以正确访问 store 状态
app.use(store);

// 然后初始化路由
app.use(router);

app.mount('#app');
