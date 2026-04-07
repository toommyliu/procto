const REQUIRED_ENV_VARS = ["CONVEX_URL", "CONVEX_DEPLOY_KEY"] as const

export type BackendEnv = {
  convexUrl: string
  convexDeployKey: string
  runnerInternalToken: string
  port: number
}

export function loadEnv(): BackendEnv {
  for (const envVar of REQUIRED_ENV_VARS) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required env var: ${envVar}`)
    }
  }

  const port = Number(process.env.PORT ?? "8787")
  if (Number.isNaN(port)) {
    throw new Error("PORT must be a number")
  }

  return {
    convexUrl: process.env.CONVEX_URL!,
    convexDeployKey: process.env.CONVEX_DEPLOY_KEY!,
    runnerInternalToken: process.env.RUNNER_INTERNAL_TOKEN ?? "dev-runner-token",
    port,
  }
}
