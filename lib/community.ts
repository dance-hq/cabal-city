import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { config } from '@/lib/config'
import type { Community } from '@/lib/types'

export const getCommunity = cache(async (): Promise<Community | null> => {
  const supabase = await createClient()
  const { data } = await supabase
    .from('communities')
    .select('id, slug, name, description, join_policy')
    .eq('slug', config.communitySlug)
    .maybeSingle()
  return data
})
