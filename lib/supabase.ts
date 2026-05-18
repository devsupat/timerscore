import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
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
