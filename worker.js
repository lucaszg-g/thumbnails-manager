import { handleAPI } from './backend/api.js';
export default {
  async fetch(request, env) {
    return (await handleAPI(request, env)) || env.ASSETS.fetch(request);
  },
};
