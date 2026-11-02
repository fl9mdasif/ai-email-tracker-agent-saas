import { serve } from "inngest/next";
import { inngest } from "@/core/jobs/client";
import { emailTrackerJobs } from "@/modules/email-tracker/jobs/sync";

// Inngest calls this route to run background jobs (mail sync). A sync can take a while.
export const maxDuration = 60;

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [...emailTrackerJobs],
});
