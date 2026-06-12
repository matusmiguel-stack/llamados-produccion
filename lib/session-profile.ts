import { supabase } from "./supabase"

export type AppProfile = {
  id: string
  email: string
  full_name: string | null
  role: string
  must_change_password?: boolean
}

async function fetchOwnProfile(userId: string): Promise<AppProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle()
  if (error) {
    alert(error.message)
    return null
  }
  return data
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

  const profile = await fetchOwnProfile(session.user.id)

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

  const profile = await fetchOwnProfile(session.user.id)

  if (profile?.must_change_password) {
    window.location.href = "/perfil"
    return
  }

  window.location.href = "/"
}
