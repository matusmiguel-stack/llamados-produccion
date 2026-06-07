import { createAdminClient } from "./supabase-admin"

/**
 * Dado un employee_id, devuelve el profile_id del usuario que tiene
 * el mismo email que el empleado.
 */
export async function getProfileIdForEmployee(employeeId: string): Promise<string | null> {
  const admin = createAdminClient()

  // 1. Obtener email del empleado
  const { data: emp } = await admin
    .from("employees")
    .select("email")
    .eq("id", employeeId)
    .single()

  if (!emp?.email) return null

  // 2. Buscar el auth user con ese email
  const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const user = users.find((u) => u.email === emp.email)

  return user?.id || null
}

/**
 * Dado un array de employee_ids, devuelve un mapa { employeeId -> profileId }
 * Solo incluye los que tienen usuario registrado.
 */
export async function getProfileIdsForEmployees(
  employeeIds: string[]
): Promise<Record<string, string>> {
  if (!employeeIds.length) return {}

  const admin = createAdminClient()

  const { data: emps } = await admin
    .from("employees")
    .select("id, email")
    .in("id", employeeIds)

  if (!emps?.length) return {}

  const emailToEmpId: Record<string, string> = {}
  for (const e of emps) {
    if (e.email) emailToEmpId[e.email.toLowerCase()] = e.id
  }

  const { data: { users } } = await admin.auth.admin.listUsers({ perPage: 1000 })

  const result: Record<string, string> = {}
  for (const user of users) {
    const email = user.email?.toLowerCase()
    if (email && emailToEmpId[email]) {
      result[emailToEmpId[email]] = user.id
    }
  }

  return result
}
