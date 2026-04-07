import { ConvexHttpClient } from "convex/browser"
import { makeFunctionReference } from "convex/server"
import type { BackendEnv } from "./env"

export class ConvexApiClient {
  private readonly client: ConvexHttpClient

  constructor(env: BackendEnv) {
    this.client = new ConvexHttpClient(env.convexUrl)

    const clientWithAdminAuth = this.client as ConvexHttpClient & {
      setAdminAuth?: (token: string) => void
    }

    if (clientWithAdminAuth.setAdminAuth) {
      clientWithAdminAuth.setAdminAuth(env.convexDeployKey)
    } else {
      this.client.setAuth(env.convexDeployKey)
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
