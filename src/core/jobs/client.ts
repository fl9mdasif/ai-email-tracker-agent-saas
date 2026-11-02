import { Inngest } from "inngest";
import { getConfig } from "@/core/config";

const config = getConfig();

/**
 * The one Inngest client for the whole platform. Modules register their own functions on it.
 * Keys come from the config helper and are optional in development, where the Inngest dev
 * server (`npm run inngest:dev`) needs none.
 */
export const inngest = new Inngest({
  id: "loopify",
  isDev: config.NODE_ENV !== "production",
  eventKey: config.INNGEST_EVENT_KEY,
  signingKey: config.INNGEST_SIGNING_KEY,
});
