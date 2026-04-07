import { spawn } from "node:child_process"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { deriveSubmissionVerdict, outputsMatch } from "@procto/submission-core"
import type {
  ExecutionCaseResult,
  ExecutionLimits,
  PythonExecutionRequest,
  PythonExecutionResponse,
  PythonTestCase,
} from "@procto/submission-core"

type RawCaseRunResult = {
  stdout: string
  stderr: string
  durationMs: number
  exitCode: number | null
  timedOut: boolean
  outputLimitExceeded: boolean
}

const SANDBOX_HARNESS = `
import builtins
import traceback

ALLOWED_MODULES = {
    "math",
    "itertools",
    "collections",
    "functools",
    "heapq",
    "bisect",
    "string",
    "re",
}

_ORIGINAL_IMPORT = builtins.__import__

def restricted_import(name, globals=None, locals=None, fromlist=(), level=0):
    root = name.split(".")[0]
    if root not in ALLOWED_MODULES:
        raise ImportError(f"SandboxViolation: import '{root}' is not allowed")
    return _ORIGINAL_IMPORT(name, globals, locals, fromlist, level)

SAFE_BUILTIN_NAMES = {
    "abs",
    "all",
    "any",
    "bool",
    "chr",
    "dict",
    "divmod",
    "enumerate",
    "filter",
    "float",
    "int",
    "input",
    "isinstance",
    "issubclass",
    "len",
    "list",
    "map",
    "max",
    "min",
    "pow",
    "print",
    "range",
    "reversed",
    "round",
    "set",
    "sorted",
    "str",
    "sum",
    "tuple",
    "zip",
    "Exception",
    "__build_class__",
    "object",
    "ValueError",
    "TypeError",
    "RuntimeError",
}

safe_builtins = {
    name: getattr(builtins, name)
    for name in SAFE_BUILTIN_NAMES
}
safe_builtins["__import__"] = restricted_import

with open("user.py", "r", encoding="utf-8") as f:
    source = f.read()

globals_obj = {
    "__name__": "__main__",
    "__builtins__": safe_builtins,
}

try:
    code = compile(source, "user.py", "exec")
    exec(code, globals_obj, None)
except BaseException:
    traceback.print_exc()
    raise SystemExit(1)
`

function toCaseResult(
  testCase: PythonTestCase,
  runResult: RawCaseRunResult,
): ExecutionCaseResult {
  const normalizedStdErr = runResult.stderr.trim()

  if (runResult.outputLimitExceeded) {
    return {
      testCaseId: testCase.id,
      verdict: "sandbox_violation",
      expectedOutput: testCase.expectedOutput,
      actualOutput: runResult.stdout,
      stderr: "SandboxViolation: maximum output exceeded",
      durationMs: runResult.durationMs,
      isHidden: testCase.isHidden,
    }
  }

  if (runResult.timedOut) {
    return {
      testCaseId: testCase.id,
      verdict: "timeout",
      expectedOutput: testCase.expectedOutput,
      actualOutput: runResult.stdout,
      stderr: normalizedStdErr,
      durationMs: runResult.durationMs,
      isHidden: testCase.isHidden,
    }
  }

  if (runResult.exitCode !== 0) {
    const verdict = normalizedStdErr.includes("SandboxViolation")
      ? "sandbox_violation"
      : "runtime_error"

    return {
      testCaseId: testCase.id,
      verdict,
      expectedOutput: testCase.expectedOutput,
      actualOutput: runResult.stdout,
      stderr: normalizedStdErr,
      durationMs: runResult.durationMs,
      isHidden: testCase.isHidden,
    }
  }

  if (outputsMatch(testCase.expectedOutput, runResult.stdout)) {
    return {
      testCaseId: testCase.id,
      verdict: "passed",
      expectedOutput: testCase.expectedOutput,
      actualOutput: runResult.stdout,
      stderr: normalizedStdErr,
      durationMs: runResult.durationMs,
      isHidden: testCase.isHidden,
    }
  }

  return {
    testCaseId: testCase.id,
    verdict: "wrong_answer",
    expectedOutput: testCase.expectedOutput,
    actualOutput: runResult.stdout,
    stderr: normalizedStdErr,
    durationMs: runResult.durationMs,
    isHidden: testCase.isHidden,
  }
}

async function runSingleCase(
  code: string,
  input: string,
  timeoutMs: number,
  maxOutputBytes: number,
  memoryLimitMb: number,
): Promise<RawCaseRunResult> {
  const sandboxDir = await mkdtemp(join(tmpdir(), "procto-python-"))
  const userFilePath = join(sandboxDir, "user.py")
  const harnessFilePath = join(sandboxDir, "harness.py")

  try {
    await writeFile(userFilePath, code, "utf8")
    await writeFile(harnessFilePath, SANDBOX_HARNESS, "utf8")

    const start = performance.now()
    const runCommand = `ulimit -v ${Math.floor(memoryLimitMb * 1024)} >/dev/null 2>&1 || true; exec python3 -I -S harness.py`

    const child = spawn("bash", ["-lc", runCommand], {
      cwd: sandboxDir,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
      },
    })

    let stdout = ""
    let stderr = ""
    let totalBytes = 0
    let timedOut = false
    let outputLimitExceeded = false

    const timeoutHandle = setTimeout(() => {
      timedOut = true
      child.kill("SIGKILL")
    }, timeoutMs)

    const appendChunk = (current: string, chunk: Buffer) => {
      if (outputLimitExceeded) {
        return current
      }

      totalBytes += chunk.byteLength
      if (totalBytes > maxOutputBytes) {
        outputLimitExceeded = true
        child.kill("SIGKILL")
        return current
      }

      return current + chunk.toString("utf8")
    }

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = appendChunk(stdout, chunk)
    })

    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendChunk(stderr, chunk)
    })

    child.stdin.write(input)
    child.stdin.end()

    const exitCode = await new Promise<number | null>((resolve) => {
      child.once("close", (codeFromProcess) => {
        clearTimeout(timeoutHandle)
        resolve(codeFromProcess)
      })
    })

    const durationMs = Math.round(performance.now() - start)

    return {
      stdout,
      stderr,
      durationMs,
      exitCode,
      timedOut,
      outputLimitExceeded,
    }
  } finally {
    await rm(sandboxDir, { recursive: true, force: true })
  }
}

export type PythonPreviewResponse = {
  verdict: "ok" | "runtime_error" | "timeout" | "sandbox_violation"
  stdout: string
  stderr: string
  durationMs: number
}

export function runPythonPreview(params: {
  code: string
  input: string
  limits: ExecutionLimits
}): Effect.Effect<PythonPreviewResponse, Error> {
  return Effect.tryPromise({
    try: () =>
      runSingleCase(
        params.code,
        params.input,
        params.limits.timeoutMs,
        params.limits.maxOutputBytes,
        params.limits.memoryLimitMb,
      ),
    catch: (error) =>
      error instanceof Error
        ? error
        : new Error("Unknown python preview execution failure"),
  }).pipe(
    Effect.map((result) => {
      if (result.outputLimitExceeded) {
        return {
          verdict: "sandbox_violation",
          stdout: result.stdout,
          stderr: "SandboxViolation: maximum output exceeded",
          durationMs: result.durationMs,
        }
      }

      if (result.timedOut) {
        return {
          verdict: "timeout",
          stdout: result.stdout,
          stderr: result.stderr.trim(),
          durationMs: result.durationMs,
        }
      }

      if (result.exitCode !== 0) {
        return {
          verdict: result.stderr.includes("SandboxViolation")
            ? "sandbox_violation"
            : "runtime_error",
          stdout: result.stdout,
          stderr: result.stderr.trim(),
          durationMs: result.durationMs,
        }
      }

      return {
        verdict: "ok",
        stdout: result.stdout,
        stderr: result.stderr.trim(),
        durationMs: result.durationMs,
      }
    }),
  )
}

export function runPythonExecution(
  request: PythonExecutionRequest,
): Effect.Effect<PythonExecutionResponse, Error> {
  return Effect.gen(function* () {
    const caseResults: Array<ExecutionCaseResult> = []

    for (const testCase of request.testCases) {
      const runResult = yield* Effect.tryPromise({
        try: () =>
          runSingleCase(
            request.code,
            testCase.input,
            request.limits.timeoutMs,
            request.limits.maxOutputBytes,
            request.limits.memoryLimitMb,
          ),
        catch: (error) =>
          error instanceof Error
            ? error
            : new Error("Unknown python execution failure"),
      })

      caseResults.push(toCaseResult(testCase, runResult))

      if (
        caseResults.at(-1)?.verdict === "timeout" ||
        caseResults.at(-1)?.verdict === "runtime_error" ||
        caseResults.at(-1)?.verdict === "sandbox_violation"
      ) {
        break
      }
    }

    const totalDurationMs = caseResults.reduce(
      (total, current) => total + current.durationMs,
      0,
    )

    return {
      verdict: deriveSubmissionVerdict(caseResults),
      totalDurationMs,
      caseResults,
    }
  })
}
