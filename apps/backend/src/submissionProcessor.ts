import { Effect } from "effect"
import type { PythonExecutionRequest } from "@procto/submission-core"
import type { ConvexApiClient } from "./convexClient"
import { runPythonExecution } from "./pythonRunner"

type RunnerPayload = {
  submission: {
    code: string
  }
  problem: {
    testCases: PythonExecutionRequest["testCases"]
    limits: PythonExecutionRequest["limits"]
  }
}

export async function processSubmission(
  convex: ConvexApiClient,
  submissionId: string,
): Promise<void> {
  try {
    await convex.mutation("submissions:markSubmissionRunning", { submissionId })

    const payload = await convex.query<RunnerPayload | null>(
      "submissions:getRunnerPayload",
      {
        submissionId,
      },
    )

    if (!payload) {
      await convex.mutation("submissions:markSubmissionFailed", {
        submissionId,
        errorMessage: "Submission or problem no longer exists",
      })
      return
    }

    const executionResult = await Effect.runPromise(
      runPythonExecution({
        code: payload.submission.code,
        testCases: payload.problem.testCases,
        limits: payload.problem.limits,
      }),
    )

    await convex.mutation("submissions:markSubmissionFinished", {
      submissionId,
      verdict: executionResult.verdict,
      totalDurationMs: executionResult.totalDurationMs,
      caseResults: executionResult.caseResults.map((caseResult) => ({
        testCaseId: caseResult.testCaseId,
        verdict: caseResult.verdict,
        expectedOutput: caseResult.expectedOutput,
        actualOutput: caseResult.actualOutput,
        stderr: caseResult.stderr,
        durationMs: caseResult.durationMs,
        isHidden: caseResult.isHidden,
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown runner failure"

    try {
      await convex.mutation("submissions:markSubmissionFailed", {
        submissionId,
        errorMessage: message,
      })
    } catch (markError) {
      console.error("failed to mark submission as failed", markError)
    }
  }
}
