import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { data: { session } } = await supabase.auth.exchangeCodeForSession(code)

    if (session?.user) {
      const user = session.user
      const nombre = user.user_metadata?.nombre as string | undefined
      const grupo_id = user.user_metadata?.grupo_id as string | undefined

      if (nombre && grupo_id) {
        const db = supabaseAdmin()
        // solo crear si no existe (evitar duplicados si el link se abre dos veces)
        const { data: existing } = await db
          .from('jugadores')
          .select('id')
          .eq('user_id', user.id)
          .single()

        if (!existing) {
          await db.from('jugadores').insert({ user_id: user.id, nombre, grupo_id })
        }
      }
    }
  }

  return NextResponse.redirect(`${origin}/mi-grupo`)
}
