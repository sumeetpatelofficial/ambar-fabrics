import "server-only"
import { connectDb } from "@/lib/db/mongoose"
import { Redirect, type RedirectDoc } from "@/models/redirect"

export const redirectRepository = {
  async find(fromPath: string): Promise<Pick<RedirectDoc, "toPath" | "statusCode"> | null> {
    await connectDb()
    return Redirect.findOne({ fromPath })
      .select({ toPath: 1, statusCode: 1 })
      .lean<Pick<RedirectDoc, "toPath" | "statusCode">>()
  },
}
