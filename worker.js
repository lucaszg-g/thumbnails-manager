import { handleAPI } from './backend/api.js';
import { syncCalendar } from './backend/calendar.js';
import { syncIntegrations } from './backend/integrations.js';
export default {
  async fetch(request, env, ctx) {
    return (await handleAPI(request, env, ctx)) || env.ASSETS.fetch(request);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(syncCalendar(env));
    ctx.waitUntil(syncIntegrations(env));
  },
};
