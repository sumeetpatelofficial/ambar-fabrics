import "server-only"
import { connectDb } from "@/lib/db/mongoose"
import { SiteSettings, type SiteSettingsDoc } from "@/models/site-settings"

export const settingsRepository = {
  /** The settings singleton, or null before an admin (or the seed script) has saved one. */
  async getDefault(): Promise<SiteSettingsDoc | null> {
    await connectDb()
    return SiteSettings.findOne({ key: "default" }).lean<SiteSettingsDoc>()
  },
}
