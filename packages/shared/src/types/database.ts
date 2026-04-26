/**
 * Types générés depuis le schéma Supabase.
 *
 * Pour l'instant : placeholder. À regénérer après chaque migration via :
 *
 *   pnpm dlx supabase gen types typescript --local > packages/shared/src/types/database.ts
 *
 * (ou `--linked` pour la prod). Ne pas éditer manuellement le résultat.
 */

export type Database = {
  public: {
    Tables: Record<string, never>;
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T] extends { Row: infer R } ? R : never;

export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T] extends { Insert: infer I } ? I : never;

export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T] extends { Update: infer U } ? U : never;
