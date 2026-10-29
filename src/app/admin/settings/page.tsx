import { PageTitle, staffPage } from "@/components/admin/staff-page"
import { SettingsForm } from "@/components/admin/other-forms"
import { settingsToForm } from "@/features/admin/mappers"
import { getSettingsAdmin } from "@/services/admin-ops-service"

export default staffPage<object>("settings:write", async ({ actor }) => (
  <>
    <PageTitle title="Settings" crumbs={[{ label: "Settings" }]} />
    <SettingsForm values={settingsToForm(await getSettingsAdmin(actor))} />
  </>
))
