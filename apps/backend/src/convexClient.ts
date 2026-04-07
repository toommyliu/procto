import { ConvexHttpClient } from "convex/browser"
import { makeFunctionReference } from "convex/server"
import type { Env } from "./env"

export class ConvexApiClient {
  private readonly client: ConvexHttpClient

  constructor(env: Env) {
    this.client = new ConvexHttpClient(env.CONVEX_URL)

    const clientWithAdminAuth = this.client as ConvexHttpClient & {
      setAdminAuth?: (token: string) => void
    }

    if (clientWithAdminAuth.setAdminAuth) {
      clientWithAdminAuth.setAdminAuth(env.CONVEX_DEPLOY_KEY)
    } else {
      this.client.setAuth(env.CONVEX_DEPLOY_KEY)
    }
  }

  mutation<T>(functionName: string, args: Record<string, unknown>): Promise<T> {
    const mutationRef = makeFunctionReference<"mutation">(functionName)
    return this.client.mutation(mutationRef, args) as Promise<T>
  }

  query<T>(functionName: string, args: Record<string, unknown>): Promise<T> {
    const queryRef = makeFunctionReference<"query">(functionName)
    return this.client.query(queryRef, args) as Promise<T>
  }
}
