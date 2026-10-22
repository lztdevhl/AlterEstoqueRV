export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type MovementType = 'entrada' | 'saida' | 'ajuste'
export type ProfileRole = 'admin' | 'operador' | 'leitura'

export type Database = {
  public: {
    Tables: {
      import_batches: {
        Row: {
          id: string
          file_name: string
          file_format: 'xml' | 'zip' | 'pdf' | 'csv' | 'xlsx' | 'xls' | 'txt' | 'json' | 'mixed'
          reference_start: string | null
          reference_end: string | null
          status: 'review' | 'confirmed' | 'failed' | 'reversed'
          processed_at: string
          confirmed_at: string | null
          created_by: string
          total_rows: number
          imported_rows: number
          duplicate_rows: number
          ignored_rows: number
          file_count: number
          detected_formats: Json
          pending_rows: number
          invalid_rows: number
          warnings: Json
          errors: Json
          created_at: string
        }
        Insert: {
          id?: string
          file_name: string
          file_format: 'xml' | 'zip' | 'pdf' | 'csv' | 'xlsx' | 'xls' | 'txt' | 'json' | 'mixed'
          reference_start?: string | null
          reference_end?: string | null
          status?: 'review' | 'confirmed' | 'failed' | 'reversed'
          processed_at?: string
          confirmed_at?: string | null
          created_by: string
          total_rows?: number
          imported_rows?: number
          duplicate_rows?: number
          ignored_rows?: number
          file_count?: number
          detected_formats?: Json
          pending_rows?: number
          invalid_rows?: number
          warnings?: Json
          errors?: Json
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['import_batches']['Insert']>
        Relationships: []
      }
      import_rows: {
        Row: {
          id: string
          batch_id: string
          row_number: number
          source_record_key: string
          source_data: Json
          external_code: string | null
          barcode: string | null
          product_name: string | null
          document_number: string | null
          operation_text: string | null
          movement_type: MovementType | null
          manual_classification: boolean
          quantity: number | null
          unit: string | null
          effective_at: string | null
          product_id: string | null
          product_match: string | null
          source_file_name: string | null
          document_key: string | null
          document_series: string | null
          cfop: string | null
          fiscal_status: string | null
          issuer: string | null
          recipient: string | null
          validation_status: 'valid' | 'pending' | 'error' | 'duplicate' | 'ignored' | 'imported'
          validation_errors: Json
          warnings: Json
          idempotency_key: string
          duplicate_of: string | null
          movement_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          batch_id: string
          row_number: number
          source_record_key: string
          source_data?: Json
          external_code?: string | null
          barcode?: string | null
          product_name?: string | null
          document_number?: string | null
          operation_text?: string | null
          movement_type?: MovementType | null
          manual_classification?: boolean
          quantity?: number | null
          unit?: string | null
          effective_at?: string | null
          product_id?: string | null
          product_match?: string | null
          source_file_name?: string | null
          document_key?: string | null
          document_series?: string | null
          cfop?: string | null
          fiscal_status?: string | null
          issuer?: string | null
          recipient?: string | null
          validation_status?: 'valid' | 'pending' | 'error' | 'duplicate' | 'ignored' | 'imported'
          validation_errors?: Json
          warnings?: Json
          idempotency_key: string
          duplicate_of?: string | null
          movement_id?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['import_rows']['Insert']>
        Relationships: []
      }
      product_external_mappings: {
        Row: { id: string; external_system: string; identifier_type: 'sku' | 'barcode' | 'external_code' | 'name'; external_identifier: string; product_id: string; created_by: string | null; created_at: string; updated_at: string }
        Insert: { id?: string; external_system?: string; identifier_type: 'sku' | 'barcode' | 'external_code' | 'name'; external_identifier: string; product_id: string; created_by?: string | null; created_at?: string; updated_at?: string }
        Update: Partial<Database['public']['Tables']['product_external_mappings']['Insert']>
        Relationships: []
      }
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
          image_url: string | null
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
          image_url?: string | null
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
          image_url?: string | null
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
          customer_name: string | null
          is_sale: boolean
          batch_id: string | null
          import_row_id: string | null
          source_operation_key: string | null
          effective_at: string | null
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
          customer_name?: string | null
          is_sale?: boolean
          batch_id?: string | null
          import_row_id?: string | null
          source_operation_key?: string | null
          effective_at?: string | null
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
          customer_name?: string | null
          is_sale?: boolean
          batch_id?: string | null
          import_row_id?: string | null
          source_operation_key?: string | null
          effective_at?: string | null
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
      confirm_import_batch: {
        Args: { p_batch_id: string }
        Returns: { batch_id: string; imported_count: number; duplicate_count: number; ignored_count: number; confirmed_at: string }[]
      }
      reset_operational_data: {
        Args: Record<string, never>
        Returns: undefined
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
