import { PageTitle, staffPage } from "@/components/admin/staff-page"
import { RoleSelect } from "@/components/admin/row-actions"
import { ROLES, ROLE_RANK } from "@/config/permissions"
import { listCustomers } from "@/services/admin-ops-service"

export default staffPage<object>("users:manage_roles", async ({ actor }) => {
  const staff = await listCustomers(actor, { staffOnly: true })
  // Nobody can hand out a role above their own; the service enforces it, the list just does not offer it.
  const roles = ROLES.filter((r) => ROLE_RANK[r] <= ROLE_RANK[actor.role]).map((r) => ({
    value: r,
    label: r.replace("_", " "),
  }))
  return (
    <>
      <PageTitle title="Staff and roles" crumbs={[{ label: "Staff and roles" }]} />
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">
        To make someone staff, they first need an account. Find them under Customers, then set their
        role here once they appear. Changing a role signs that person out so it applies at once.
      </p>
      <ul className="divide-y border-y">
        {staff.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <div>
              <p className="text-lg">{u.name}</p>
              <p className="text-muted-foreground">{u.email}</p>
            </div>
            {u.id === actor.id ? (
              <span>You</span>
            ) : (
              <RoleSelect userId={u.id} role={u.role} roles={roles} name={u.name} />
            )}
          </li>
        ))}
      </ul>
    </>
  )
})
