import { createStore } from 'vuex';
import user from './modules/user';
import rules from './modules/rules';
import traffic from './modules/traffic';
import gost from './modules/gost';

export default createStore({
  modules: {
    user,
    rules,
    traffic,
    gost
  }
});
