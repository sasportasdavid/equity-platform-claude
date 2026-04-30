export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      api_keys: {
        Row: {
          created_at: string;
          created_by: string | null;
          expires_at: string | null;
          id: string;
          is_active: boolean;
          key_hash: string;
          key_prefix: string;
          last_used_at: string | null;
          name: string | null;
          org_id: string;
          scopes: string[];
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean;
          key_hash: string;
          key_prefix: string;
          last_used_at?: string | null;
          name?: string | null;
          org_id: string;
          scopes?: string[];
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean;
          key_hash?: string;
          key_prefix?: string;
          last_used_at?: string | null;
          name?: string | null;
          org_id?: string;
          scopes?: string[];
        };
        Relationships: [
          {
            foreignKeyName: 'api_keys_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      approval_actions: {
        Row: {
          action: string;
          comment: string | null;
          created_at: string;
          delegated_to: string | null;
          id: string;
          ip_address: unknown;
          org_id: string;
          request_id: string;
          step_id: string | null;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          action: string;
          comment?: string | null;
          created_at?: string;
          delegated_to?: string | null;
          id?: string;
          ip_address?: unknown;
          org_id: string;
          request_id: string;
          step_id?: string | null;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          action?: string;
          comment?: string | null;
          created_at?: string;
          delegated_to?: string | null;
          id?: string;
          ip_address?: unknown;
          org_id?: string;
          request_id?: string;
          step_id?: string | null;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'approval_actions_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'approval_actions_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'approval_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'approval_actions_step_id_fkey';
            columns: ['step_id'];
            isOneToOne: false;
            referencedRelation: 'approval_workflow_steps';
            referencedColumns: ['id'];
          },
        ];
      };
      approval_decisions: {
        Row: {
          approver_role: string | null;
          approver_user_id: string | null;
          comment: string | null;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          notified_at: string | null;
          org_id: string;
          request_id: string;
          status: string;
          step_id: string;
          step_order: number;
          updated_at: string;
        };
        Insert: {
          approver_role?: string | null;
          approver_user_id?: string | null;
          comment?: string | null;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          notified_at?: string | null;
          org_id: string;
          request_id: string;
          status?: string;
          step_id: string;
          step_order: number;
          updated_at?: string;
        };
        Update: {
          approver_role?: string | null;
          approver_user_id?: string | null;
          comment?: string | null;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          notified_at?: string | null;
          org_id?: string;
          request_id?: string;
          status?: string;
          step_id?: string;
          step_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'approval_decisions_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'approval_decisions_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'approval_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'approval_decisions_step_id_fkey';
            columns: ['step_id'];
            isOneToOne: false;
            referencedRelation: 'approval_workflow_steps';
            referencedColumns: ['id'];
          },
        ];
      };
      approval_requests: {
        Row: {
          award_id: string | null;
          created_at: string;
          current_step_id: string | null;
          current_step_order: number | null;
          id: string;
          org_id: string;
          plan_id: string | null;
          rejected_reason: string | null;
          request_message: string | null;
          requested_by: string | null;
          resolution: string | null;
          resolution_message: string | null;
          resolved_at: string | null;
          started_at: string | null;
          started_by: string | null;
          status: string;
          subject_id: string;
          subject_snapshot: Json | null;
          subject_type: string;
          updated_at: string;
          workflow_id: string | null;
        };
        Insert: {
          award_id?: string | null;
          created_at?: string;
          current_step_id?: string | null;
          current_step_order?: number | null;
          id?: string;
          org_id: string;
          plan_id?: string | null;
          rejected_reason?: string | null;
          request_message?: string | null;
          requested_by?: string | null;
          resolution?: string | null;
          resolution_message?: string | null;
          resolved_at?: string | null;
          started_at?: string | null;
          started_by?: string | null;
          status?: string;
          subject_id: string;
          subject_snapshot?: Json | null;
          subject_type: string;
          updated_at?: string;
          workflow_id?: string | null;
        };
        Update: {
          award_id?: string | null;
          created_at?: string;
          current_step_id?: string | null;
          current_step_order?: number | null;
          id?: string;
          org_id?: string;
          plan_id?: string | null;
          rejected_reason?: string | null;
          request_message?: string | null;
          requested_by?: string | null;
          resolution?: string | null;
          resolution_message?: string | null;
          resolved_at?: string | null;
          started_at?: string | null;
          started_by?: string | null;
          status?: string;
          subject_id?: string;
          subject_snapshot?: Json | null;
          subject_type?: string;
          updated_at?: string;
          workflow_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'approval_requests_award_id_fkey';
            columns: ['award_id'];
            isOneToOne: false;
            referencedRelation: 'awards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'approval_requests_current_step_id_fkey';
            columns: ['current_step_id'];
            isOneToOne: false;
            referencedRelation: 'approval_workflow_steps';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'approval_requests_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'approval_requests_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'approval_requests_workflow_id_fkey';
            columns: ['workflow_id'];
            isOneToOne: false;
            referencedRelation: 'approval_workflows';
            referencedColumns: ['id'];
          },
        ];
      };
      approval_workflow_steps: {
        Row: {
          approver_role: string | null;
          approver_type: string;
          approver_user_id: string | null;
          auto_escalate_after_hours: number | null;
          escalate_to_user_id: string | null;
          id: string;
          mode: string;
          required_approvals: number;
          sla_hours: number | null;
          step_name: string;
          step_order: number;
          trigger_conditions: Json;
          workflow_id: string;
        };
        Insert: {
          approver_role?: string | null;
          approver_type: string;
          approver_user_id?: string | null;
          auto_escalate_after_hours?: number | null;
          escalate_to_user_id?: string | null;
          id?: string;
          mode?: string;
          required_approvals?: number;
          sla_hours?: number | null;
          step_name: string;
          step_order: number;
          trigger_conditions?: Json;
          workflow_id: string;
        };
        Update: {
          approver_role?: string | null;
          approver_type?: string;
          approver_user_id?: string | null;
          auto_escalate_after_hours?: number | null;
          escalate_to_user_id?: string | null;
          id?: string;
          mode?: string;
          required_approvals?: number;
          sla_hours?: number | null;
          step_name?: string;
          step_order?: number;
          trigger_conditions?: Json;
          workflow_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'approval_workflow_steps_workflow_id_fkey';
            columns: ['workflow_id'];
            isOneToOne: false;
            referencedRelation: 'approval_workflows';
            referencedColumns: ['id'];
          },
        ];
      };
      approval_workflows: {
        Row: {
          applies_to: string;
          attach_to_plan_id: string | null;
          created_at: string;
          deleted_at: string | null;
          description: string | null;
          id: string;
          is_active: boolean;
          is_default: boolean;
          name: string;
          org_id: string;
          plan_type_filter: string[] | null;
          updated_at: string;
        };
        Insert: {
          applies_to: string;
          attach_to_plan_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_default?: boolean;
          name: string;
          org_id: string;
          plan_type_filter?: string[] | null;
          updated_at?: string;
        };
        Update: {
          applies_to?: string;
          attach_to_plan_id?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_default?: boolean;
          name?: string;
          org_id?: string;
          plan_type_filter?: string[] | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'approval_workflows_attach_to_plan_id_fkey';
            columns: ['attach_to_plan_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'approval_workflows_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_events: {
        Row: {
          after_state: Json | null;
          api_key_id: string | null;
          before_state: Json | null;
          event_type: string;
          id: string;
          ip_address: unknown;
          metadata: Json;
          occurred_at: string;
          org_id: string | null;
          request_id: string | null;
          resource_id: string | null;
          resource_type: string | null;
          user_agent: string | null;
          user_email: string | null;
          user_id: string | null;
        };
        Insert: {
          after_state?: Json | null;
          api_key_id?: string | null;
          before_state?: Json | null;
          event_type: string;
          id?: string;
          ip_address?: unknown;
          metadata?: Json;
          occurred_at?: string;
          org_id?: string | null;
          request_id?: string | null;
          resource_id?: string | null;
          resource_type?: string | null;
          user_agent?: string | null;
          user_email?: string | null;
          user_id?: string | null;
        };
        Update: {
          after_state?: Json | null;
          api_key_id?: string | null;
          before_state?: Json | null;
          event_type?: string;
          id?: string;
          ip_address?: unknown;
          metadata?: Json;
          occurred_at?: string;
          org_id?: string | null;
          request_id?: string | null;
          resource_id?: string | null;
          resource_type?: string | null;
          user_agent?: string | null;
          user_email?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_events_api_key_id_fkey';
            columns: ['api_key_id'];
            isOneToOne: false;
            referencedRelation: 'api_keys';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audit_events_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      award_modifications: {
        Row: {
          after_snapshot: Json;
          approval_request_id: string | null;
          approved_at: string | null;
          approved_by: string | null;
          award_id: string;
          before_snapshot: Json;
          created_at: string;
          effective_date: string;
          id: string;
          incremental_fair_value: number | null;
          modification_type: string;
          org_id: string;
          reason: string | null;
        };
        Insert: {
          after_snapshot: Json;
          approval_request_id?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          award_id: string;
          before_snapshot: Json;
          created_at?: string;
          effective_date: string;
          id?: string;
          incremental_fair_value?: number | null;
          modification_type: string;
          org_id: string;
          reason?: string | null;
        };
        Update: {
          after_snapshot?: Json;
          approval_request_id?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          award_id?: string;
          before_snapshot?: Json;
          created_at?: string;
          effective_date?: string;
          id?: string;
          incremental_fair_value?: number | null;
          modification_type?: string;
          org_id?: string;
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'award_modifications_approval_request_id_fkey';
            columns: ['approval_request_id'];
            isOneToOne: false;
            referencedRelation: 'approval_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'award_modifications_award_id_fkey';
            columns: ['award_id'];
            isOneToOne: false;
            referencedRelation: 'awards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'award_modifications_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      award_number_counters: {
        Row: {
          current_seq: number;
          current_year: number;
          org_id: string;
          updated_at: string;
        };
        Insert: {
          current_seq?: number;
          current_year?: number;
          org_id: string;
          updated_at?: string;
        };
        Update: {
          current_seq?: number;
          current_year?: number;
          org_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'award_number_counters_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: true;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      awards: {
        Row: {
          acceptance_deadline: string | null;
          accepted_at: string | null;
          approval_request_id: string | null;
          approved_at: string | null;
          award_number: string | null;
          beneficiary_id: string;
          cancellation_reason: string | null;
          cancelled_at: string | null;
          compliance_warnings: Json;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          exercise_price: number | null;
          expiry_date: string | null;
          fair_value_per_unit: number | null;
          grant_date: string;
          granted_at: string | null;
          has_modifications: boolean;
          id: string;
          is_compliant: boolean;
          leaver_rules_snapshot: Json | null;
          org_id: string;
          performance_conditions_snapshot: Json | null;
          plan_id: string;
          plan_rules_document_id: string | null;
          plan_version: number | null;
          status: string;
          total_fair_value: number | null;
          units_cancelled: number;
          units_exercised: number;
          units_granted: number;
          units_outstanding: number | null;
          units_settled: number;
          units_vested: number;
          updated_at: string;
          vesting_schedule_snapshot: Json | null;
          vesting_start_date: string | null;
        };
        Insert: {
          acceptance_deadline?: string | null;
          accepted_at?: string | null;
          approval_request_id?: string | null;
          approved_at?: string | null;
          award_number?: string | null;
          beneficiary_id: string;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          compliance_warnings?: Json;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          exercise_price?: number | null;
          expiry_date?: string | null;
          fair_value_per_unit?: number | null;
          grant_date: string;
          granted_at?: string | null;
          has_modifications?: boolean;
          id?: string;
          is_compliant?: boolean;
          leaver_rules_snapshot?: Json | null;
          org_id: string;
          performance_conditions_snapshot?: Json | null;
          plan_id: string;
          plan_rules_document_id?: string | null;
          plan_version?: number | null;
          status?: string;
          total_fair_value?: number | null;
          units_cancelled?: number;
          units_exercised?: number;
          units_granted: number;
          units_outstanding?: number | null;
          units_settled?: number;
          units_vested?: number;
          updated_at?: string;
          vesting_schedule_snapshot?: Json | null;
          vesting_start_date?: string | null;
        };
        Update: {
          acceptance_deadline?: string | null;
          accepted_at?: string | null;
          approval_request_id?: string | null;
          approved_at?: string | null;
          award_number?: string | null;
          beneficiary_id?: string;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          compliance_warnings?: Json;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          exercise_price?: number | null;
          expiry_date?: string | null;
          fair_value_per_unit?: number | null;
          grant_date?: string;
          granted_at?: string | null;
          has_modifications?: boolean;
          id?: string;
          is_compliant?: boolean;
          leaver_rules_snapshot?: Json | null;
          org_id?: string;
          performance_conditions_snapshot?: Json | null;
          plan_id?: string;
          plan_rules_document_id?: string | null;
          plan_version?: number | null;
          status?: string;
          total_fair_value?: number | null;
          units_cancelled?: number;
          units_exercised?: number;
          units_granted?: number;
          units_outstanding?: number | null;
          units_settled?: number;
          units_vested?: number;
          updated_at?: string;
          vesting_schedule_snapshot?: Json | null;
          vesting_start_date?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'awards_approval_request_id_fkey';
            columns: ['approval_request_id'];
            isOneToOne: false;
            referencedRelation: 'approval_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'awards_beneficiary_id_fkey';
            columns: ['beneficiary_id'];
            isOneToOne: false;
            referencedRelation: 'beneficiaries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'awards_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'awards_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'awards_plan_rules_document_id_fkey';
            columns: ['plan_rules_document_id'];
            isOneToOne: false;
            referencedRelation: 'document_instances';
            referencedColumns: ['id'];
          },
        ];
      };
      beneficiaries: {
        Row: {
          address_encrypted: string | null;
          address_line_1: string | null;
          address_line_2: string | null;
          bank_account_holder_name: string | null;
          bank_name: string | null;
          beneficiary_type: string;
          bic: string | null;
          city: string | null;
          company_id: string | null;
          contract_type: string | null;
          country: string | null;
          created_at: string;
          created_by: string | null;
          custom_fields: Json;
          date_of_birth_encrypted: string | null;
          deleted_at: string | null;
          department: string | null;
          email: string;
          first_login_at: string | null;
          first_name: string;
          gender: string | null;
          hire_date: string | null;
          iban: string | null;
          id: string;
          identity_document_url: string | null;
          invitation_count: number | null;
          invited_at: string | null;
          is_tax_resident_france: boolean | null;
          job_title: string | null;
          last_name: string;
          lifecycle_change_reason: string | null;
          lifecycle_changed_at: string | null;
          manager_id: string | null;
          nationality: string;
          org_id: string;
          phone_encrypted: string | null;
          postal_code: string | null;
          preferred_name: string | null;
          social_security_number: string | null;
          status: string;
          tax_id: string | null;
          tax_residence_country: string;
          termination_date: string | null;
          termination_reason: string | null;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          address_encrypted?: string | null;
          address_line_1?: string | null;
          address_line_2?: string | null;
          bank_account_holder_name?: string | null;
          bank_name?: string | null;
          beneficiary_type: string;
          bic?: string | null;
          city?: string | null;
          company_id?: string | null;
          contract_type?: string | null;
          country?: string | null;
          created_at?: string;
          created_by?: string | null;
          custom_fields?: Json;
          date_of_birth_encrypted?: string | null;
          deleted_at?: string | null;
          department?: string | null;
          email: string;
          first_login_at?: string | null;
          first_name: string;
          gender?: string | null;
          hire_date?: string | null;
          iban?: string | null;
          id?: string;
          identity_document_url?: string | null;
          invitation_count?: number | null;
          invited_at?: string | null;
          is_tax_resident_france?: boolean | null;
          job_title?: string | null;
          last_name: string;
          lifecycle_change_reason?: string | null;
          lifecycle_changed_at?: string | null;
          manager_id?: string | null;
          nationality?: string;
          org_id: string;
          phone_encrypted?: string | null;
          postal_code?: string | null;
          preferred_name?: string | null;
          social_security_number?: string | null;
          status?: string;
          tax_id?: string | null;
          tax_residence_country?: string;
          termination_date?: string | null;
          termination_reason?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          address_encrypted?: string | null;
          address_line_1?: string | null;
          address_line_2?: string | null;
          bank_account_holder_name?: string | null;
          bank_name?: string | null;
          beneficiary_type?: string;
          bic?: string | null;
          city?: string | null;
          company_id?: string | null;
          contract_type?: string | null;
          country?: string | null;
          created_at?: string;
          created_by?: string | null;
          custom_fields?: Json;
          date_of_birth_encrypted?: string | null;
          deleted_at?: string | null;
          department?: string | null;
          email?: string;
          first_login_at?: string | null;
          first_name?: string;
          gender?: string | null;
          hire_date?: string | null;
          iban?: string | null;
          id?: string;
          identity_document_url?: string | null;
          invitation_count?: number | null;
          invited_at?: string | null;
          is_tax_resident_france?: boolean | null;
          job_title?: string | null;
          last_name?: string;
          lifecycle_change_reason?: string | null;
          lifecycle_changed_at?: string | null;
          manager_id?: string | null;
          nationality?: string;
          org_id?: string;
          phone_encrypted?: string | null;
          postal_code?: string | null;
          preferred_name?: string | null;
          social_security_number?: string | null;
          status?: string;
          tax_id?: string | null;
          tax_residence_country?: string;
          termination_date?: string | null;
          termination_reason?: string | null;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'beneficiaries_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'beneficiaries_manager_id_fkey';
            columns: ['manager_id'];
            isOneToOne: false;
            referencedRelation: 'beneficiaries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'beneficiaries_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      cap_table_scenarios: {
        Row: {
          assumptions: Json;
          base_snapshot_id: string | null;
          company_id: string;
          computed_at: string | null;
          computed_data: Json | null;
          created_at: string;
          created_by: string | null;
          description: string | null;
          id: string;
          is_archived: boolean;
          name: string;
          org_id: string;
        };
        Insert: {
          assumptions: Json;
          base_snapshot_id?: string | null;
          company_id: string;
          computed_at?: string | null;
          computed_data?: Json | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_archived?: boolean;
          name: string;
          org_id: string;
        };
        Update: {
          assumptions?: Json;
          base_snapshot_id?: string | null;
          company_id?: string;
          computed_at?: string | null;
          computed_data?: Json | null;
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_archived?: boolean;
          name?: string;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'cap_table_scenarios_base_snapshot_id_fkey';
            columns: ['base_snapshot_id'];
            isOneToOne: false;
            referencedRelation: 'cap_table_snapshots';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cap_table_scenarios_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cap_table_scenarios_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      cap_table_snapshots: {
        Row: {
          company_id: string;
          created_at: string;
          created_by: string | null;
          data: Json;
          id: string;
          org_id: string;
          snapshot_date: string;
          snapshot_type: string;
          total_shares_fully_diluted: number | null;
          total_shares_outstanding: number | null;
          trigger_event: string | null;
        };
        Insert: {
          company_id: string;
          created_at?: string;
          created_by?: string | null;
          data: Json;
          id?: string;
          org_id: string;
          snapshot_date: string;
          snapshot_type: string;
          total_shares_fully_diluted?: number | null;
          total_shares_outstanding?: number | null;
          trigger_event?: string | null;
        };
        Update: {
          company_id?: string;
          created_at?: string;
          created_by?: string | null;
          data?: Json;
          id?: string;
          org_id?: string;
          snapshot_date?: string;
          snapshot_type?: string;
          total_shares_fully_diluted?: number | null;
          total_shares_outstanding?: number | null;
          trigger_event?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'cap_table_snapshots_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cap_table_snapshots_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      companies: {
        Row: {
          bspce_eligibility_assessed_at: string | null;
          bspce_eligibility_data: Json | null;
          country_code: string;
          created_at: string;
          deleted_at: string | null;
          founded_date: string | null;
          id: string;
          is_bspce_eligible: boolean;
          isin: string | null;
          legal_form: string | null;
          legal_name: string | null;
          name: string;
          org_id: string;
          share_capital: number | null;
          share_par_value: number | null;
          siren: string | null;
          ticker: string | null;
          total_shares_issued: number | null;
          updated_at: string;
        };
        Insert: {
          bspce_eligibility_assessed_at?: string | null;
          bspce_eligibility_data?: Json | null;
          country_code?: string;
          created_at?: string;
          deleted_at?: string | null;
          founded_date?: string | null;
          id?: string;
          is_bspce_eligible?: boolean;
          isin?: string | null;
          legal_form?: string | null;
          legal_name?: string | null;
          name: string;
          org_id: string;
          share_capital?: number | null;
          share_par_value?: number | null;
          siren?: string | null;
          ticker?: string | null;
          total_shares_issued?: number | null;
          updated_at?: string;
        };
        Update: {
          bspce_eligibility_assessed_at?: string | null;
          bspce_eligibility_data?: Json | null;
          country_code?: string;
          created_at?: string;
          deleted_at?: string | null;
          founded_date?: string | null;
          id?: string;
          is_bspce_eligible?: boolean;
          isin?: string | null;
          legal_form?: string | null;
          legal_name?: string | null;
          name?: string;
          org_id?: string;
          share_capital?: number | null;
          share_par_value?: number | null;
          siren?: string | null;
          ticker?: string | null;
          total_shares_issued?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'companies_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      compliance_alerts: {
        Row: {
          acknowledged_at: string | null;
          acknowledged_by: string | null;
          created_at: string;
          details: Json | null;
          id: string;
          message: string;
          org_id: string;
          resolution_note: string | null;
          resolved_at: string | null;
          rule_code: string;
          severity: string;
          status: string;
          subject_id: string;
          subject_type: string;
        };
        Insert: {
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          created_at?: string;
          details?: Json | null;
          id?: string;
          message: string;
          org_id: string;
          resolution_note?: string | null;
          resolved_at?: string | null;
          rule_code: string;
          severity: string;
          status?: string;
          subject_id: string;
          subject_type: string;
        };
        Update: {
          acknowledged_at?: string | null;
          acknowledged_by?: string | null;
          created_at?: string;
          details?: Json | null;
          id?: string;
          message?: string;
          org_id?: string;
          resolution_note?: string | null;
          resolved_at?: string | null;
          rule_code?: string;
          severity?: string;
          status?: string;
          subject_id?: string;
          subject_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'compliance_alerts_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      compliance_rules_catalog: {
        Row: {
          applies_to_plan_types: string[] | null;
          category: string;
          code: string;
          default_enforcement: string;
          description: string | null;
          is_active: boolean;
          jurisdiction: string;
          legal_reference: string | null;
          name: string;
        };
        Insert: {
          applies_to_plan_types?: string[] | null;
          category: string;
          code: string;
          default_enforcement?: string;
          description?: string | null;
          is_active?: boolean;
          jurisdiction?: string;
          legal_reference?: string | null;
          name: string;
        };
        Update: {
          applies_to_plan_types?: string[] | null;
          category?: string;
          code?: string;
          default_enforcement?: string;
          description?: string | null;
          is_active?: boolean;
          jurisdiction?: string;
          legal_reference?: string | null;
          name?: string;
        };
        Relationships: [];
      };
      compliance_rules_config: {
        Row: {
          custom_params: Json;
          enforcement: string;
          id: string;
          org_id: string;
          rule_code: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          custom_params?: Json;
          enforcement: string;
          id?: string;
          org_id: string;
          rule_code: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          custom_params?: Json;
          enforcement?: string;
          id?: string;
          org_id?: string;
          rule_code?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'compliance_rules_config_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'compliance_rules_config_rule_code_fkey';
            columns: ['rule_code'];
            isOneToOne: false;
            referencedRelation: 'compliance_rules_catalog';
            referencedColumns: ['code'];
          },
        ];
      };
      document_instances: {
        Row: {
          archived_at: string | null;
          category: string;
          created_at: string;
          document_number: string | null;
          file_size_bytes: number | null;
          generated_at: string | null;
          generated_by: string | null;
          id: string;
          org_id: string;
          proof_certificate_url: string | null;
          related_entity_id: string | null;
          related_entity_type: string | null;
          rendered_html: string | null;
          rendered_pdf_hash: string | null;
          rendered_pdf_url: string | null;
          signed_at: string | null;
          signed_pdf_storage_path: string | null;
          signed_pdf_url: string | null;
          status: string;
          storage_bucket: string | null;
          storage_path: string | null;
          template_id: string | null;
          template_version: number | null;
          title: string;
          updated_at: string;
          variables_used: Json | null;
          voided_at: string | null;
          voided_reason: string | null;
        };
        Insert: {
          archived_at?: string | null;
          category: string;
          created_at?: string;
          document_number?: string | null;
          file_size_bytes?: number | null;
          generated_at?: string | null;
          generated_by?: string | null;
          id?: string;
          org_id: string;
          proof_certificate_url?: string | null;
          related_entity_id?: string | null;
          related_entity_type?: string | null;
          rendered_html?: string | null;
          rendered_pdf_hash?: string | null;
          rendered_pdf_url?: string | null;
          signed_at?: string | null;
          signed_pdf_storage_path?: string | null;
          signed_pdf_url?: string | null;
          status?: string;
          storage_bucket?: string | null;
          storage_path?: string | null;
          template_id?: string | null;
          template_version?: number | null;
          title: string;
          updated_at?: string;
          variables_used?: Json | null;
          voided_at?: string | null;
          voided_reason?: string | null;
        };
        Update: {
          archived_at?: string | null;
          category?: string;
          created_at?: string;
          document_number?: string | null;
          file_size_bytes?: number | null;
          generated_at?: string | null;
          generated_by?: string | null;
          id?: string;
          org_id?: string;
          proof_certificate_url?: string | null;
          related_entity_id?: string | null;
          related_entity_type?: string | null;
          rendered_html?: string | null;
          rendered_pdf_hash?: string | null;
          rendered_pdf_url?: string | null;
          signed_at?: string | null;
          signed_pdf_storage_path?: string | null;
          signed_pdf_url?: string | null;
          status?: string;
          storage_bucket?: string | null;
          storage_path?: string | null;
          template_id?: string | null;
          template_version?: number | null;
          title?: string;
          updated_at?: string;
          variables_used?: Json | null;
          voided_at?: string | null;
          voided_reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'document_instances_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_instances_template_id_fkey';
            columns: ['template_id'];
            isOneToOne: false;
            referencedRelation: 'document_templates';
            referencedColumns: ['id'];
          },
        ];
      };
      document_templates: {
        Row: {
          applies_to_plan_types: string[] | null;
          available_variables: Json | null;
          category: string;
          code: string | null;
          content: Json;
          content_format: string;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          description: string | null;
          id: string;
          is_active: boolean;
          is_locked: boolean;
          name: string;
          org_id: string;
          parent_template_id: string | null;
          pdf_style: Json | null;
          signature_workflow: Json | null;
          supported_languages: string[] | null;
          template_engine: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          applies_to_plan_types?: string[] | null;
          available_variables?: Json | null;
          category: string;
          code?: string | null;
          content: Json;
          content_format?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_locked?: boolean;
          name: string;
          org_id: string;
          parent_template_id?: string | null;
          pdf_style?: Json | null;
          signature_workflow?: Json | null;
          supported_languages?: string[] | null;
          template_engine?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          applies_to_plan_types?: string[] | null;
          available_variables?: Json | null;
          category?: string;
          code?: string | null;
          content?: Json;
          content_format?: string;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_locked?: boolean;
          name?: string;
          org_id?: string;
          parent_template_id?: string | null;
          pdf_style?: Json | null;
          signature_workflow?: Json | null;
          supported_languages?: string[] | null;
          template_engine?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'document_templates_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_templates_parent_template_id_fkey';
            columns: ['parent_template_id'];
            isOneToOne: false;
            referencedRelation: 'document_templates';
            referencedColumns: ['id'];
          },
        ];
      };
      early_termination_rules: {
        Row: {
          acceleration_months: number | null;
          created_at: string;
          custom_logic: Json | null;
          exercise_window_days: number | null;
          id: string;
          leaver_type: string;
          org_id: string;
          plan_id: string;
          treatment: string;
        };
        Insert: {
          acceleration_months?: number | null;
          created_at?: string;
          custom_logic?: Json | null;
          exercise_window_days?: number | null;
          id?: string;
          leaver_type: string;
          org_id: string;
          plan_id: string;
          treatment: string;
        };
        Update: {
          acceleration_months?: number | null;
          created_at?: string;
          custom_logic?: Json | null;
          exercise_window_days?: number | null;
          id?: string;
          leaver_type?: string;
          org_id?: string;
          plan_id?: string;
          treatment?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'early_termination_rules_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'early_termination_rules_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
        ];
      };
      exercise_requests: {
        Row: {
          admin_notes: string | null;
          approved_at: string | null;
          approved_by: string | null;
          award_id: string;
          beneficiary_id: string;
          beneficiary_notes: string | null;
          certificate_document_id: string | null;
          certificate_issued_at: string | null;
          completed_at: string | null;
          compliance_checks: Json;
          created_at: string;
          exercise_price_per_unit: number;
          fmv_per_unit_at_request: number | null;
          id: string;
          is_within_exercise_window: boolean;
          org_id: string;
          payment_received_at: string | null;
          payment_reference: string | null;
          rejected_reason: string | null;
          request_number: string | null;
          requested_at: string;
          status: string;
          total_exercise_amount: number | null;
          units_to_exercise: number;
          updated_at: string;
        };
        Insert: {
          admin_notes?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          award_id: string;
          beneficiary_id: string;
          beneficiary_notes?: string | null;
          certificate_document_id?: string | null;
          certificate_issued_at?: string | null;
          completed_at?: string | null;
          compliance_checks?: Json;
          created_at?: string;
          exercise_price_per_unit: number;
          fmv_per_unit_at_request?: number | null;
          id?: string;
          is_within_exercise_window?: boolean;
          org_id: string;
          payment_received_at?: string | null;
          payment_reference?: string | null;
          rejected_reason?: string | null;
          request_number?: string | null;
          requested_at?: string;
          status?: string;
          total_exercise_amount?: number | null;
          units_to_exercise: number;
          updated_at?: string;
        };
        Update: {
          admin_notes?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          award_id?: string;
          beneficiary_id?: string;
          beneficiary_notes?: string | null;
          certificate_document_id?: string | null;
          certificate_issued_at?: string | null;
          completed_at?: string | null;
          compliance_checks?: Json;
          created_at?: string;
          exercise_price_per_unit?: number;
          fmv_per_unit_at_request?: number | null;
          id?: string;
          is_within_exercise_window?: boolean;
          org_id?: string;
          payment_received_at?: string | null;
          payment_reference?: string | null;
          rejected_reason?: string | null;
          request_number?: string | null;
          requested_at?: string;
          status?: string;
          total_exercise_amount?: number | null;
          units_to_exercise?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'exercise_requests_award_id_fkey';
            columns: ['award_id'];
            isOneToOne: false;
            referencedRelation: 'awards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'exercise_requests_beneficiary_id_fkey';
            columns: ['beneficiary_id'];
            isOneToOne: false;
            referencedRelation: 'beneficiaries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'exercise_requests_certificate_document_id_fkey';
            columns: ['certificate_document_id'];
            isOneToOne: false;
            referencedRelation: 'document_instances';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'exercise_requests_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      feature_flags: {
        Row: {
          config: Json | null;
          flag_code: string;
          id: string;
          is_enabled: boolean;
          org_id: string | null;
        };
        Insert: {
          config?: Json | null;
          flag_code: string;
          id?: string;
          is_enabled?: boolean;
          org_id?: string | null;
        };
        Update: {
          config?: Json | null;
          flag_code?: string;
          id?: string;
          is_enabled?: boolean;
          org_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'feature_flags_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      hypothesis_sets: {
        Row: {
          as_of_date: string | null;
          company_id: string | null;
          correlation_override: number | null;
          created_at: string;
          currency: string | null;
          dividend_amount: number | null;
          dividend_input_mode: string | null;
          dividend_yield: number | null;
          id: string;
          lookback_days: number | null;
          model_choice: string | null;
          multi_asset_params: Json | null;
          name: string | null;
          org_id: string | null;
          parameters: Json | null;
          plan_id: string | null;
          rate_flat: number | null;
          s0: number | null;
          ticker_override: string | null;
          time_horizon_years: number | null;
          underlying_model: string | null;
          updated_at: string;
          vol_method: string | null;
          volatility: number | null;
          volatility_price_type: string | null;
          volatility_winsorizing_pct: number | null;
        };
        Insert: {
          as_of_date?: string | null;
          company_id?: string | null;
          correlation_override?: number | null;
          created_at?: string;
          currency?: string | null;
          dividend_amount?: number | null;
          dividend_input_mode?: string | null;
          dividend_yield?: number | null;
          id?: string;
          lookback_days?: number | null;
          model_choice?: string | null;
          multi_asset_params?: Json | null;
          name?: string | null;
          org_id?: string | null;
          parameters?: Json | null;
          plan_id?: string | null;
          rate_flat?: number | null;
          s0?: number | null;
          ticker_override?: string | null;
          time_horizon_years?: number | null;
          underlying_model?: string | null;
          updated_at?: string;
          vol_method?: string | null;
          volatility?: number | null;
          volatility_price_type?: string | null;
          volatility_winsorizing_pct?: number | null;
        };
        Update: {
          as_of_date?: string | null;
          company_id?: string | null;
          correlation_override?: number | null;
          created_at?: string;
          currency?: string | null;
          dividend_amount?: number | null;
          dividend_input_mode?: string | null;
          dividend_yield?: number | null;
          id?: string;
          lookback_days?: number | null;
          model_choice?: string | null;
          multi_asset_params?: Json | null;
          name?: string | null;
          org_id?: string | null;
          parameters?: Json | null;
          plan_id?: string | null;
          rate_flat?: number | null;
          s0?: number | null;
          ticker_override?: string | null;
          time_horizon_years?: number | null;
          underlying_model?: string | null;
          updated_at?: string;
          vol_method?: string | null;
          volatility?: number | null;
          volatility_price_type?: string | null;
          volatility_winsorizing_pct?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'hypothesis_sets_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'hypothesis_sets_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
        ];
      };
      ifrs2_expense_periods: {
        Row: {
          created_at: string;
          expense_amount: number | null;
          id: string;
          period_end: string | null;
          period_start: string | null;
          schedule_id: string;
        };
        Insert: {
          created_at?: string;
          expense_amount?: number | null;
          id?: string;
          period_end?: string | null;
          period_start?: string | null;
          schedule_id: string;
        };
        Update: {
          created_at?: string;
          expense_amount?: number | null;
          id?: string;
          period_end?: string | null;
          period_start?: string | null;
          schedule_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ifrs2_expense_periods_schedule_id_fkey';
            columns: ['schedule_id'];
            isOneToOne: false;
            referencedRelation: 'ifrs2_expense_schedules';
            referencedColumns: ['id'];
          },
        ];
      };
      ifrs2_expense_schedules: {
        Row: {
          award_id: string | null;
          created_at: string;
          id: string;
          org_id: string | null;
          parameters: Json | null;
          plan_id: string | null;
          total_expense: number | null;
          valuation_run_id: string | null;
        };
        Insert: {
          award_id?: string | null;
          created_at?: string;
          id?: string;
          org_id?: string | null;
          parameters?: Json | null;
          plan_id?: string | null;
          total_expense?: number | null;
          valuation_run_id?: string | null;
        };
        Update: {
          award_id?: string | null;
          created_at?: string;
          id?: string;
          org_id?: string | null;
          parameters?: Json | null;
          plan_id?: string | null;
          total_expense?: number | null;
          valuation_run_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'ifrs2_expense_schedules_award_id_fkey';
            columns: ['award_id'];
            isOneToOne: false;
            referencedRelation: 'awards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ifrs2_expense_schedules_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ifrs2_expense_schedules_valuation_run_id_fkey';
            columns: ['valuation_run_id'];
            isOneToOne: false;
            referencedRelation: 'valuation_runs';
            referencedColumns: ['id'];
          },
        ];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          beneficiary_id: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          message: string | null;
          org_id: string;
          roles: string[];
          status: string;
          token: string;
        };
        Insert: {
          accepted_at?: string | null;
          beneficiary_id?: string | null;
          created_at?: string;
          email: string;
          expires_at: string;
          id?: string;
          invited_by?: string | null;
          message?: string | null;
          org_id: string;
          roles: string[];
          status?: string;
          token: string;
        };
        Update: {
          accepted_at?: string | null;
          beneficiary_id?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          message?: string | null;
          org_id?: string;
          roles?: string[];
          status?: string;
          token?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'invitations_beneficiary_id_fkey';
            columns: ['beneficiary_id'];
            isOneToOne: false;
            referencedRelation: 'beneficiaries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'invitations_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      memberships: {
        Row: {
          accepted_at: string | null;
          created_at: string;
          id: string;
          invited_at: string | null;
          invited_by: string | null;
          org_id: string;
          permissions_grant: string[];
          permissions_revoke: string[];
          roles: string[];
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          accepted_at?: string | null;
          created_at?: string;
          id?: string;
          invited_at?: string | null;
          invited_by?: string | null;
          org_id: string;
          permissions_grant?: string[];
          permissions_revoke?: string[];
          roles?: string[];
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          accepted_at?: string | null;
          created_at?: string;
          id?: string;
          invited_at?: string | null;
          invited_by?: string | null;
          org_id?: string;
          permissions_grant?: string[];
          permissions_revoke?: string[];
          roles?: string[];
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'memberships_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_templates: {
        Row: {
          available_variables: Json | null;
          body_template: string;
          channel: string;
          code: string;
          is_active: boolean;
          locale: string;
          subject: string | null;
        };
        Insert: {
          available_variables?: Json | null;
          body_template: string;
          channel: string;
          code: string;
          is_active?: boolean;
          locale?: string;
          subject?: string | null;
        };
        Update: {
          available_variables?: Json | null;
          body_template?: string;
          channel?: string;
          code?: string;
          is_active?: boolean;
          locale?: string;
          subject?: string | null;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          beneficiary_id: string | null;
          body: string | null;
          channel: string;
          created_at: string;
          delivered_at: string | null;
          failed_at: string | null;
          failure_reason: string | null;
          id: string;
          org_id: string | null;
          provider: string | null;
          provider_message_id: string | null;
          provider_response: Json | null;
          read_at: string | null;
          recipient_email: string | null;
          recipient_phone: string | null;
          related_entity_id: string | null;
          related_entity_type: string | null;
          sent_at: string | null;
          status: string;
          subject: string | null;
          template_code: string | null;
          user_id: string | null;
          variables_used: Json | null;
        };
        Insert: {
          beneficiary_id?: string | null;
          body?: string | null;
          channel: string;
          created_at?: string;
          delivered_at?: string | null;
          failed_at?: string | null;
          failure_reason?: string | null;
          id?: string;
          org_id?: string | null;
          provider?: string | null;
          provider_message_id?: string | null;
          provider_response?: Json | null;
          read_at?: string | null;
          recipient_email?: string | null;
          recipient_phone?: string | null;
          related_entity_id?: string | null;
          related_entity_type?: string | null;
          sent_at?: string | null;
          status?: string;
          subject?: string | null;
          template_code?: string | null;
          user_id?: string | null;
          variables_used?: Json | null;
        };
        Update: {
          beneficiary_id?: string | null;
          body?: string | null;
          channel?: string;
          created_at?: string;
          delivered_at?: string | null;
          failed_at?: string | null;
          failure_reason?: string | null;
          id?: string;
          org_id?: string | null;
          provider?: string | null;
          provider_message_id?: string | null;
          provider_response?: Json | null;
          read_at?: string | null;
          recipient_email?: string | null;
          recipient_phone?: string | null;
          related_entity_id?: string | null;
          related_entity_type?: string | null;
          sent_at?: string | null;
          status?: string;
          subject?: string | null;
          template_code?: string | null;
          user_id?: string | null;
          variables_used?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_beneficiary_id_fkey';
            columns: ['beneficiary_id'];
            isOneToOne: false;
            referencedRelation: 'beneficiaries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_template_code_fkey';
            columns: ['template_code'];
            isOneToOne: false;
            referencedRelation: 'notification_templates';
            referencedColumns: ['code'];
          },
        ];
      };
      operation_log: {
        Row: {
          created_at: string;
          idempotency_key: string;
          operation: string;
          org_id: string | null;
          request_payload: Json | null;
          response_payload: Json | null;
          response_status: number | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          idempotency_key: string;
          operation: string;
          org_id?: string | null;
          request_payload?: Json | null;
          response_payload?: Json | null;
          response_status?: number | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          idempotency_key?: string;
          operation?: string;
          org_id?: string | null;
          request_payload?: Json | null;
          response_payload?: Json | null;
          response_status?: number | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'operation_log_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          created_by: string | null;
          default_currency: string;
          default_locale: string;
          deleted_at: string | null;
          fiscal_year_end_month: number;
          id: string;
          legal_form: string | null;
          legal_name: string | null;
          name: string;
          plan_tier: string;
          registered_address: Json | null;
          settings: Json;
          siren: string | null;
          slug: string;
          stripe_customer_id: string | null;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          default_currency?: string;
          default_locale?: string;
          deleted_at?: string | null;
          fiscal_year_end_month?: number;
          id?: string;
          legal_form?: string | null;
          legal_name?: string | null;
          name: string;
          plan_tier?: string;
          registered_address?: Json | null;
          settings?: Json;
          siren?: string | null;
          slug: string;
          stripe_customer_id?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          default_currency?: string;
          default_locale?: string;
          deleted_at?: string | null;
          fiscal_year_end_month?: number;
          id?: string;
          legal_form?: string | null;
          legal_name?: string | null;
          name?: string;
          plan_tier?: string;
          registered_address?: Json | null;
          settings?: Json;
          siren?: string | null;
          slug?: string;
          stripe_customer_id?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      performance_conditions: {
        Row: {
          acquisition_scale: Json | null;
          category: string | null;
          comparison_method: string | null;
          comparison_operator: string | null;
          condition_type: string | null;
          created_at: string;
          enable_partial_scoring: boolean;
          end_averaging_days: number | null;
          end_fixed_price: number | null;
          end_price_method: string | null;
          id: string;
          market_metric_type: string | null;
          measurement_period_years: number | null;
          metric: string | null;
          name: string | null;
          org_id: string | null;
          parameters: Json | null;
          peer_group: Json | null;
          performance_end_date: string | null;
          performance_start_date: string | null;
          plan_id: string | null;
          reference_index: string | null;
          reference_index_display_name: string | null;
          start_averaging_days: number | null;
          start_fixed_price: number | null;
          start_price_method: string | null;
          target_unit: string | null;
          target_value: string | null;
          threshold_max: number | null;
          threshold_min: number | null;
          updated_at: string;
          weight: number | null;
          weighted_peer_groups: Json | null;
        };
        Insert: {
          acquisition_scale?: Json | null;
          category?: string | null;
          comparison_method?: string | null;
          comparison_operator?: string | null;
          condition_type?: string | null;
          created_at?: string;
          enable_partial_scoring?: boolean;
          end_averaging_days?: number | null;
          end_fixed_price?: number | null;
          end_price_method?: string | null;
          id?: string;
          market_metric_type?: string | null;
          measurement_period_years?: number | null;
          metric?: string | null;
          name?: string | null;
          org_id?: string | null;
          parameters?: Json | null;
          peer_group?: Json | null;
          performance_end_date?: string | null;
          performance_start_date?: string | null;
          plan_id?: string | null;
          reference_index?: string | null;
          reference_index_display_name?: string | null;
          start_averaging_days?: number | null;
          start_fixed_price?: number | null;
          start_price_method?: string | null;
          target_unit?: string | null;
          target_value?: string | null;
          threshold_max?: number | null;
          threshold_min?: number | null;
          updated_at?: string;
          weight?: number | null;
          weighted_peer_groups?: Json | null;
        };
        Update: {
          acquisition_scale?: Json | null;
          category?: string | null;
          comparison_method?: string | null;
          comparison_operator?: string | null;
          condition_type?: string | null;
          created_at?: string;
          enable_partial_scoring?: boolean;
          end_averaging_days?: number | null;
          end_fixed_price?: number | null;
          end_price_method?: string | null;
          id?: string;
          market_metric_type?: string | null;
          measurement_period_years?: number | null;
          metric?: string | null;
          name?: string | null;
          org_id?: string | null;
          parameters?: Json | null;
          peer_group?: Json | null;
          performance_end_date?: string | null;
          performance_start_date?: string | null;
          plan_id?: string | null;
          reference_index?: string | null;
          reference_index_display_name?: string | null;
          start_averaging_days?: number | null;
          start_fixed_price?: number | null;
          start_price_method?: string | null;
          target_unit?: string | null;
          target_value?: string | null;
          threshold_max?: number | null;
          threshold_min?: number | null;
          updated_at?: string;
          weight?: number | null;
          weighted_peer_groups?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'performance_conditions_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
        ];
      };
      permissions_catalog: {
        Row: {
          category: string;
          code: string;
          description: string | null;
          is_dangerous: boolean;
        };
        Insert: {
          category: string;
          code: string;
          description?: string | null;
          is_dangerous?: boolean;
        };
        Update: {
          category?: string;
          code?: string;
          description?: string | null;
          is_dangerous?: boolean;
        };
        Relationships: [];
      };
      plan_drafts: {
        Row: {
          created_at: string;
          data: Json;
          id: string;
          org_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          data: Json;
          id?: string;
          org_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          data?: Json;
          id?: string;
          org_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'plan_drafts_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      plans: {
        Row: {
          board_date: string | null;
          company_id: string;
          compliance_warnings: Json;
          created_at: string;
          created_by: string | null;
          deleted_at: string | null;
          description: string | null;
          exercise_price: number | null;
          grant_date: string;
          id: string;
          is_locked: boolean;
          locked_at: string | null;
          name: string;
          org_id: string;
          parent_plan_id: string | null;
          performance_combination_type: string;
          performance_evaluation_moment: string;
          performance_failure_action: string;
          plan_rules_template_id: string | null;
          plan_type: string;
          pool_allocated: number;
          pool_cancelled: number;
          pool_exercised: number;
          pool_size: number;
          pool_vested: number;
          reference_share_price: number | null;
          settlement_type: string;
          shareholder_authorization_expires_at: string | null;
          shareholder_meeting_date: string | null;
          status: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          board_date?: string | null;
          company_id: string;
          compliance_warnings?: Json;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          exercise_price?: number | null;
          grant_date: string;
          id?: string;
          is_locked?: boolean;
          locked_at?: string | null;
          name: string;
          org_id: string;
          parent_plan_id?: string | null;
          performance_combination_type?: string;
          performance_evaluation_moment?: string;
          performance_failure_action?: string;
          plan_rules_template_id?: string | null;
          plan_type: string;
          pool_allocated?: number;
          pool_cancelled?: number;
          pool_exercised?: number;
          pool_size: number;
          pool_vested?: number;
          reference_share_price?: number | null;
          settlement_type?: string;
          shareholder_authorization_expires_at?: string | null;
          shareholder_meeting_date?: string | null;
          status?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          board_date?: string | null;
          company_id?: string;
          compliance_warnings?: Json;
          created_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          exercise_price?: number | null;
          grant_date?: string;
          id?: string;
          is_locked?: boolean;
          locked_at?: string | null;
          name?: string;
          org_id?: string;
          parent_plan_id?: string | null;
          performance_combination_type?: string;
          performance_evaluation_moment?: string;
          performance_failure_action?: string;
          plan_rules_template_id?: string | null;
          plan_type?: string;
          pool_allocated?: number;
          pool_cancelled?: number;
          pool_exercised?: number;
          pool_size?: number;
          pool_vested?: number;
          reference_share_price?: number | null;
          settlement_type?: string;
          shareholder_authorization_expires_at?: string | null;
          shareholder_meeting_date?: string | null;
          status?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'plans_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plans_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plans_parent_plan_id_fkey';
            columns: ['parent_plan_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plans_plan_rules_template_id_fkey';
            columns: ['plan_rules_template_id'];
            isOneToOne: false;
            referencedRelation: 'document_templates';
            referencedColumns: ['id'];
          },
        ];
      };
      reports: {
        Row: {
          created_at: string;
          error_message: string | null;
          expires_at: string | null;
          generated_at: string | null;
          generated_by: string | null;
          id: string;
          org_id: string;
          output_format: string | null;
          output_hash: string | null;
          output_url: string | null;
          parameters: Json | null;
          period_end: string | null;
          period_start: string | null;
          report_type: string;
          status: string;
        };
        Insert: {
          created_at?: string;
          error_message?: string | null;
          expires_at?: string | null;
          generated_at?: string | null;
          generated_by?: string | null;
          id?: string;
          org_id: string;
          output_format?: string | null;
          output_hash?: string | null;
          output_url?: string | null;
          parameters?: Json | null;
          period_end?: string | null;
          period_start?: string | null;
          report_type: string;
          status?: string;
        };
        Update: {
          created_at?: string;
          error_message?: string | null;
          expires_at?: string | null;
          generated_at?: string | null;
          generated_by?: string | null;
          id?: string;
          org_id?: string;
          output_format?: string | null;
          output_hash?: string | null;
          output_url?: string | null;
          parameters?: Json | null;
          period_end?: string | null;
          period_start?: string | null;
          report_type?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reports_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      role_permissions: {
        Row: {
          permission_code: string;
          role: string;
        };
        Insert: {
          permission_code: string;
          role: string;
        };
        Update: {
          permission_code?: string;
          role?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'role_permissions_permission_code_fkey';
            columns: ['permission_code'];
            isOneToOne: false;
            referencedRelation: 'permissions_catalog';
            referencedColumns: ['code'];
          },
        ];
      };
      securities: {
        Row: {
          anti_dilution_type: string | null;
          cancelled_at: string | null;
          company_id: string;
          conversion_ratio: number;
          created_at: string;
          holder_beneficiary_id: string | null;
          holder_legal_id: string | null;
          holder_name: string | null;
          holder_type: string;
          id: string;
          issuance_date: string | null;
          issue_price: number | null;
          liquidation_preference_multiple: number | null;
          liquidation_preference_type: string | null;
          notes: string | null;
          org_id: string;
          par_value: number | null;
          security_type: string;
          series_name: string | null;
          source_award_id: string | null;
          source_round_id: string | null;
          status: string;
          total_units: number;
        };
        Insert: {
          anti_dilution_type?: string | null;
          cancelled_at?: string | null;
          company_id: string;
          conversion_ratio?: number;
          created_at?: string;
          holder_beneficiary_id?: string | null;
          holder_legal_id?: string | null;
          holder_name?: string | null;
          holder_type: string;
          id?: string;
          issuance_date?: string | null;
          issue_price?: number | null;
          liquidation_preference_multiple?: number | null;
          liquidation_preference_type?: string | null;
          notes?: string | null;
          org_id: string;
          par_value?: number | null;
          security_type: string;
          series_name?: string | null;
          source_award_id?: string | null;
          source_round_id?: string | null;
          status?: string;
          total_units: number;
        };
        Update: {
          anti_dilution_type?: string | null;
          cancelled_at?: string | null;
          company_id?: string;
          conversion_ratio?: number;
          created_at?: string;
          holder_beneficiary_id?: string | null;
          holder_legal_id?: string | null;
          holder_name?: string | null;
          holder_type?: string;
          id?: string;
          issuance_date?: string | null;
          issue_price?: number | null;
          liquidation_preference_multiple?: number | null;
          liquidation_preference_type?: string | null;
          notes?: string | null;
          org_id?: string;
          par_value?: number | null;
          security_type?: string;
          series_name?: string | null;
          source_award_id?: string | null;
          source_round_id?: string | null;
          status?: string;
          total_units?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'securities_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'securities_holder_beneficiary_id_fkey';
            columns: ['holder_beneficiary_id'];
            isOneToOne: false;
            referencedRelation: 'beneficiaries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'securities_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'securities_source_award_id_fkey';
            columns: ['source_award_id'];
            isOneToOne: false;
            referencedRelation: 'awards';
            referencedColumns: ['id'];
          },
        ];
      };
      signature_requests: {
        Row: {
          completed_at: string | null;
          created_at: string;
          document_id: string;
          expiry_date: string | null;
          id: string;
          org_id: string;
          proof_certificate_url: string | null;
          reminder_settings: Json | null;
          sent_at: string | null;
          signing_order: string | null;
          status: string;
          webhook_payload_history: Json;
          yousign_environment: string | null;
          yousign_procedure_id: string | null;
          yousign_signature_request_id: string | null;
          yousign_workflow_status: string | null;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          document_id: string;
          expiry_date?: string | null;
          id?: string;
          org_id: string;
          proof_certificate_url?: string | null;
          reminder_settings?: Json | null;
          sent_at?: string | null;
          signing_order?: string | null;
          status?: string;
          webhook_payload_history?: Json;
          yousign_environment?: string | null;
          yousign_procedure_id?: string | null;
          yousign_signature_request_id?: string | null;
          yousign_workflow_status?: string | null;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          document_id?: string;
          expiry_date?: string | null;
          id?: string;
          org_id?: string;
          proof_certificate_url?: string | null;
          reminder_settings?: Json | null;
          sent_at?: string | null;
          signing_order?: string | null;
          status?: string;
          webhook_payload_history?: Json;
          yousign_environment?: string | null;
          yousign_procedure_id?: string | null;
          yousign_signature_request_id?: string | null;
          yousign_workflow_status?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'signature_requests_document_id_fkey';
            columns: ['document_id'];
            isOneToOne: false;
            referencedRelation: 'document_instances';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'signature_requests_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      signers: {
        Row: {
          beneficiary_id: string | null;
          created_at: string;
          decline_reason: string | null;
          email: string;
          full_name: string;
          id: string;
          invited_at: string | null;
          ip_address: unknown;
          org_id: string;
          phone: string | null;
          role_in_signature: string | null;
          signature_method: string | null;
          signature_request_id: string;
          signed_at: string | null;
          signing_order: number | null;
          status: string;
          user_id: string | null;
          viewed_at: string | null;
          yousign_sign_url: string | null;
          yousign_signer_id: string | null;
        };
        Insert: {
          beneficiary_id?: string | null;
          created_at?: string;
          decline_reason?: string | null;
          email: string;
          full_name: string;
          id?: string;
          invited_at?: string | null;
          ip_address?: unknown;
          org_id: string;
          phone?: string | null;
          role_in_signature?: string | null;
          signature_method?: string | null;
          signature_request_id: string;
          signed_at?: string | null;
          signing_order?: number | null;
          status?: string;
          user_id?: string | null;
          viewed_at?: string | null;
          yousign_sign_url?: string | null;
          yousign_signer_id?: string | null;
        };
        Update: {
          beneficiary_id?: string | null;
          created_at?: string;
          decline_reason?: string | null;
          email?: string;
          full_name?: string;
          id?: string;
          invited_at?: string | null;
          ip_address?: unknown;
          org_id?: string;
          phone?: string | null;
          role_in_signature?: string | null;
          signature_method?: string | null;
          signature_request_id?: string;
          signed_at?: string | null;
          signing_order?: number | null;
          status?: string;
          user_id?: string | null;
          viewed_at?: string | null;
          yousign_sign_url?: string | null;
          yousign_signer_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'signers_beneficiary_id_fkey';
            columns: ['beneficiary_id'];
            isOneToOne: false;
            referencedRelation: 'beneficiaries';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'signers_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'signers_signature_request_id_fkey';
            columns: ['signature_request_id'];
            isOneToOne: false;
            referencedRelation: 'signature_requests';
            referencedColumns: ['id'];
          },
        ];
      };
      simulation_configs: {
        Row: {
          antithetic_variates: boolean;
          created_at: string;
          effective_model: string | null;
          heston_params: Json | null;
          hypothesis_set_id: string | null;
          id: string;
          jump_params: Json | null;
          name: string | null;
          num_paths: number | null;
          org_id: string | null;
          parameters: Json | null;
          pricer_type: string | null;
          steps_per_year: number | null;
          time_horizon_years: number | null;
          underlying_model: string | null;
          updated_at: string;
        };
        Insert: {
          antithetic_variates?: boolean;
          created_at?: string;
          effective_model?: string | null;
          heston_params?: Json | null;
          hypothesis_set_id?: string | null;
          id?: string;
          jump_params?: Json | null;
          name?: string | null;
          num_paths?: number | null;
          org_id?: string | null;
          parameters?: Json | null;
          pricer_type?: string | null;
          steps_per_year?: number | null;
          time_horizon_years?: number | null;
          underlying_model?: string | null;
          updated_at?: string;
        };
        Update: {
          antithetic_variates?: boolean;
          created_at?: string;
          effective_model?: string | null;
          heston_params?: Json | null;
          hypothesis_set_id?: string | null;
          id?: string;
          jump_params?: Json | null;
          name?: string | null;
          num_paths?: number | null;
          org_id?: string | null;
          parameters?: Json | null;
          pricer_type?: string | null;
          steps_per_year?: number | null;
          time_horizon_years?: number | null;
          underlying_model?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'simulation_configs_hypothesis_set_id_fkey';
            columns: ['hypothesis_set_id'];
            isOneToOne: false;
            referencedRelation: 'hypothesis_sets';
            referencedColumns: ['id'];
          },
        ];
      };
      user_profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          default_org_id: string | null;
          deleted_at: string | null;
          email: string;
          full_name: string | null;
          id: string;
          phone: string | null;
          preferences: Json;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          default_org_id?: string | null;
          deleted_at?: string | null;
          email: string;
          full_name?: string | null;
          id: string;
          phone?: string | null;
          preferences?: Json;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          default_org_id?: string | null;
          deleted_at?: string | null;
          email?: string;
          full_name?: string | null;
          id?: string;
          phone?: string | null;
          preferences?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_profiles_default_org_id_fkey';
            columns: ['default_org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
        ];
      };
      valuation_award_results: {
        Row: {
          audit_data: Json | null;
          award_id: string;
          computed_at: string;
          fair_value_per_unit: number;
          id: string;
          org_id: string;
          total_fair_value: number;
          valuation_run_id: string;
          vesting_probability: number | null;
        };
        Insert: {
          audit_data?: Json | null;
          award_id: string;
          computed_at?: string;
          fair_value_per_unit: number;
          id?: string;
          org_id: string;
          total_fair_value: number;
          valuation_run_id: string;
          vesting_probability?: number | null;
        };
        Update: {
          audit_data?: Json | null;
          award_id?: string;
          computed_at?: string;
          fair_value_per_unit?: number;
          id?: string;
          org_id?: string;
          total_fair_value?: number;
          valuation_run_id?: string;
          vesting_probability?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'valuation_award_results_award_id_fkey';
            columns: ['award_id'];
            isOneToOne: false;
            referencedRelation: 'awards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'valuation_award_results_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'valuation_award_results_valuation_run_id_fkey';
            columns: ['valuation_run_id'];
            isOneToOne: false;
            referencedRelation: 'valuation_runs';
            referencedColumns: ['id'];
          },
        ];
      };
      valuation_results: {
        Row: {
          audit_data: Json | null;
          ci95_high: number | null;
          ci95_low: number | null;
          computed_at: string;
          distribution_stats: Json | null;
          fair_value: number | null;
          fair_value_per_instrument: number | null;
          fair_value_total: number | null;
          id: string;
          market_data_snapshot: Json | null;
          org_id: string | null;
          sensitivities: Json | null;
          std_error: number | null;
          valuation_run_id: string;
        };
        Insert: {
          audit_data?: Json | null;
          ci95_high?: number | null;
          ci95_low?: number | null;
          computed_at?: string;
          distribution_stats?: Json | null;
          fair_value?: number | null;
          fair_value_per_instrument?: number | null;
          fair_value_total?: number | null;
          id?: string;
          market_data_snapshot?: Json | null;
          org_id?: string | null;
          sensitivities?: Json | null;
          std_error?: number | null;
          valuation_run_id: string;
        };
        Update: {
          audit_data?: Json | null;
          ci95_high?: number | null;
          ci95_low?: number | null;
          computed_at?: string;
          distribution_stats?: Json | null;
          fair_value?: number | null;
          fair_value_per_instrument?: number | null;
          fair_value_total?: number | null;
          id?: string;
          market_data_snapshot?: Json | null;
          org_id?: string | null;
          sensitivities?: Json | null;
          std_error?: number | null;
          valuation_run_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'valuation_results_valuation_run_id_fkey';
            columns: ['valuation_run_id'];
            isOneToOne: false;
            referencedRelation: 'valuation_runs';
            referencedColumns: ['id'];
          },
        ];
      };
      valuation_runs: {
        Row: {
          completed_at: string | null;
          created_at: string;
          engine_version: string | null;
          error_message: string | null;
          id: string;
          org_id: string | null;
          parameters: Json | null;
          plan_id: string | null;
          pricer_used: string | null;
          results_json: Json | null;
          simulation_config_id: string | null;
          started_at: string | null;
          status: string | null;
          triggered_by: string | null;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          engine_version?: string | null;
          error_message?: string | null;
          id?: string;
          org_id?: string | null;
          parameters?: Json | null;
          plan_id?: string | null;
          pricer_used?: string | null;
          results_json?: Json | null;
          simulation_config_id?: string | null;
          started_at?: string | null;
          status?: string | null;
          triggered_by?: string | null;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          engine_version?: string | null;
          error_message?: string | null;
          id?: string;
          org_id?: string | null;
          parameters?: Json | null;
          plan_id?: string | null;
          pricer_used?: string | null;
          results_json?: Json | null;
          simulation_config_id?: string | null;
          started_at?: string | null;
          status?: string | null;
          triggered_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'valuation_runs_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'valuation_runs_simulation_config_id_fkey';
            columns: ['simulation_config_id'];
            isOneToOne: false;
            referencedRelation: 'simulation_configs';
            referencedColumns: ['id'];
          },
        ];
      };
      vesting_events: {
        Row: {
          award_id: string;
          created_at: string;
          effective_date: string | null;
          id: string;
          notification_sent_at: string | null;
          org_id: string;
          performance_assessed_at: string | null;
          performance_assessment_data: Json | null;
          performance_multiplier: number;
          scheduled_date: string;
          status: string;
          tranche_id: string | null;
          units_to_vest: number;
          units_vested: number;
          updated_at: string;
        };
        Insert: {
          award_id: string;
          created_at?: string;
          effective_date?: string | null;
          id?: string;
          notification_sent_at?: string | null;
          org_id: string;
          performance_assessed_at?: string | null;
          performance_assessment_data?: Json | null;
          performance_multiplier?: number;
          scheduled_date: string;
          status?: string;
          tranche_id?: string | null;
          units_to_vest: number;
          units_vested?: number;
          updated_at?: string;
        };
        Update: {
          award_id?: string;
          created_at?: string;
          effective_date?: string | null;
          id?: string;
          notification_sent_at?: string | null;
          org_id?: string;
          performance_assessed_at?: string | null;
          performance_assessment_data?: Json | null;
          performance_multiplier?: number;
          scheduled_date?: string;
          status?: string;
          tranche_id?: string | null;
          units_to_vest?: number;
          units_vested?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vesting_events_award_id_fkey';
            columns: ['award_id'];
            isOneToOne: false;
            referencedRelation: 'awards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vesting_events_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'organizations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vesting_events_tranche_id_fkey';
            columns: ['tranche_id'];
            isOneToOne: false;
            referencedRelation: 'vesting_tranches';
            referencedColumns: ['id'];
          },
        ];
      };
      vesting_schedules: {
        Row: {
          cliff_months: number | null;
          cliff_percentage: number | null;
          created_at: string;
          custom_data: Json | null;
          description: string | null;
          frequency: string | null;
          id: string;
          is_template: boolean;
          linear_after_cliff: boolean | null;
          name: string | null;
          org_id: string | null;
          plan_id: string | null;
          single_vesting_date: string | null;
          total_months: number | null;
          updated_at: string;
          vesting_type: string | null;
        };
        Insert: {
          cliff_months?: number | null;
          cliff_percentage?: number | null;
          created_at?: string;
          custom_data?: Json | null;
          description?: string | null;
          frequency?: string | null;
          id?: string;
          is_template?: boolean;
          linear_after_cliff?: boolean | null;
          name?: string | null;
          org_id?: string | null;
          plan_id?: string | null;
          single_vesting_date?: string | null;
          total_months?: number | null;
          updated_at?: string;
          vesting_type?: string | null;
        };
        Update: {
          cliff_months?: number | null;
          cliff_percentage?: number | null;
          created_at?: string;
          custom_data?: Json | null;
          description?: string | null;
          frequency?: string | null;
          id?: string;
          is_template?: boolean;
          linear_after_cliff?: boolean | null;
          name?: string | null;
          org_id?: string | null;
          plan_id?: string | null;
          single_vesting_date?: string | null;
          total_months?: number | null;
          updated_at?: string;
          vesting_type?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'vesting_schedules_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
        ];
      };
      vesting_tranches: {
        Row: {
          created_at: string;
          id: string;
          percentage_of_award: number;
          performance_condition_id: string | null;
          schedule_id: string;
          sort_order: number;
          vesting_date: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          percentage_of_award: number;
          performance_condition_id?: string | null;
          schedule_id: string;
          sort_order: number;
          vesting_date: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          percentage_of_award?: number;
          performance_condition_id?: string | null;
          schedule_id?: string;
          sort_order?: number;
          vesting_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vesting_tranches_schedule_id_fkey';
            columns: ['schedule_id'];
            isOneToOne: false;
            referencedRelation: 'vesting_schedules';
            referencedColumns: ['id'];
          },
        ];
      };
      volatility_schemes: {
        Row: {
          annualized_sigma: number | null;
          created_at: string;
          heston_params: Json | null;
          hypothesis_set_id: string | null;
          id: string;
          jump_params: Json | null;
          lookback_period_days: number | null;
          method: string | null;
          name: string | null;
          org_id: string | null;
          parameters: Json | null;
          updated_at: string;
        };
        Insert: {
          annualized_sigma?: number | null;
          created_at?: string;
          heston_params?: Json | null;
          hypothesis_set_id?: string | null;
          id?: string;
          jump_params?: Json | null;
          lookback_period_days?: number | null;
          method?: string | null;
          name?: string | null;
          org_id?: string | null;
          parameters?: Json | null;
          updated_at?: string;
        };
        Update: {
          annualized_sigma?: number | null;
          created_at?: string;
          heston_params?: Json | null;
          hypothesis_set_id?: string | null;
          id?: string;
          jump_params?: Json | null;
          lookback_period_days?: number | null;
          method?: string | null;
          name?: string | null;
          org_id?: string | null;
          parameters?: Json | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'volatility_schemes_hypothesis_set_id_fkey';
            columns: ['hypothesis_set_id'];
            isOneToOne: false;
            referencedRelation: 'hypothesis_sets';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      apply_award_modification: {
        Args: {
          p_award_id: string;
          p_changes: Json;
          p_effective_date?: string;
          p_modification_type: string;
          p_reason: string;
        };
        Returns: Json;
      };
      bulk_create_awards: { Args: { p_rows: Json }; Returns: Json };
      bulk_create_beneficiaries: { Args: { p_rows: Json }; Returns: Json };
      cancel_approval_request: {
        Args: { p_reason: string; p_request_id: string };
        Returns: string;
      };
      cancel_signature_request: {
        Args: { p_reason: string; p_request_id: string };
        Returns: string;
      };
      complete_signature_request: {
        Args: {
          p_proof_certificate_url: string;
          p_request_id: string;
          p_signed_pdf_storage_path: string;
        };
        Returns: string;
      };
      create_award_full: { Args: { p_data: Json }; Returns: string };
      create_document_for_award: {
        Args: {
          p_award_id: string;
          p_file_size_bytes: number;
          p_pdf_hash: string;
          p_storage_path: string;
          p_template_code: string;
          p_variables_used: Json;
        };
        Returns: string;
      };
      create_plan_full: {
        Args: {
          p_company_id: string;
          p_compliance_warnings: Json;
          p_conditions: Json;
          p_hypothesis: Json;
          p_leaver_rules: Json;
          p_org_id: string;
          p_plan_data: Json;
          p_simulation: Json;
          p_vesting: Json;
          p_volatility: Json;
        };
        Returns: Json;
      };
      create_signature_request_full: {
        Args: {
          p_document_id: string;
          p_expiry_date: string;
          p_signers: Json;
          p_signing_order: string;
          p_yousign_environment: string;
          p_yousign_procedure_id: string;
        };
        Returns: string;
      };
      current_org_id: { Args: never; Returns: string };
      custom_access_token_hook: { Args: { event: Json }; Returns: Json };
      decrypt_sensitive: { Args: { ciphertext: string }; Returns: string };
      duplicate_plan_full: {
        Args: { p_new_name?: string; p_source_plan_id: string };
        Returns: Json;
      };
      encrypt_sensitive: { Args: { plaintext: string }; Returns: string };
      evaluate_approval_request: {
        Args: { p_request_id: string };
        Returns: Json;
      };
      get_beneficiary_decrypted: {
        Args: { p_id: string };
        Returns: {
          address: Json;
          beneficiary_type: string;
          company_id: string;
          date_of_birth: string;
          department: string;
          email: string;
          first_name: string;
          hire_date: string;
          id: string;
          job_title: string;
          last_name: string;
          org_id: string;
          phone: string;
          social_security_number: string;
          status: string;
        }[];
      };
      get_invitation_by_token: {
        Args: { p_token: string };
        Returns: {
          beneficiary_id: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string;
          invited_by_email: string;
          is_for_beneficiary: boolean;
          message: string;
          org_id: string;
          org_name: string;
          roles: string[];
        }[];
      };
      has_permission: { Args: { perm: string }; Returns: boolean };
      insert_beneficiary_encrypted: {
        Args: {
          p_address?: Json;
          p_beneficiary_type?: string;
          p_company_id?: string;
          p_department?: string;
          p_dob?: string;
          p_email: string;
          p_first_name: string;
          p_hire_date?: string;
          p_job_title?: string;
          p_last_name: string;
          p_nss?: string;
          p_org_id: string;
          p_phone?: string;
        };
        Returns: string;
      };
      is_award_beneficiary: {
        Args: { award_id_param: string };
        Returns: boolean;
      };
      is_org_member: { Args: { org_id_param: string }; Returns: boolean };
      link_beneficiary_to_user: {
        Args: { p_email: string; p_user_id: string };
        Returns: undefined;
      };
      list_my_plan_drafts: {
        Args: never;
        Returns: {
          created_at: string;
          id: string;
          plan_name: string;
          plan_type: string;
          updated_at: string;
        }[];
      };
      load_award_document_context: {
        Args: { p_award_id: string };
        Returns: Json;
      };
      load_plan_draft: { Args: { p_draft_id: string }; Returns: Json };
      mark_beneficiary_invited: {
        Args: { p_beneficiary_id: string };
        Returns: string;
      };
      materialize_vesting_events: {
        Args: { p_award_id: string };
        Returns: number;
      };
      next_award_number: { Args: { p_org_id: string }; Returns: string };
      record_approval_decision: {
        Args: { p_comment: string; p_decision_id: string; p_status: string };
        Returns: Json;
      };
      start_approval_workflow: {
        Args: { p_award_id: string; p_workflow_id?: string };
        Returns: Json;
      };
      transition_award_to_granted_after_signature: {
        Args: { p_award_id: string };
        Returns: string;
      };
      transition_beneficiary_lifecycle: {
        Args: {
          p_beneficiary_id: string;
          p_reason: string;
          p_termination_date?: string;
          p_to_status: string;
        };
        Returns: string;
      };
      update_signer_from_webhook: {
        Args: {
          p_event_type: string;
          p_metadata: Json;
          p_yousign_signer_id: string;
        };
        Returns: string;
      };
      upsert_plan_draft: { Args: { p_data: Json }; Returns: Json };
      user_all_permissions: { Args: never; Returns: string[] };
      user_has_permission: { Args: { p_perm: string }; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
