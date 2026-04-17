export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      bank_accounts: {
        Row: {
          account_type: string
          balance: number
          bank_name: string
          base_currency_value: number
          created_at: string
          currency: string
          fx_rate: number | null
          id: string
          notes: string | null
          user_id: string
        }
        Insert: {
          account_type?: string
          balance?: number
          bank_name: string
          base_currency_value?: number
          created_at?: string
          currency?: string
          fx_rate?: number | null
          id?: string
          notes?: string | null
          user_id: string
        }
        Update: {
          account_type?: string
          balance?: number
          bank_name?: string
          base_currency_value?: number
          created_at?: string
          currency?: string
          fx_rate?: number | null
          id?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
      bank_transactions: {
        Row: {
          amount: number
          bank_account_id: string
          created_at: string
          description: string | null
          id: string
          linked_expense_id: string | null
          transaction_date: string
          transaction_type: string
          user_id: string
        }
        Insert: {
          amount?: number
          bank_account_id: string
          created_at?: string
          description?: string | null
          id?: string
          linked_expense_id?: string | null
          transaction_date?: string
          transaction_type?: string
          user_id: string
        }
        Update: {
          amount?: number
          bank_account_id?: string
          created_at?: string
          description?: string | null
          id?: string
          linked_expense_id?: string | null
          transaction_date?: string
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_linked_expense_id_fkey"
            columns: ["linked_expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          base_currency_value: number
          category: string
          created_at: string
          currency: string
          date: string
          description: string | null
          expense_group: string
          fx_rate: number | null
          id: string
          is_recurring: boolean
          payment_method: string | null
          user_id: string
        }
        Insert: {
          amount: number
          base_currency_value?: number
          category: string
          created_at?: string
          currency?: string
          date?: string
          description?: string | null
          expense_group?: string
          fx_rate?: number | null
          id?: string
          is_recurring?: boolean
          payment_method?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          base_currency_value?: number
          category?: string
          created_at?: string
          currency?: string
          date?: string
          description?: string | null
          expense_group?: string
          fx_rate?: number | null
          id?: string
          is_recurring?: boolean
          payment_method?: string | null
          user_id?: string
        }
        Relationships: []
      }
      income_entries: {
        Row: {
          amount: number
          base_currency_value: number
          created_at: string
          currency: string
          date_received: string
          frequency: string
          fx_rate: number | null
          id: string
          notes: string | null
          source_name: string
          user_id: string
        }
        Insert: {
          amount?: number
          base_currency_value?: number
          created_at?: string
          currency?: string
          date_received?: string
          frequency?: string
          fx_rate?: number | null
          id?: string
          notes?: string | null
          source_name: string
          user_id: string
        }
        Update: {
          amount?: number
          base_currency_value?: number
          created_at?: string
          currency?: string
          date_received?: string
          frequency?: string
          fx_rate?: number | null
          id?: string
          notes?: string | null
          source_name?: string
          user_id?: string
        }
        Relationships: []
      }
      investment_transactions: {
        Row: {
          asset_class: string
          asset_name: string
          buy_price: number
          created_at: string
          currency: string
          fx_rate_at_purchase: number | null
          id: string
          investment_id: string | null
          quantity: number
          ticker_symbol: string | null
          transaction_date: string
          transaction_type: string
          user_id: string
        }
        Insert: {
          asset_class: string
          asset_name: string
          buy_price?: number
          created_at?: string
          currency?: string
          fx_rate_at_purchase?: number | null
          id?: string
          investment_id?: string | null
          quantity?: number
          ticker_symbol?: string | null
          transaction_date?: string
          transaction_type?: string
          user_id: string
        }
        Update: {
          asset_class?: string
          asset_name?: string
          buy_price?: number
          created_at?: string
          currency?: string
          fx_rate_at_purchase?: number | null
          id?: string
          investment_id?: string | null
          quantity?: number
          ticker_symbol?: string | null
          transaction_date?: string
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_transactions_investment_id_fkey"
            columns: ["investment_id"]
            isOneToOne: false
            referencedRelation: "investments"
            referencedColumns: ["id"]
          },
        ]
      }
      investments: {
        Row: {
          api_connected: boolean
          asset_class: string
          asset_name: string
          avg_buy_price: number | null
          base_currency_value: number
          created_at: string
          currency: string
          current_value: number
          fx_rate: number | null
          id: string
          invested_value: number
          last_updated: string
          notes: string | null
          quantity: number | null
          ticker_symbol: string | null
          user_id: string
        }
        Insert: {
          api_connected?: boolean
          asset_class: string
          asset_name: string
          avg_buy_price?: number | null
          base_currency_value?: number
          created_at?: string
          currency?: string
          current_value?: number
          fx_rate?: number | null
          id?: string
          invested_value?: number
          last_updated?: string
          notes?: string | null
          quantity?: number | null
          ticker_symbol?: string | null
          user_id: string
        }
        Update: {
          api_connected?: boolean
          asset_class?: string
          asset_name?: string
          avg_buy_price?: number | null
          base_currency_value?: number
          created_at?: string
          currency?: string
          current_value?: number
          fx_rate?: number | null
          id?: string
          invested_value?: number
          last_updated?: string
          notes?: string | null
          quantity?: number | null
          ticker_symbol?: string | null
          user_id?: string
        }
        Relationships: []
      }
      liabilities: {
        Row: {
          base_currency_value: number
          created_at: string
          credit_limit: number | null
          currency: string
          fx_rate: number | null
          id: string
          interest_rate: number
          lender_name: string | null
          liability_type: string
          loan_start_date: string | null
          loan_tenure_months: number | null
          min_payment_percent: number | null
          monthly_payment: number
          notes: string | null
          original_loan_amount: number
          outstanding_amount: number
          user_id: string
        }
        Insert: {
          base_currency_value?: number
          created_at?: string
          credit_limit?: number | null
          currency?: string
          fx_rate?: number | null
          id?: string
          interest_rate?: number
          lender_name?: string | null
          liability_type: string
          loan_start_date?: string | null
          loan_tenure_months?: number | null
          min_payment_percent?: number | null
          monthly_payment?: number
          notes?: string | null
          original_loan_amount?: number
          outstanding_amount?: number
          user_id: string
        }
        Update: {
          base_currency_value?: number
          created_at?: string
          credit_limit?: number | null
          currency?: string
          fx_rate?: number | null
          id?: string
          interest_rate?: number
          lender_name?: string | null
          liability_type?: string
          loan_start_date?: string | null
          loan_tenure_months?: number | null
          min_payment_percent?: number | null
          monthly_payment?: number
          notes?: string | null
          original_loan_amount?: number
          outstanding_amount?: number
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          currency: string
          display_name: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          display_name?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          display_name?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      stocks_metadata: {
        Row: {
          company_name: string
          country: string
          created_at: string
          currency: string
          industry: string
          sector: string
          ticker: string
          updated_at: string
        }
        Insert: {
          company_name?: string
          country?: string
          created_at?: string
          currency?: string
          industry?: string
          sector?: string
          ticker: string
          updated_at?: string
        }
        Update: {
          company_name?: string
          country?: string
          created_at?: string
          currency?: string
          industry?: string
          sector?: string
          ticker?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_expense_with_deduction: {
        Args: {
          p_amount: number
          p_bank_account_id?: string
          p_base_currency_value: number
          p_category: string
          p_currency: string
          p_date: string
          p_description: string
          p_expense_group: string
          p_fx_rate: number
          p_is_recurring: boolean
          p_payment_method: string
        }
        Returns: Json
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
