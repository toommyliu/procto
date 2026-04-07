import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

const DEMO_PROBLEM_SLUG = "sum-two-integers"

const DEMO_PROBLEM = {
  slug: DEMO_PROBLEM_SLUG,
  title: "Sum Two Integers",
  description:
    "Read two space-separated integers from stdin and print their sum.",
  language: "python" as const,
  starterCode: `a, b = map(int, input().split())\nprint(a + b)\n`,
  limits: {
    timeoutMs: 1_500,
    memoryLimitMb: 128,
    maxOutputBytes: 32_768,
  },
  testCases: [
    {
      id: "sample-1",
      input: "2 3\n",
      expectedOutput: "5\n",
      isHidden: false,
    },
    {
      id: "sample-2",
      input: "10 -7\n",
      expectedOutput: "3\n",
      isHidden: false,
    },
    {
      id: "hidden-1",
      input: "111111 222222\n",
      expectedOutput: "333333\n",
      isHidden: true,
    },
  ],
}

export const seedDemoProblem = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("problems")
      .withIndex("by_slug", (q) => q.eq("slug", DEMO_PROBLEM_SLUG))
      .unique()

    if (existing) {
      return { seeded: false, problemId: existing._id }
    }

    const problemId = await ctx.db.insert("problems", {
      ...DEMO_PROBLEM,
      createdAt: Date.now(),
    })

    return { seeded: true, problemId }
  },
})

export const getBySlug = query({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const problem = await ctx.db
      .query("problems")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique()

    if (!problem) {
      return null
    }

    return {
      _id: problem._id,
      slug: problem.slug,
      title: problem.title,
      description: problem.description,
      language: problem.language,
      starterCode: problem.starterCode,
      limits: problem.limits,
      testCases: problem.testCases.map((testCase) => ({
        id: testCase.id,
        input: testCase.input,
        expectedOutput: testCase.isHidden ? null : testCase.expectedOutput,
        isHidden: testCase.isHidden,
      })),
    }
  },
})
