import "dotenv/config"

import { serve } from "@hono/node-server"
import { Effect, Schema } from "effect"
import { Hono } from "hono"
import { cors } from "hono/cors"
import {
  MAX_PYTHON_CODE_SIZE,
  PythonExecutionRequestSchema,
} from "@procto/submission-core"
import { ConvexApiClient } from "./convexClient"
import { loadEnv } from "./env"
import { runPythonExecution, runPythonPreview } from "./pythonRunner"
import { processSubmission } from "./submissionProcessor"

const env = loadEnv()
const convex = new ConvexApiClient(env)

const app = new Hono()

app.onError((error, c) => {
  return c.json({ error: error.message }, 500)
})

app.use("*", cors())

app.get("/health", (c) => c.json({ ok: true }))

app.post("/api/problems/seed", async (c) => {
  const seeded = await convex.mutation<{ seeded: boolean; problemId: string }>(
    "problems:seedDemoProblem",
    {},
  )

  return c.json(seeded)
})

app.get("/api/problems/:slug", async (c) => {
  const slug = c.req.param("slug")
  const problem = await convex.query<unknown>("problems:getBySlug", { slug })

  if (!problem) {
    return c.json({ error: "Problem not found" }, 404)
  }

  return c.json(problem)
})

app.post("/api/preview/python", async (c) => {
  const body = await c.req.json<{
    problemSlug?: string
    code?: string
    input?: string
  }>()

  if (!body.problemSlug || body.code === undefined || body.input === undefined) {
    return c.json({ error: "problemSlug, code, and input are required" }, 400)
  }

  if (body.code.length > MAX_PYTHON_CODE_SIZE) {
    return c.json(
      { error: `Code exceeds ${MAX_PYTHON_CODE_SIZE} characters` },
      400,
    )
  }

  const problem = await convex.query<{
    limits: {
      timeoutMs: number
      memoryLimitMb: number
      maxOutputBytes: number
    }
  } | null>("problems:getBySlug", {
    slug: body.problemSlug,
  })

  if (!problem) {
    return c.json({ error: "Problem not found" }, 404)
  }

  try {
    const previewResult = await Effect.runPromise(
      runPythonPreview({
        code: body.code,
        input: body.input,
        limits: problem.limits,
      }),
    )

    return c.json(previewResult)
  } catch (error) {
    return c.json(
      {
        verdict: "runtime_error",
        stdout: "",
        stderr: error instanceof Error ? error.message : "preview execution failed",
        durationMs: 0,
      },
      500,
    )
  }
})

app.post("/api/submissions", async (c) => {
  const body = await c.req.json<{
    problemSlug?: string
    userId?: string
    code?: string
  }>()

  if (!body.problemSlug || !body.userId || !body.code) {
    return c.json(
      { error: "problemSlug, userId, and code are required" },
      400,
    )
  }

  if (body.code.length > MAX_PYTHON_CODE_SIZE) {
    return c.json(
      { error: `Code exceeds ${MAX_PYTHON_CODE_SIZE} characters` },
      400,
    )
  }

  try {
    const result = await convex.mutation<{ submissionId: string; status: string }>(
      "submissions:submitPython",
      {
        problemSlug: body.problemSlug,
        userId: body.userId,
        code: body.code,
      },
    )

    void processSubmission(convex, result.submissionId)

    return c.json(result, 202)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Submission failed"
    const status = message.toLowerCase().includes("rate limit") ? 429 : 400
    return c.json({ error: message }, status)
  }
})

app.get("/api/submissions/:submissionId", async (c) => {
  const submissionId = c.req.param("submissionId")

  const submission = await convex.query<unknown>("submissions:getSubmissionById", {
    submissionId,
  })

  if (!submission) {
    return c.json({ error: "Submission not found" }, 404)
  }

  return c.json(submission)
})

app.post("/internal/execute/python", async (c) => {
  const authHeader = c.req.header("authorization")
  const expectedHeader = `Bearer ${env.runnerInternalToken}`

  if (authHeader !== expectedHeader) {
    return c.json({ error: "unauthorized" }, 401)
  }

  const requestPayload = await c.req.json<unknown>()

  let decodedPayload: Schema.Schema.Type<typeof PythonExecutionRequestSchema>
  try {
    decodedPayload = Schema.decodeUnknownSync(PythonExecutionRequestSchema)(
      requestPayload,
    )
  } catch (error) {
    return c.json(
      {
        error: "invalid payload",
        details: error,
      },
      400,
    )
  }

  try {
    const executionResult = await Effect.runPromise(
      runPythonExecution(decodedPayload),
    )
    return c.json(executionResult)
  } catch (error) {
    return c.json(
      {
        verdict: "system_error",
        totalDurationMs: 0,
        caseResults: [],
        error:
          error instanceof Error ? error.message : "unknown execution error",
      },
      500,
    )
  }
})

serve(
  {
    fetch: app.fetch,
    port: env.port,
  },
  (info) => {
    console.log(`Backend server listening on http://localhost:${info.port}`)
  },
)
