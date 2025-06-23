export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      project_sessions: {
        Row: {
          id: string;
          project_id: string;
          session_data: {
            messages: Array<{
              role: 'user' | 'assistant' | 'system';
              content: string;
            }>;
            strategy_covered: boolean;
            created_at: string;
            updated_at: string;
          };
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          project_id: string;
          session_data: {
            messages: Array<{
              role: 'user' | 'assistant' | 'system';
              content: string;
            }>;
            strategy_covered: boolean;
            created_at: string;
            updated_at: string;
          };
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          project_id?: string;
          session_data?: {
            messages: Array<{
              role: 'user' | 'assistant' | 'system';
              content: string;
            }>;
            strategy_covered: boolean;
            created_at: string;
            updated_at: string;
          };
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type ProjectSession = Tables<'project_sessions'>;
