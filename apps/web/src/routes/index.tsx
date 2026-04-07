import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"

type Problem = {
  _id: string
  slug: string
  title: string
  description: string
  starterCode: string
  limits: {
    timeoutMs: number
    memoryLimitMb: number
    maxOutputBytes: number
  }
  testCases: Array<{
    id: string
    input: string
    expectedOutput: string | null
    isHidden: boolean
  }>
}

type Submission = {
  _id: string
  status: "queued" | "running" | "completed" | "failed"
  verdict?: string
  errorMessage?: string
  totalDurationMs?: number
  caseResults: Array<{
    testCaseId: string
    verdict: string
    actualOutput: string
    expectedOutput: string | null
    stderr: string
    durationMs: number
    isHidden: boolean
  }>
}

type PreviewResult = {
  verdict: "ok" | "runtime_error" | "timeout" | "sandbox_violation"
  stdout: string
  stderr: string
  durationMs: number
}

const DEMO_PROBLEM_SLUG = "sum-two-integers"
const BACKEND_BASE_URL = import.meta.env.VITE_BACKEND_URL ?? "http://localhost:8787"

export const Route = createFileRoute("/")({ component: App })

function App() {
  const [problem, setProblem] = useState<Problem | null>(null)
  const [code, setCode] = useState("")
  const [userId, setUserId] = useState("demo-student")
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [previewInput, setPreviewInput] = useState("2 3\n")
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isSeedingProblem, setIsSeedingProblem] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const canSubmit = useMemo(
    () => Boolean(problem && userId.trim() && code.trim()) && !isSubmitting,
    [problem, userId, code, isSubmitting],
  )

  const canPreview = useMemo(
    () => Boolean(problem && code.trim()) && !isPreviewing,
    [problem, code, isPreviewing],
  )

  const loadProblem = async () => {
    setErrorMessage(null)
    const response = await fetch(
      `${BACKEND_BASE_URL}/api/problems/${DEMO_PROBLEM_SLUG}`,
    )

    if (response.status === 404) {
      setProblem(null)
      return
    }

    if (!response.ok) {
      throw new Error(await response.text())
    }

    setProblem((await response.json()) as Problem)
  }

  useEffect(() => {
    loadProblem().catch((error: unknown) => {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load problem",
      )
    })
  }, [])

  useEffect(() => {
    if (problem && !code) {
      setCode(problem.starterCode)
    }
  }, [problem, code])

  useEffect(() => {
    if (!submissionId) {
      return
    }

    let disposed = false
    let interval = 0

    const pollSubmission = async () => {
      const response = await fetch(
        `${BACKEND_BASE_URL}/api/submissions/${submissionId}`,
      )

      if (!response.ok) {
        throw new Error(await response.text())
      }

      const latest = (await response.json()) as Submission
      if (!disposed) {
        setSubmission(latest)
      }

      if (latest.status === "completed" || latest.status === "failed") {
        window.clearInterval(interval)
      }
    }

    interval = window.setInterval(() => {
      pollSubmission().catch((error: unknown) => {
        if (!disposed) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Failed to fetch submission status",
          )
        }
      })
    }, 1000)

    pollSubmission().catch((error: unknown) => {
      if (!disposed) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to fetch submission status",
        )
      }
    })

    return () => {
      disposed = true
      window.clearInterval(interval)
    }
  }, [submissionId])

  const seedProblem = async () => {
    setIsSeedingProblem(true)
    setErrorMessage(null)

    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/problems/seed`, {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      await loadProblem()
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to seed problem",
      )
    } finally {
      setIsSeedingProblem(false)
    }
  }

  const previewCode = async () => {
    if (!problem) {
      return
    }

    setIsPreviewing(true)
    setErrorMessage(null)

    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/preview/python`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          problemSlug: problem.slug,
          code,
          input: previewInput,
        }),
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      setPreviewResult((await response.json()) as PreviewResult)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Preview failed")
    } finally {
      setIsPreviewing(false)
    }
  }

  const submitCode = async () => {
    if (!problem) {
      return
    }

    setIsSubmitting(true)
    setErrorMessage(null)

    try {
      const response = await fetch(`${BACKEND_BASE_URL}/api/submissions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          problemSlug: problem.slug,
          userId,
          code,
        }),
      })

      if (!response.ok) {
        throw new Error(await response.text())
      }

      const payload = (await response.json()) as { submissionId: string }
      setSubmissionId(payload.submissionId)
      setSubmission(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Submission failed")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-5xl flex-col gap-4 p-6 text-sm">
      {errorMessage ? (
        <div className="rounded-md border border-red-400/60 bg-red-50 p-3 text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {!problem ? (
        <div className="rounded-md border p-4">
          <p>Demo problem not found in Convex.</p>
          <Button className="mt-3" onClick={seedProblem} disabled={isSeedingProblem}>
            {isSeedingProblem ? "Seeding..." : "Seed demo problem"}
          </Button>
        </div>
      ) : (
        <>
          <div className="rounded-md border p-4">
            <h2 className="font-medium">{problem.title}</h2>
            <p className="mt-1 text-muted-foreground">{problem.description}</p>
            <div className="mt-2 text-xs text-muted-foreground">
              timeout {problem.limits.timeoutMs}ms · memory {problem.limits.memoryLimitMb}MB
            </div>
          </div>

          <label className="flex flex-col gap-2">
            <span className="font-medium">User ID (for rate limiting)</span>
            <Input value={userId} onChange={(event) => setUserId(event.target.value)} />
          </label>

          <label className="flex flex-col gap-2">
            <span className="font-medium">Python submission</span>
            <Textarea
              value={code}
              onChange={(event) => setCode(event.target.value)}
              className="min-h-[260px] font-mono text-xs"
            />
          </label>

          <div className="rounded-md border p-4">
            <h3 className="font-medium">Preview (custom stdin)</h3>
            <label className="mt-2 flex flex-col gap-2">
              <span className="text-xs text-muted-foreground">Input sent to stdin</span>
              <Textarea
                value={previewInput}
                onChange={(event) => setPreviewInput(event.target.value)}
                className="min-h-24 font-mono text-xs"
              />
            </label>
            <Button className="mt-3" onClick={previewCode} disabled={!canPreview}>
              {isPreviewing ? "Running preview..." : "Run preview"}
            </Button>

            {previewResult ? (
              <div className="mt-3 space-y-2 text-xs">
                <div>
                  verdict: <strong>{previewResult.verdict}</strong> · duration: {previewResult.durationMs}ms
                </div>
                <div>
                  <div className="font-medium">stdout</div>
                  <pre className="rounded border bg-muted/20 p-2 whitespace-pre-wrap">
                    {previewResult.stdout || "(empty)"}
                  </pre>
                </div>
                <div>
                  <div className="font-medium">stderr</div>
                  <pre className="rounded border bg-muted/20 p-2 whitespace-pre-wrap text-red-700">
                    {previewResult.stderr || "(empty)"}
                  </pre>
                </div>
              </div>
            ) : null}
          </div>

          <Button onClick={submitCode} disabled={!canSubmit}>
            {isSubmitting ? "Submitting..." : "Run submission"}
          </Button>

          <div className="rounded-md border p-4">
            <h3 className="font-medium">Sample test cases</h3>
            <div className="mt-2 space-y-2 text-xs">
              {problem.testCases.map((testCase) => (
                <div key={testCase.id} className="rounded border p-2">
                  <div className="font-mono">{testCase.id}</div>
                  <div>input: {JSON.stringify(testCase.input)}</div>
                  <div>
                    expected: {testCase.isHidden ? "(hidden)" : JSON.stringify(testCase.expectedOutput)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md border p-4">
            <h3 className="font-medium">Latest submission</h3>
            {!submissionId ? (
              <p className="mt-2 text-muted-foreground">No submission yet.</p>
            ) : !submission ? (
              <p className="mt-2 text-muted-foreground">Loading submission...</p>
            ) : (
              <div className="mt-2 space-y-2 text-xs">
                <div className="font-mono">submission: {submission._id}</div>
                <div>
                  status: <strong>{submission.status}</strong>
                  {submission.verdict ? ` · verdict: ${submission.verdict}` : ""}
                  {submission.totalDurationMs
                    ? ` · duration: ${submission.totalDurationMs}ms`
                    : ""}
                </div>
                {submission.errorMessage ? (
                  <div className="rounded border border-red-400/60 bg-red-50 p-2 text-red-700">
                    {submission.errorMessage}
                  </div>
                ) : null}
                <div className="space-y-1">
                  {submission.caseResults.map((result) => (
                    <div key={result.testCaseId} className="rounded border p-2">
                      <div>
                        {result.testCaseId} {result.isHidden ? "(hidden)" : ""} · {result.verdict} · {" "}
                        {result.durationMs}ms
                      </div>
                      {result.stderr ? (
                        <pre className="mt-1 whitespace-pre-wrap text-red-700">{result.stderr}</pre>
                      ) : null}
                      <div>actual: {JSON.stringify(result.actualOutput)}</div>
                      {!result.isHidden ? (
                        <div>expected: {JSON.stringify(result.expectedOutput)}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
