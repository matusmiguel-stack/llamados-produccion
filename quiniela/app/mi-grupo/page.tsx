import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase'

export default async function MiGrupoPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = supabaseAdmin()
  const { data: jugador } = await db
    .from('jugadores')
    .select('grupo_id, grupos(codigo)')
    .eq('user_id', user.id)
    .single()

  if (!jugador) redirect('/registro')

  const grupo = jugador.grupos as unknown as { codigo: string } | null
  if (!grupo) redirect('/registro')

  redirect(`/grupo/${grupo.codigo}`)
}
