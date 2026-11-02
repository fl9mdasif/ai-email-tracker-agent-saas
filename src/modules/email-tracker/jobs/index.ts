import { analyzeTenantJob } from "./analyze";
import { syncJobs } from "./sync";

/** Every background job of this module; registered with Inngest in the /api/inngest route. */
export const emailTrackerJobs = [...syncJobs, analyzeTenantJob];
