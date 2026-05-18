import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    global: {
      headers: {
        get 'x-admin-pin'() {
          if (typeof window !== 'undefined') {
            return window.localStorage.getItem('admin_pin') || ''
          }
          return ''
        }
      }
    }
  }
)
