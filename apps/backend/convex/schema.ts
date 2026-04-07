import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  problems: defineTable({
    slug: v.string(),
    title: v.string(),
    description: v.string(),
    language: v.literal("python"),
    starterCode: v.string(),
    limits: v.object({
      timeoutMs: v.number(),
      memoryLimitMb: v.number(),
      maxOutputBytes: v.number(),
    }),
    testCases: v.array(
      v.object({
        id: v.string(),
        input: v.string(),
        expectedOutput: v.string(),
        isHidden: v.boolean(),
      }),
    ),
    createdAt: v.number(),
  }).index("by_slug", ["slug"]),

  submissions: defineTable({
    problemId: v.id("problems"),
    problemSlug: v.string(),
    userId: v.string(),
    language: v.literal("python"),
    code: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    verdict: v.optional(
      v.union(
        v.literal("accepted"),
        v.literal("wrong_answer"),
        v.literal("runtime_error"),
        v.literal("timeout"),
        v.literal("sandbox_violation"),
        v.literal("system_error"),
      ),
    ),
    errorMessage: v.optional(v.string()),
    totalDurationMs: v.optional(v.number()),
    caseResults: v.optional(
      v.array(
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
    ),
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
  })
    .index("by_user_createdAt", ["userId", "createdAt"])
    .index("by_problem_createdAt", ["problemId", "createdAt"]),
})
