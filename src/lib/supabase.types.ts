export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type MovementType = 'entrada' | 'saida' | 'ajuste'
export type ProfileRole = 'admin' | 'operador' | 'leitura'

export type Database = {
  public: {
    Tables: {
      clients: {
        Row: {
          id: string
          name: string
          document: string | null
          phone: string | null
          email: string | null
          notes: string | null
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          document?: string | null
          phone?: string | null
          email?: string | null
          notes?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          document?: string | null
          phone?: string | null
          email?: string | null
          notes?: string | null
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          display_name: string | null
          role: ProfileRole
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          display_name?: string | null
          role?: ProfileRole
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          display_name?: string | null
          role?: ProfileRole
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          id: string
          name: string
          sku: string | null
          category: string | null
          description: string | null
          unit: string | null
          min_stock: number
          location: string | null
          stock_known: boolean
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          sku?: string | null
          category?: string | null
          description?: string | null
          unit?: string | null
          min_stock?: number
          location?: string | null
          stock_known?: boolean
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          sku?: string | null
          category?: string | null
          description?: string | null
          unit?: string | null
          min_stock?: number
          location?: string | null
          stock_known?: boolean
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_balances: {
        Row: {
          product_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          product_id: string
          quantity?: number
          updated_at?: string
        }
        Update: {
          product_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'stock_balances_product_id_fkey'
            columns: ['product_id']
            isOneToOne: true
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
        ]
      }
      stock_movements: {
        Row: {
          id: string
          product_id: string
          movement_type: MovementType
          quantity: number
          previous_quantity: number
          next_quantity: number
          reason: string
          destination: string | null
          reference: string | null
          notes: string | null
          performed_by: string | null
          idempotency_key: string
          created_at: string
          customer_id: string | null
          is_sale: boolean
        }
        Insert: {
          id?: string
          product_id: string
          movement_type: MovementType
          quantity: number
          previous_quantity: number
          next_quantity: number
          reason: string
          destination?: string | null
          reference?: string | null
          notes?: string | null
          performed_by?: string | null
          idempotency_key?: string
          created_at?: string
          customer_id?: string | null
          is_sale?: boolean
        }
        Update: {
          id?: string
          product_id?: string
          movement_type?: MovementType
          quantity?: number
          previous_quantity?: number
          next_quantity?: number
          reason?: string
          destination?: string | null
          reference?: string | null
          notes?: string | null
          performed_by?: string | null
          idempotency_key?: string
          created_at?: string
          customer_id?: string | null
          is_sale?: boolean
        }
        Relationships: [
          {
            foreignKeyName: 'stock_movements_product_id_fkey'
            columns: ['product_id']
            isOneToOne: false
            referencedRelation: 'products'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'stock_movements_customer_id_fkey'
            columns: ['customer_id']
            isOneToOne: false
            referencedRelation: 'clients'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      register_stock_movement_with_customer: {
        Args: {
          p_product_id: string
          p_movement_type: MovementType
          p_quantity: number
          p_reason: string
          p_destination?: string | null
          p_reference?: string | null
          p_notes?: string | null
          p_idempotency_key?: string | null
          p_is_sale?: boolean
          p_customer_id?: string | null
        }
        Returns: {
          movement_id: string
          product_id: string
          movement_type: MovementType
          quantity: number
          previous_quantity: number
          next_quantity: number
          created_at: string
        }[]
      }
      register_stock_movement: {
        Args: {
          p_product_id: string
          p_movement_type: MovementType
          p_quantity: number
          p_reason: string
          p_destination?: string | null
          p_reference?: string | null
          p_notes?: string | null
          p_idempotency_key?: string | null
        }
        Returns: {
          movement_id: string
          product_id: string
          movement_type: MovementType
          quantity: number
          previous_quantity: number
          next_quantity: number
          created_at: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
