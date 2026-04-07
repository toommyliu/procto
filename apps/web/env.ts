import { createEnv } from "@t3-oss/env-core";
import * as z from "zod";

export const env = createEnv({
  client: {
    VITE_BACKEND_URL: z.string(),
  },
  clientPrefix: "VITE_",
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

export type Env = typeof env; 