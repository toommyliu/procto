import { Schema } from "effect"

export const MAX_PYTHON_CODE_SIZE = 20_000

export const CaseVerdictSchema = Schema.Literals([
  "passed",
  "wrong_answer",
  "runtime_error",
  "timeout",
  "sandbox_violation",
])
export type CaseVerdict = Schema.Schema.Type<typeof CaseVerdictSchema>

export const SubmissionVerdictSchema = Schema.Literals([
  "accepted",
  "wrong_answer",
  "runtime_error",
  "timeout",
  "sandbox_violation",
  "system_error",
])
export type SubmissionVerdict = Schema.Schema.Type<typeof SubmissionVerdictSchema>

export const PythonTestCaseSchema = Schema.Struct({
  id: Schema.String,
  input: Schema.String,
  expectedOutput: Schema.String,
  isHidden: Schema.Boolean,
})
export type PythonTestCase = Schema.Schema.Type<typeof PythonTestCaseSchema>

export const ExecutionLimitsSchema = Schema.Struct({
  timeoutMs: Schema.Number,
  memoryLimitMb: Schema.Number,
  maxOutputBytes: Schema.Number,
})
export type ExecutionLimits = Schema.Schema.Type<typeof ExecutionLimitsSchema>

export const PythonExecutionRequestSchema = Schema.Struct({
  code: Schema.String,
  testCases: Schema.Array(PythonTestCaseSchema),
  limits: ExecutionLimitsSchema,
})
export type PythonExecutionRequest = Schema.Schema.Type<typeof PythonExecutionRequestSchema>

export const ExecutionCaseResultSchema = Schema.Struct({
  testCaseId: Schema.String,
  verdict: CaseVerdictSchema,
  expectedOutput: Schema.String,
  actualOutput: Schema.String,
  stderr: Schema.String,
  durationMs: Schema.Number,
  isHidden: Schema.Boolean,
})
export type ExecutionCaseResult = Schema.Schema.Type<typeof ExecutionCaseResultSchema>

export const PythonExecutionResponseSchema = Schema.Struct({
  verdict: SubmissionVerdictSchema,
  totalDurationMs: Schema.Number,
  caseResults: Schema.Array(ExecutionCaseResultSchema),
})
export type PythonExecutionResponse = Schema.Schema.Type<typeof PythonExecutionResponseSchema>

export const PublicExecutionCaseResultSchema = Schema.Struct({
  testCaseId: Schema.String,
  verdict: CaseVerdictSchema,
  actualOutput: Schema.String,
  stderr: Schema.String,
  durationMs: Schema.Number,
  isHidden: Schema.Boolean,
})
export type PublicExecutionCaseResult = Schema.Schema.Type<
  typeof PublicExecutionCaseResultSchema
>

export function normalizeOutput(output: string): string {
  return output
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trimEnd()
}

export function outputsMatch(expected: string, actual: string): boolean {
  return normalizeOutput(expected) === normalizeOutput(actual)
}

export function deriveSubmissionVerdict(
  caseResults: ReadonlyArray<ExecutionCaseResult>,
): SubmissionVerdict {
  if (caseResults.some((result) => result.verdict === "sandbox_violation")) {
    return "sandbox_violation"
  }
  if (caseResults.some((result) => result.verdict === "timeout")) {
    return "timeout"
  }
  if (caseResults.some((result) => result.verdict === "runtime_error")) {
    return "runtime_error"
  }
  if (caseResults.some((result) => result.verdict === "wrong_answer")) {
    return "wrong_answer"
  }
  return "accepted"
}
