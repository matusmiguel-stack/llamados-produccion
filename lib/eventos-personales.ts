// Quiénes pueden tener eventos personales (privados) en el calendario general.
// Debe coincidir con la política RLS de public.personal_events
// (supabase/migrations/20261006_personal_events.sql): ahí es donde realmente
// se garantiza que nadie más los lea; esto solo decide si se muestra la opción.
export const USUARIOS_EVENTOS_PERSONALES = ["miguel@retrocasaproductora.com"]

export const puedeEventosPersonales = (email: string | null | undefined) =>
  !!email && USUARIOS_EVENTOS_PERSONALES.includes(email.toLowerCase())
