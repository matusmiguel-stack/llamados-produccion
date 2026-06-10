import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase'
import MiGrupoSelector from './selector'

export default async function MiGrupoPage() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = supabaseAdmin()
  const { data: jugadores } = await db
    .from('jugadores')
    .select('grupo_id, grupos(codigo, nombre)')
    .eq('user_id', user.id)

  if (!jugadores || jugadores.length === 0) redirect('/registro')

  // Si solo tiene un grupo, redirigir directo
  if (jugadores.length === 1) {
    const grupo = jugadores[0].grupos as unknown as { codigo: string } | null
    if (!grupo) redirect('/registro')
    redirect(`/grupo/${grupo.codigo}`)
  }

  // Varios grupos → mostrar selector
  const grupos = jugadores
    .map((j) => j.grupos as unknown as { codigo: string; nombre: string } | null)
    .filter(Boolean) as { codigo: string; nombre: string }[]

  return <MiGrupoSelector grupos={grupos} />
}
