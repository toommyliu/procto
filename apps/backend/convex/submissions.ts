import { MAX_PYTHON_CODE_SIZE } from "@procto/submission-core"
import { v } from "convex/values"
import type { Id } from "./_generated/dataModel"
import { internalMutation, internalQuery, mutation, query } from "./_generated/server"

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_SUBMISSIONS_PER_WINDOW = 20

export const submitPython = mutation({
  args: {
    problemSlug: v.string(),
    userId: v.string(),
    code: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.code.length > MAX_PYTHON_CODE_SIZE) {
      throw new Error(`Code exceeds ${MAX_PYTHON_CODE_SIZE} characters`)
    }

    const problem = await ctx.db
      .query("problems")
      .withIndex("by_slug", (q) => q.eq("slug", args.problemSlug))
      .unique()

    if (!problem) {
      throw new Error("Problem not found")
    }

    const now = Date.now()
    const windowStart = now - RATE_LIMIT_WINDOW_MS

    const recentSubmissions = await ctx.db
      .query("submissions")
      .withIndex("by_user_createdAt", (q) =>
        q.eq("userId", args.userId).gte("createdAt", windowStart),
      )
      .collect()

    if (recentSubmissions.length >= RATE_LIMIT_MAX_SUBMISSIONS_PER_WINDOW) {
      throw new Error("Rate limit exceeded, please wait and try again")
    }

    const submissionId = await ctx.db.insert("submissions", {
      problemId: problem._id,
      problemSlug: problem.slug,
      userId: args.userId,
      language: "python",
      code: args.code,
      status: "queued",
      createdAt: now,
    })

    return {
      submissionId,
      status: "queued" as const,
    }
  },
})

export const getSubmissionById = query({
  args: {
    submissionId: v.string(),
  },
  handler: async (ctx, args) => {
    const submission = await ctx.db.get(args.submissionId as Id<"submissions">)

    if (!submission) {
      return null
    }

    return {
      _id: submission._id,
      problemSlug: submission.problemSlug,
      userId: submission.userId,
      status: submission.status,
      verdict: submission.verdict,
      errorMessage: submission.errorMessage,
      createdAt: submission.createdAt,
      startedAt: submission.startedAt,
      finishedAt: submission.finishedAt,
      totalDurationMs: submission.totalDurationMs,
      caseResults:
        submission.caseResults?.map((result) => ({
          testCaseId: result.testCaseId,
          verdict: result.verdict,
          actualOutput: result.actualOutput,
          expectedOutput: result.isHidden ? null : result.expectedOutput,
          stderr: result.stderr,
          durationMs: result.durationMs,
          isHidden: result.isHidden,
        })) ?? [],
    }
  },
})

export const getRunnerPayload = internalQuery({
  args: {
    submissionId: v.id("submissions"),
  },
  handler: async (ctx, args) => {
    const submission = await ctx.db.get(args.submissionId)
    if (!submission) {
      return null
    }

    const problem = await ctx.db.get(submission.problemId)
    if (!problem) {
      return null
    }

    return {
      submission,
      problem,
    }
  },
})

export const markSubmissionRunning = internalMutation({
  args: {
    submissionId: v.id("submissions"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.submissionId, {
      status: "running",
      startedAt: Date.now(),
    })
  },
})

export const markSubmissionFinished = internalMutation({
  args: {
    submissionId: v.id("submissions"),
    verdict: v.union(
      v.literal("accepted"),
      v.literal("wrong_answer"),
      v.literal("runtime_error"),
      v.literal("timeout"),
      v.literal("sandbox_violation"),
      v.literal("system_error"),
    ),
    totalDurationMs: v.number(),
    caseResults: v.array(
      v.object({
        testCaseId: v.string(),
        verdict: v.union(
          v.literal("passed"),
          v.literal("wrong_answer"),
          v.literal("runtime_error"),
          v.literal("timeout"),
          v.literal("sandbox_violation"),
        ),
        expectedOutput: v.string(),
        actualOutput: v.string(),
        stderr: v.string(),
        durationMs: v.number(),
        isHidden: v.boolean(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.submissionId, {
      status: args.verdict === "system_error" ? "failed" : "completed",
      verdict: args.verdict,
      caseResults: args.caseResults,
      totalDurationMs: args.totalDurationMs,
      finishedAt: Date.now(),
      errorMessage: undefined,
    })
  },
})

export const markSubmissionFailed = internalMutation({
  args: {
    submissionId: v.id("submissions"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.submissionId, {
      status: "failed",
      verdict: "system_error",
      errorMessage: args.errorMessage,
      finishedAt: Date.now(),
    })
  },
})

