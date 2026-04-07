import { createEnv } from "@t3-oss/env-core";
import * as z from "zod";

export const env = createEnv({
  server: {
    CONVEX_URL: z.string(),
    CONVEX_DEPLOY_KEY: z.string(),
    RUNNER_INTERNAL_TOKEN: z.string().default("dev-runner-token"),
    PORT: z.coerce.number().default(8787),
  },
  runtimeEnv: {
    CONVEX_URL: process.env.CONVEX_URL,
    CONVEX_DEPLOY_KEY: process.env.CONVEX_DEPLOY_KEY,
    RUNNER_INTERNAL_TOKEN: process.env.RUNNER_INTERNAL_TOKEN,
    PORT: process.env.PORT,
  },
  emptyStringAsUndefined: true,
});

export type Env = typeof env; 