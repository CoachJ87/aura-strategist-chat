import { createClient } from '@supabase/supabase-js';
import { Database } from './database-types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
  },
});

export type { ProjectSession } from './database-types';

export type SessionData = Database['public']['Tables']['project_sessions']['Row']['session_data'];

export type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};
