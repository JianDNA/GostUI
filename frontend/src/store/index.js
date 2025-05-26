import { createStore } from 'vuex';
import user from './modules/user';
import rules from './modules/rules';
import traffic from './modules/traffic';

export default createStore({
  modules: {
    user,
    rules,
    traffic
  }
});
