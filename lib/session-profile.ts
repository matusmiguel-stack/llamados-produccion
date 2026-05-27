import { supabase } from "./supabase"

export type AppProfile = {
  id: string
  email: string
  full_name: string | null
  role: string
  must_change_password?: boolean
}

export function findProfileByEmail(
  profiles: AppProfile[] | null | undefined,
  email: string | undefined | null
) {
  return profiles?.find(
    (profile) =>
      profile.email?.trim().toLowerCase() === email?.trim().toLowerCase()
  )
}

export async function requireSessionProfile(options?: {
  allowPasswordChangePage?: boolean
}) {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    window.location.href = "/login"
    return null
  }

  const { data: profiles, error } = await supabase.from("profiles").select("*")

  if (error) {
    alert(error.message)
    return null
  }

  const profile = findProfileByEmail(profiles, session.user.email)

  if (!profile) {
    window.location.href = "/login"
    return null
  }

  const onProfilePage =
    typeof window !== "undefined" && window.location.pathname === "/perfil"

  if (
    profile.must_change_password &&
    !options?.allowPasswordChangePage &&
    !onProfilePage
  ) {
    window.location.href = "/perfil"
    return null
  }

  return { session, profile }
}

export async function redirectAfterLogin() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    window.location.href = "/login"
    return
  }

  const { data: profiles } = await supabase.from("profiles").select("*")
  const profile = findProfileByEmail(profiles, session.user.email)

  if (profile?.must_change_password) {
    window.location.href = "/perfil"
    return
  }

  window.location.href = "/"
}
