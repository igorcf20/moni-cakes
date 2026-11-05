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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      auth_attempts: {
        Row: {
          created_at: string
          id: number
          identifier: string | null
          ip: string | null
          success: boolean
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          identifier?: string | null
          ip?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          identifier?: string | null
          ip?: string | null
          success?: boolean
          user_agent?: string | null
        }
        Relationships: []
      }
      banners: {
        Row: {
          badge_text: string | null
          button_text: string | null
          created_at: string | null
          cta_text: string | null
          cta_url: string | null
          display_order: number | null
          duration_seconds: number
          end_date: string | null
          id: string
          image_url: string
          is_active: boolean | null
          link_url: string | null
          media_type: string
          overlay_color: string
          overlay_opacity: number
          position: string
          secondary_cta_text: string | null
          secondary_cta_url: string | null
          show_primary_cta: boolean
          show_secondary_cta: boolean
          show_side_image: boolean
          side_image_url: string | null
          start_date: string | null
          subtitle: string | null
          target_audience: string | null
          title: string
          updated_at: string | null
          video_poster_url: string | null
          video_url: string | null
        }
        Insert: {
          badge_text?: string | null
          button_text?: string | null
          created_at?: string | null
          cta_text?: string | null
          cta_url?: string | null
          display_order?: number | null
          duration_seconds?: number
          end_date?: string | null
          id?: string
          image_url: string
          is_active?: boolean | null
          link_url?: string | null
          media_type?: string
          overlay_color?: string
          overlay_opacity?: number
          position?: string
          secondary_cta_text?: string | null
          secondary_cta_url?: string | null
          show_primary_cta?: boolean
          show_secondary_cta?: boolean
          show_side_image?: boolean
          side_image_url?: string | null
          start_date?: string | null
          subtitle?: string | null
          target_audience?: string | null
          title: string
          updated_at?: string | null
          video_poster_url?: string | null
          video_url?: string | null
        }
        Update: {
          badge_text?: string | null
          button_text?: string | null
          created_at?: string | null
          cta_text?: string | null
          cta_url?: string | null
          display_order?: number | null
          duration_seconds?: number
          end_date?: string | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          link_url?: string | null
          media_type?: string
          overlay_color?: string
          overlay_opacity?: number
          position?: string
          secondary_cta_text?: string | null
          secondary_cta_url?: string | null
          show_primary_cta?: boolean
          show_secondary_cta?: boolean
          show_side_image?: boolean
          side_image_url?: string | null
          start_date?: string | null
          subtitle?: string | null
          target_audience?: string | null
          title?: string
          updated_at?: string | null
          video_poster_url?: string | null
          video_url?: string | null
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          created_at: string | null
          design_data: Json | null
          id: string
          product_id: string
          quantity: number
          size_label: string | null
          user_id: string
          variation_id: string | null
        }
        Insert: {
          created_at?: string | null
          design_data?: Json | null
          id?: string
          product_id: string
          quantity?: number
          size_label?: string | null
          user_id: string
          variation_id?: string | null
        }
        Update: {
          created_at?: string | null
          design_data?: Json | null
          id?: string
          product_id?: string
          quantity?: number
          size_label?: string | null
          user_id?: string
          variation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "product_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          hero_visible: boolean | null
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          parent_id: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          hero_visible?: boolean | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          parent_id?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          hero_visible?: boolean | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          parent_id?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      consent_records: {
        Row: {
          action: string
          choices: Json
          consent_id: string
          country: string | null
          created_at: string
          gpc: boolean
          id: string
          locale: string | null
          policy_version: number
          user_id: string | null
        }
        Insert: {
          action: string
          choices: Json
          consent_id: string
          country?: string | null
          created_at?: string
          gpc?: boolean
          id?: string
          locale?: string | null
          policy_version: number
          user_id?: string | null
        }
        Update: {
          action?: string
          choices?: Json
          consent_id?: string
          country?: string | null
          created_at?: string
          gpc?: boolean
          id?: string
          locale?: string | null
          policy_version?: number
          user_id?: string | null
        }
        Relationships: []
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      coupons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          current_uses: number | null
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          max_uses: number | null
          min_purchase: number | null
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          current_uses?: number | null
          discount_type: string
          discount_value: number
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          min_purchase?: number | null
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          current_uses?: number | null
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          min_purchase?: number | null
        }
        Relationships: []
      }
      customer_product_prices: {
        Row: {
          base_price: number
          created_at: string
          id: string
          product_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          base_price: number
          created_at?: string
          id?: string
          product_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          base_price?: number
          created_at?: string
          id?: string
          product_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_product_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_methods: {
        Row: {
          config: Json
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          type: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          display_name: string
          enabled: boolean
          from_email: string | null
          from_name: string | null
          intro: string | null
          key: string
          reply_to: string | null
          subject: string
          updated_at: string
        }
        Insert: {
          display_name: string
          enabled?: boolean
          from_email?: string | null
          from_name?: string | null
          intro?: string | null
          key: string
          reply_to?: string | null
          subject: string
          updated_at?: string
        }
        Update: {
          display_name?: string
          enabled?: boolean
          from_email?: string | null
          from_name?: string | null
          intro?: string | null
          key?: string
          reply_to?: string | null
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      frame_options: {
        Row: {
          base_price: number
          color: string | null
          created_at: string | null
          description: string | null
          dimensions: Json | null
          id: string
          image_url: string | null
          is_active: boolean | null
          material: string
          name: string
          stock_quantity: number | null
          style: string | null
        }
        Insert: {
          base_price: number
          color?: string | null
          created_at?: string | null
          description?: string | null
          dimensions?: Json | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          material: string
          name: string
          stock_quantity?: number | null
          style?: string | null
        }
        Update: {
          base_price?: number
          color?: string | null
          created_at?: string | null
          description?: string | null
          dimensions?: Json | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          material?: string
          name?: string
          stock_quantity?: number | null
          style?: string | null
        }
        Relationships: []
      }
      home_product_sections: {
        Row: {
          category_slug: string | null
          created_at: string
          cta_text: string | null
          cta_url: string | null
          display_order: number
          eyebrow: string | null
          id: string
          is_active: boolean
          item_limit: number
          key: string
          layout: string
          source: string
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category_slug?: string | null
          created_at?: string
          cta_text?: string | null
          cta_url?: string | null
          display_order?: number
          eyebrow?: string | null
          id?: string
          is_active?: boolean
          item_limit?: number
          key: string
          layout?: string
          source?: string
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category_slug?: string | null
          created_at?: string
          cta_text?: string | null
          cta_url?: string | null
          display_order?: number
          eyebrow?: string | null
          id?: string
          is_active?: boolean
          item_limit?: number
          key?: string
          layout?: string
          source?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      home_section_items: {
        Row: {
          author_location: string | null
          author_name: string | null
          author_role: string | null
          body: string | null
          created_at: string
          display_order: number
          icon: string | null
          id: string
          image_url: string | null
          is_active: boolean
          kind: string
          rating: number | null
          section_key: string
          stat_label: string | null
          stat_value: string | null
          status: string
          submitter_email: string | null
          subtitle: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          author_location?: string | null
          author_name?: string | null
          author_role?: string | null
          body?: string | null
          created_at?: string
          display_order?: number
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          kind: string
          rating?: number | null
          section_key: string
          stat_label?: string | null
          stat_value?: string | null
          status?: string
          submitter_email?: string | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          author_location?: string | null
          author_name?: string | null
          author_role?: string | null
          body?: string | null
          created_at?: string
          display_order?: number
          icon?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          kind?: string
          rating?: number | null
          section_key?: string
          stat_label?: string | null
          stat_value?: string | null
          status?: string
          submitter_email?: string | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      home_sections: {
        Row: {
          created_at: string
          cta_text: string | null
          cta_url: string | null
          eyebrow: string | null
          id: string
          image_url: string | null
          is_active: boolean
          key: string
          secondary_cta_text: string | null
          secondary_cta_url: string | null
          subtitle: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          cta_text?: string | null
          cta_url?: string | null
          eyebrow?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          key: string
          secondary_cta_text?: string | null
          secondary_cta_url?: string | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          cta_text?: string | null
          cta_url?: string | null
          eyebrow?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          key?: string
          secondary_cta_text?: string | null
          secondary_cta_url?: string | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      integration_credentials: {
        Row: {
          created_at: string
          credentials: Json
          environment: string
          id: string
          is_active: boolean
          last_updated_by: string | null
          provider: string
          public_config: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          credentials?: Json
          environment?: string
          id?: string
          is_active?: boolean
          last_updated_by?: string | null
          provider: string
          public_config?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          credentials?: Json
          environment?: string
          id?: string
          is_active?: boolean
          last_updated_by?: string | null
          provider?: string
          public_config?: Json
          updated_at?: string
        }
        Relationships: []
      }
      kit_items: {
        Row: {
          created_at: string
          id: string
          kit_id: string
          product_id: string
          quantity: number
        }
        Insert: {
          created_at?: string
          id?: string
          kit_id: string
          product_id: string
          quantity?: number
        }
        Update: {
          created_at?: string
          id?: string
          kit_id?: string
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "kit_items_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "kits"
            referencedColumns: ["id"]
          },
        ]
      }
      kits: {
        Row: {
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number
          display_order: number
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      material_tags: {
        Row: {
          created_at: string
          display_order: number
          id: string
          label: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          label: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          label?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      menu_items: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          image_url: string | null
          is_active: boolean | null
          is_mega_menu: boolean | null
          parent_id: string | null
          style_config: Json | null
          title: string
          url: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_mega_menu?: boolean | null
          parent_id?: string | null
          style_config?: Json | null
          title: string
          url?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_mega_menu?: boolean | null
          parent_id?: string | null
          style_config?: Json | null
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_subscriptions: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string | null
          phone: string | null
          source: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      order_designs: {
        Row: {
          cart_item_key: string | null
          copies: number
          created_at: string
          delete_after: string | null
          deleted_at: string | null
          dpi: number | null
          dpi_acceptances: Json
          file_path: string
          height_px: number | null
          id: string
          keep_preview_only: boolean
          kind: string
          manual_review_fee: number
          manual_review_requested: boolean
          order_id: string
          originals: Json
          pdf_path: string | null
          pdf_size_bytes: number | null
          plano_index: number
          plano_name: string | null
          preview_path: string | null
          preview_size_bytes: number | null
          size_bytes: number | null
          upload_complete: boolean
          width_px: number | null
        }
        Insert: {
          cart_item_key?: string | null
          copies?: number
          created_at?: string
          delete_after?: string | null
          deleted_at?: string | null
          dpi?: number | null
          dpi_acceptances?: Json
          file_path: string
          height_px?: number | null
          id?: string
          keep_preview_only?: boolean
          kind?: string
          manual_review_fee?: number
          manual_review_requested?: boolean
          order_id: string
          originals?: Json
          pdf_path?: string | null
          pdf_size_bytes?: number | null
          plano_index?: number
          plano_name?: string | null
          preview_path?: string | null
          preview_size_bytes?: number | null
          size_bytes?: number | null
          upload_complete?: boolean
          width_px?: number | null
        }
        Update: {
          cart_item_key?: string | null
          copies?: number
          created_at?: string
          delete_after?: string | null
          deleted_at?: string | null
          dpi?: number | null
          dpi_acceptances?: Json
          file_path?: string
          height_px?: number | null
          id?: string
          keep_preview_only?: boolean
          kind?: string
          manual_review_fee?: number
          manual_review_requested?: boolean
          order_id?: string
          originals?: Json
          pdf_path?: string | null
          pdf_size_bytes?: number | null
          plano_index?: number
          plano_name?: string | null
          preview_path?: string | null
          preview_size_bytes?: number | null
          size_bytes?: number | null
          upload_complete?: boolean
          width_px?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_designs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          config: Json | null
          created_at: string | null
          custom_description: string | null
          custom_name: string | null
          design_data: Json | null
          id: string
          length_m: number | null
          order_id: string
          price: number
          product_id: string | null
          sku: string | null
          quantity: number
          vat_amount: number | null
          vat_rate: number | null
        }
        Insert: {
          config?: Json | null
          created_at?: string | null
          custom_description?: string | null
          custom_name?: string | null
          design_data?: Json | null
          id?: string
          length_m?: number | null
          order_id: string
          price: number
          product_id?: string | null
          sku?: string | null
          quantity: number
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Update: {
          config?: Json | null
          created_at?: string | null
          custom_description?: string | null
          custom_name?: string | null
          design_data?: Json | null
          id?: string
          length_m?: number | null
          order_id?: string
          price?: number
          product_id?: string | null
          sku?: string | null
          quantity?: number
          vat_amount?: number | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string | null
          id: string
          notes: string | null
          order_id: string
          status: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          order_id: string
          status: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          archived: boolean
          billing_address: Json | null
          cancellation_reason: string | null
          cancellation_requested_at: string | null
          cancellation_status: string | null
          coupon_code: string | null
          created_at: string | null
          delivered_at: string | null
          delivery_method_id: string | null
          discount_amount: number | null
          files_pending: boolean
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          has_customizable_items: boolean
          id: string
          is_manual: boolean
          is_test: boolean
          low_res_accepted: boolean
          manual_customer_contact: string | null
          manual_customer_name: string | null
          manual_review_fee: number
          notes: string | null
          notified_at: string | null
          payment_method: string | null
          payment_proof_note: string | null
          payment_proof_uploaded_at: string | null
          payment_proof_url: string | null
          payment_status: string | null
          pickup_acknowledged: boolean
          proportional_resize_accepted: boolean
          refund_note: string | null
          refunded_at: string | null
          requires_customer_config: boolean
          shipped_at: string | null
          shipping_address: Json | null
          shipping_cost: number | null
          status: string
          subtotal_net: number | null
          terms_accepted_at: string | null
          total: number
          tracking_number: string | null
          user_id: string | null
          vat_total: number | null
        }
        Insert: {
          archived?: boolean
          billing_address?: Json | null
          cancellation_reason?: string | null
          cancellation_requested_at?: string | null
          cancellation_status?: string | null
          coupon_code?: string | null
          created_at?: string | null
          delivered_at?: string | null
          delivery_method_id?: string | null
          discount_amount?: number | null
          files_pending?: boolean
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          has_customizable_items?: boolean
          id?: string
          is_manual?: boolean
          is_test?: boolean
          low_res_accepted?: boolean
          manual_customer_contact?: string | null
          manual_customer_name?: string | null
          manual_review_fee?: number
          notes?: string | null
          notified_at?: string | null
          payment_method?: string | null
          payment_proof_note?: string | null
          payment_proof_uploaded_at?: string | null
          payment_proof_url?: string | null
          payment_status?: string | null
          pickup_acknowledged?: boolean
          proportional_resize_accepted?: boolean
          refund_note?: string | null
          refunded_at?: string | null
          requires_customer_config?: boolean
          shipped_at?: string | null
          shipping_address?: Json | null
          shipping_cost?: number | null
          status?: string
          subtotal_net?: number | null
          terms_accepted_at?: string | null
          total: number
          tracking_number?: string | null
          user_id?: string | null
          vat_total?: number | null
        }
        Update: {
          archived?: boolean
          billing_address?: Json | null
          cancellation_reason?: string | null
          cancellation_requested_at?: string | null
          cancellation_status?: string | null
          coupon_code?: string | null
          created_at?: string | null
          delivered_at?: string | null
          delivery_method_id?: string | null
          discount_amount?: number | null
          files_pending?: boolean
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          has_customizable_items?: boolean
          id?: string
          is_manual?: boolean
          is_test?: boolean
          low_res_accepted?: boolean
          manual_customer_contact?: string | null
          manual_customer_name?: string | null
          manual_review_fee?: number
          notes?: string | null
          notified_at?: string | null
          payment_method?: string | null
          payment_proof_note?: string | null
          payment_proof_uploaded_at?: string | null
          payment_proof_url?: string | null
          payment_status?: string | null
          pickup_acknowledged?: boolean
          proportional_resize_accepted?: boolean
          refund_note?: string | null
          refunded_at?: string | null
          requires_customer_config?: boolean
          shipped_at?: string | null
          shipping_address?: Json | null
          shipping_cost?: number | null
          status?: string
          subtotal_net?: number | null
          terms_accepted_at?: string | null
          total?: number
          tracking_number?: string | null
          user_id?: string | null
          vat_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_delivery_method_id_fkey"
            columns: ["delivery_method_id"]
            isOneToOne: false
            referencedRelation: "delivery_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_config: {
        Row: {
          created_at: string
          details: Json
          display_order: number
          id: string
          is_active: boolean
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          details?: Json
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          details?: Json
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_3d_models: {
        Row: {
          base_color: string
          camera_preset: Json
          compression_ratio: number | null
          created_at: string
          enabled: boolean
          fallback_image_url: string | null
          model_kind: string
          model_url: string | null
          optimization_error: string | null
          optimization_status: string
          optimized_file_size: number | null
          optimized_model_url: string | null
          original_file_size: number | null
          original_model_url: string | null
          product_id: string
          spots_mapping: Json
          updated_at: string
        }
        Insert: {
          base_color?: string
          camera_preset?: Json
          compression_ratio?: number | null
          created_at?: string
          enabled?: boolean
          fallback_image_url?: string | null
          model_kind?: string
          model_url?: string | null
          optimization_error?: string | null
          optimization_status?: string
          optimized_file_size?: number | null
          optimized_model_url?: string | null
          original_file_size?: number | null
          original_model_url?: string | null
          product_id: string
          spots_mapping?: Json
          updated_at?: string
        }
        Update: {
          base_color?: string
          camera_preset?: Json
          compression_ratio?: number | null
          created_at?: string
          enabled?: boolean
          fallback_image_url?: string | null
          model_kind?: string
          model_url?: string | null
          optimization_error?: string | null
          optimization_status?: string
          optimized_file_size?: number | null
          optimized_model_url?: string | null
          original_file_size?: number | null
          original_model_url?: string | null
          product_id?: string
          spots_mapping?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_3d_models_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          category_id: string
          created_at: string | null
          id: string
          product_id: string
        }
        Insert: {
          category_id: string
          created_at?: string | null
          id?: string
          product_id: string
        }
        Update: {
          category_id?: string
          created_at?: string | null
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      product_colors: {
        Row: {
          created_at: string
          display_order: number
          hex: string
          id: string
          is_default: boolean
          name: string
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          hex: string
          id?: string
          is_default?: boolean
          name: string
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          hex?: string
          id?: string
          is_default?: boolean
          name?: string
          product_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_faqs: {
        Row: {
          answer: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          product_id: string
          question: string
          updated_at: string
        }
        Insert: {
          answer: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          product_id: string
          question: string
          updated_at?: string
        }
        Update: {
          answer?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          product_id?: string
          question?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_faqs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_frame_pricing: {
        Row: {
          combo_discount: number | null
          created_at: string | null
          final_combo_price: number
          frame_id: string | null
          id: string
          product_id: string
        }
        Insert: {
          combo_discount?: number | null
          created_at?: string | null
          final_combo_price: number
          frame_id?: string | null
          id?: string
          product_id: string
        }
        Update: {
          combo_discount?: number | null
          created_at?: string | null
          final_combo_price?: number
          frame_id?: string | null
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_frame_pricing_frame_id_fkey"
            columns: ["frame_id"]
            isOneToOne: false
            referencedRelation: "frame_options"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string | null
          created_at: string | null
          display_order: number
          id: string
          image_url: string
          product_id: string
          variation_id: string | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string | null
          display_order?: number
          id?: string
          image_url: string
          product_id: string
          variation_id?: string | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string | null
          display_order?: number
          id?: string
          image_url?: string
          product_id?: string
          variation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_images_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "product_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_print_areas: {
        Row: {
          allowed_techniques: string[]
          area_height_cm: number
          area_width_cm: number
          base_price: number
          created_at: string
          default_technique: string | null
          description: string | null
          display_order: number
          drag_max_x: number
          drag_max_y: number
          drag_min_x: number
          drag_min_y: number
          id: string
          is_active: boolean
          keep_aspect_ratio_default: boolean
          key: string
          label: string
          max_height_cm: number
          max_scale: number
          max_width_cm: number
          min_price: number
          min_scale: number
          observation_required: boolean
          position_x: number
          position_y: number
          position_z: number
          preview_anchor: Json
          preview_enabled: boolean
          preview_image_url: string | null
          price_per_cm2: number | null
          pricing_mode: string
          product_id: string
          required: boolean
          rotation_x: number
          rotation_y: number
          rotation_z: number
          scale: number
          updated_at: string
          visual_area_height: number
          visual_area_width: number
        }
        Insert: {
          allowed_techniques?: string[]
          area_height_cm: number
          area_width_cm: number
          base_price?: number
          created_at?: string
          default_technique?: string | null
          description?: string | null
          display_order?: number
          drag_max_x?: number
          drag_max_y?: number
          drag_min_x?: number
          drag_min_y?: number
          id?: string
          is_active?: boolean
          keep_aspect_ratio_default?: boolean
          key: string
          label: string
          max_height_cm: number
          max_scale?: number
          max_width_cm: number
          min_price?: number
          min_scale?: number
          observation_required?: boolean
          position_x?: number
          position_y?: number
          position_z?: number
          preview_anchor?: Json
          preview_enabled?: boolean
          preview_image_url?: string | null
          price_per_cm2?: number | null
          pricing_mode?: string
          product_id: string
          required?: boolean
          rotation_x?: number
          rotation_y?: number
          rotation_z?: number
          scale?: number
          updated_at?: string
          visual_area_height?: number
          visual_area_width?: number
        }
        Update: {
          allowed_techniques?: string[]
          area_height_cm?: number
          area_width_cm?: number
          base_price?: number
          created_at?: string
          default_technique?: string | null
          description?: string | null
          display_order?: number
          drag_max_x?: number
          drag_max_y?: number
          drag_min_x?: number
          drag_min_y?: number
          id?: string
          is_active?: boolean
          keep_aspect_ratio_default?: boolean
          key?: string
          label?: string
          max_height_cm?: number
          max_scale?: number
          max_width_cm?: number
          min_price?: number
          min_scale?: number
          observation_required?: boolean
          position_x?: number
          position_y?: number
          position_z?: number
          preview_anchor?: Json
          preview_enabled?: boolean
          preview_image_url?: string | null
          price_per_cm2?: number | null
          pricing_mode?: string
          product_id?: string
          required?: boolean
          rotation_x?: number
          rotation_y?: number
          rotation_z?: number
          scale?: number
          updated_at?: string
          visual_area_height?: number
          visual_area_width?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_print_areas_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          approved: boolean | null
          comment: string | null
          created_at: string
          created_by_admin: boolean
          customer_name: string | null
          id: string
          image_url: string | null
          moderated_by: string | null
          moderation_date: string | null
          order_id: string | null
          product_id: string
          rating: number
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          approved?: boolean | null
          comment?: string | null
          created_at?: string
          created_by_admin?: boolean
          customer_name?: string | null
          id?: string
          image_url?: string | null
          moderated_by?: string | null
          moderation_date?: string | null
          order_id?: string | null
          product_id: string
          rating: number
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          approved?: boolean | null
          comment?: string | null
          created_at?: string
          created_by_admin?: boolean
          customer_name?: string | null
          id?: string
          image_url?: string | null
          moderated_by?: string | null
          moderation_date?: string | null
          order_id?: string | null
          product_id?: string
          rating?: number
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      product_sizes: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          price_modifier: number
          product_id: string
          size_label: string
          stock_quantity: number
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          price_modifier?: number
          product_id: string
          size_label: string
          stock_quantity?: number
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          price_modifier?: number
          product_id?: string
          size_label?: string
          stock_quantity?: number
        }
        Relationships: []
      }
      product_variation_size_availability: {
        Row: {
          created_at: string
          is_available: boolean
          price_modifier: number
          product_size_id: string
          stock_quantity: number
          updated_at: string
          variation_id: string
        }
        Insert: {
          created_at?: string
          is_available?: boolean
          price_modifier?: number
          product_size_id: string
          stock_quantity?: number
          updated_at?: string
          variation_id: string
        }
        Update: {
          created_at?: string
          is_available?: boolean
          price_modifier?: number
          product_size_id?: string
          stock_quantity?: number
          updated_at?: string
          variation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variation_size_availability_product_size_id_fkey"
            columns: ["product_size_id"]
            isOneToOne: false
            referencedRelation: "product_sizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variation_size_availability_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "product_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variation_sizes: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          price_modifier: number
          size_label: string
          stock_quantity: number
          variation_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          price_modifier?: number
          size_label: string
          stock_quantity?: number
          variation_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          price_modifier?: number
          size_label?: string
          stock_quantity?: number
          variation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variation_sizes_variation_id_fkey"
            columns: ["variation_id"]
            isOneToOne: false
            referencedRelation: "product_variations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variations: {
        Row: {
          color_hex: string | null
          created_at: string
          display_order: number
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          price_modifier: number
          product_id: string
        }
        Insert: {
          color_hex?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          price_modifier?: number
          product_id: string
        }
        Update: {
          color_hex?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          price_modifier?: number
          product_id?: string
        }
        Relationships: []
      }
      product_views: {
        Row: {
          id: string
          product_id: string
          session_id: string | null
          user_id: string | null
          viewed_at: string | null
        }
        Insert: {
          id?: string
          product_id: string
          session_id?: string | null
          user_id?: string | null
          viewed_at?: string | null
        }
        Update: {
          id?: string
          product_id?: string
          session_id?: string | null
          user_id?: string | null
          viewed_at?: string | null
        }
        Relationships: []
      }
      product_volume_tiers: {
        Row: {
          created_at: string
          display_order: number
          id: string
          label: string | null
          min_meters: number
          price_per_meter: number
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          label?: string | null
          min_meters: number
          price_per_meter: number
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          label?: string | null
          min_meters?: number
          price_per_meter?: number
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_volume_tiers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          accepted_file_types: string[] | null
          applications: string[] | null
          category: string
          category_display_order: number | null
          color_palette: Json | null
          cost_per_meter: number | null
          cost_price: number | null
          created_at: string | null
          customizable: boolean | null
          description: string | null
          dimensions: Json | null
          disclaimer: string | null
          display_order: number | null
          featured_display_order: number | null
          featured_until: string | null
          hero_image: string | null
          id: string
          image: string | null
          images: string[] | null
          inner_margin_mm: number | null
          is_active: boolean
          is_featured: boolean | null
          is_new: boolean
          length_increment_m: number | null
          material: string | null
          materials: string[] | null
          max_length_cm: number | null
          min_charge_meters: number | null
          model_url: string | null
          min_length_m: number | null
          name: string
          price: number
          price_per_meter: number | null
          promo_active: boolean
          promo_ends_at: string | null
          promo_label: string | null
          promo_show_countdown: boolean
          promo_starts_at: string | null
          promo_type: string | null
          promo_value: number | null
          recommended_category_ids: string[]
          recommended_dtf_id: string | null
          recommended_dtf_ids: string[]
          required_dpi: number | null
          roll_width_cm: number | null
          sales_count: number | null
          short_description: string | null
          slug: string | null
          specifications: Json | null
          stock_quantity: number | null
          technical_specs: Json | null
          unit_type: string
          updated_at: string
          usage_instructions: string | null
          vat_rate: number
          video_urls: string[]
          view_count: number | null
          weight: number | null
        }
        Insert: {
          accepted_file_types?: string[] | null
          applications?: string[] | null
          category: string
          category_display_order?: number | null
          color_palette?: Json | null
          cost_per_meter?: number | null
          cost_price?: number | null
          created_at?: string | null
          customizable?: boolean | null
          description?: string | null
          dimensions?: Json | null
          disclaimer?: string | null
          display_order?: number | null
          featured_display_order?: number | null
          featured_until?: string | null
          hero_image?: string | null
          id: string
          image?: string | null
          images?: string[] | null
          inner_margin_mm?: number | null
          is_active?: boolean
          is_featured?: boolean | null
          is_new?: boolean
          length_increment_m?: number | null
          material?: string | null
          materials?: string[] | null
          max_length_cm?: number | null
          min_charge_meters?: number | null
          model_url?: string | null
          min_length_m?: number | null
          name: string
          price: number
          price_per_meter?: number | null
          promo_active?: boolean
          promo_ends_at?: string | null
          promo_label?: string | null
          promo_show_countdown?: boolean
          promo_starts_at?: string | null
          promo_type?: string | null
          promo_value?: number | null
          recommended_category_ids?: string[]
          recommended_dtf_id?: string | null
          recommended_dtf_ids?: string[]
          required_dpi?: number | null
          roll_width_cm?: number | null
          sales_count?: number | null
          short_description?: string | null
          slug?: string | null
          specifications?: Json | null
          stock_quantity?: number | null
          technical_specs?: Json | null
          unit_type?: string
          updated_at?: string
          usage_instructions?: string | null
          vat_rate?: number
          video_urls?: string[]
          view_count?: number | null
          weight?: number | null
        }
        Update: {
          accepted_file_types?: string[] | null
          applications?: string[] | null
          category?: string
          category_display_order?: number | null
          color_palette?: Json | null
          cost_per_meter?: number | null
          cost_price?: number | null
          created_at?: string | null
          customizable?: boolean | null
          description?: string | null
          dimensions?: Json | null
          disclaimer?: string | null
          display_order?: number | null
          featured_display_order?: number | null
          featured_until?: string | null
          hero_image?: string | null
          id?: string
          image?: string | null
          images?: string[] | null
          inner_margin_mm?: number | null
          is_active?: boolean
          is_featured?: boolean | null
          is_new?: boolean
          length_increment_m?: number | null
          material?: string | null
          materials?: string[] | null
          max_length_cm?: number | null
          min_charge_meters?: number | null
          model_url?: string | null
          min_length_m?: number | null
          name?: string
          price?: number
          price_per_meter?: number | null
          promo_active?: boolean
          promo_ends_at?: string | null
          promo_label?: string | null
          promo_show_countdown?: boolean
          promo_starts_at?: string | null
          promo_type?: string | null
          promo_value?: number | null
          recommended_category_ids?: string[]
          recommended_dtf_id?: string | null
          recommended_dtf_ids?: string[]
          required_dpi?: number | null
          roll_width_cm?: number | null
          sales_count?: number | null
          short_description?: string | null
          slug?: string | null
          specifications?: Json | null
          stock_quantity?: number | null
          technical_specs?: Json | null
          unit_type?: string
          updated_at?: string
          usage_instructions?: string | null
          vat_rate?: number
          video_urls?: string[]
          view_count?: number | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_recommended_dtf_id_fkey"
            columns: ["recommended_dtf_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_log: {
        Row: {
          bucket: string
          created_at: string
          id: number
          ip: string | null
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: number
          ip?: string | null
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: number
          ip?: string | null
        }
        Relationships: []
      }
      related_products: {
        Row: {
          created_at: string | null
          display_order: number | null
          id: string
          product_id: string
          related_product_id: string
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          product_id: string
          related_product_id: string
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          product_id?: string
          related_product_id?: string
        }
        Relationships: []
      }
      sales_popup_config: {
        Row: {
          cities: string[]
          created_at: string
          display_duration_seconds: number
          enabled: boolean
          id: string
          max_interval_seconds: number
          min_interval_seconds: number
          names: string[]
          start_delay_seconds: number
          updated_at: string
        }
        Insert: {
          cities?: string[]
          created_at?: string
          display_duration_seconds?: number
          enabled?: boolean
          id?: string
          max_interval_seconds?: number
          min_interval_seconds?: number
          names?: string[]
          start_delay_seconds?: number
          updated_at?: string
        }
        Update: {
          cities?: string[]
          created_at?: string
          display_duration_seconds?: number
          enabled?: boolean
          id?: string
          max_interval_seconds?: number
          min_interval_seconds?: number
          names?: string[]
          start_delay_seconds?: number
          updated_at?: string
        }
        Relationships: []
      }
      saved_designs: {
        Row: {
          created_at: string
          design_data: Json
          design_name: string
          id: string
          product_id: string
          thumbnail: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          design_data: Json
          design_name: string
          id?: string
          product_id: string
          thumbnail?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          design_data?: Json
          design_name?: string
          id?: string
          product_id?: string
          thumbnail?: string | null
          user_id?: string
        }
        Relationships: []
      }
      search_history: {
        Row: {
          id: string
          query: string
          results_count: number | null
          searched_at: string | null
          user_id: string | null
        }
        Insert: {
          id?: string
          query: string
          results_count?: number | null
          searched_at?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string
          query?: string
          results_count?: number | null
          searched_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      shipping_rates: {
        Row: {
          base_rate: number
          created_at: string | null
          estimated_days_max: number | null
          estimated_days_min: number | null
          id: string
          max_weight: number
          min_weight: number
          per_kg_rate: number | null
          zone_id: string | null
        }
        Insert: {
          base_rate: number
          created_at?: string | null
          estimated_days_max?: number | null
          estimated_days_min?: number | null
          id?: string
          max_weight: number
          min_weight: number
          per_kg_rate?: number | null
          zone_id?: string | null
        }
        Update: {
          base_rate?: number
          created_at?: string | null
          estimated_days_max?: number | null
          estimated_days_min?: number | null
          id?: string
          max_weight?: number
          min_weight?: number
          per_kg_rate?: number | null
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipping_rates_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "shipping_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_zones: {
        Row: {
          country_code: string
          country_name: string
          created_at: string | null
          id: string
          is_active: boolean | null
          zone_name: string
        }
        Insert: {
          country_code: string
          country_name: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          zone_name: string
        }
        Update: {
          country_code?: string
          country_name?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          zone_name?: string
        }
        Relationships: []
      }
      site_faqs: {
        Row: {
          answer: string
          category: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          question: string
          updated_at: string
        }
        Insert: {
          answer: string
          category?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          question: string
          updated_at?: string
        }
        Update: {
          answer?: string
          category?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          question?: string
          updated_at?: string
        }
        Relationships: []
      }
      size_presets: {
        Row: {
          created_at: string
          display_order: number
          id: string
          name: string
          sizes: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          name: string
          sizes?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          sizes?: Json
          updated_at?: string
        }
        Relationships: []
      }
      store_settings: {
        Row: {
          created_at: string | null
          id: string
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          created_at?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          created_at?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      tracking_events: {
        Row: {
          created_at: string
          description: string | null
          id: string
          occurred_at: string | null
          order_id: string
          raw: Json | null
          status_code: string | null
          status_label: string | null
          tracking_code: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          occurred_at?: string | null
          order_id: string
          raw?: Json | null
          status_code?: string | null
          status_label?: string | null
          tracking_code: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          occurred_at?: string | null
          order_id?: string
          raw?: Json | null
          status_code?: string | null
          status_label?: string | null
          tracking_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_guide_faqs: {
        Row: {
          answer: string
          category: string | null
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          question: string
          updated_at: string
        }
        Insert: {
          answer?: string
          category?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          question: string
          updated_at?: string
        }
        Update: {
          answer?: string
          category?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          question?: string
          updated_at?: string
        }
        Relationships: []
      }
      usage_guide_sections: {
        Row: {
          body: string
          category: string | null
          created_at: string
          display_order: number
          id: string
          image_url: string | null
          is_active: boolean
          title: string
          updated_at: string
        }
        Insert: {
          body?: string
          category?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_addresses: {
        Row: {
          city: string
          complement: string | null
          country: string | null
          created_at: string
          district: string
          id: string
          is_billing_default: boolean
          is_default: boolean
          name: string
          number: string | null
          parish: string | null
          postal_code: string
          street: string
          updated_at: string
          user_id: string
        }
        Insert: {
          city: string
          complement?: string | null
          country?: string | null
          created_at?: string
          district: string
          id?: string
          is_billing_default?: boolean
          is_default?: boolean
          name: string
          number?: string | null
          parish?: string | null
          postal_code: string
          street: string
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string
          complement?: string | null
          country?: string | null
          created_at?: string
          district?: string
          id?: string
          is_billing_default?: boolean
          is_default?: boolean
          name?: string
          number?: string | null
          parish?: string | null
          postal_code?: string
          street?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          billing_address: Json | null
          company_name: string | null
          created_at: string | null
          date_of_birth: string | null
          full_name: string | null
          id: string
          newsletter_subscription: boolean | null
          phone: string | null
          tax_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          billing_address?: Json | null
          company_name?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          full_name?: string | null
          id?: string
          newsletter_subscription?: boolean | null
          phone?: string | null
          tax_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          billing_address?: Json | null
          company_name?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          full_name?: string | null
          id?: string
          newsletter_subscription?: boolean | null
          phone?: string | null
          tax_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      variation_preset_items: {
        Row: {
          color_hex: string | null
          created_at: string
          display_order: number
          id: string
          image_url: string | null
          name: string
          preset_id: string
          price_modifier: number
        }
        Insert: {
          color_hex?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          name: string
          preset_id: string
          price_modifier?: number
        }
        Update: {
          color_hex?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          name?: string
          preset_id?: string
          price_modifier?: number
        }
        Relationships: [
          {
            foreignKeyName: "variation_preset_items_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "variation_presets"
            referencedColumns: ["id"]
          },
        ]
      }
      variation_preset_sizes: {
        Row: {
          created_at: string
          default_stock: number
          display_order: number
          id: string
          preset_id: string
          price_modifier: number
          size_label: string
        }
        Insert: {
          created_at?: string
          default_stock?: number
          display_order?: number
          id?: string
          preset_id: string
          price_modifier?: number
          size_label: string
        }
        Update: {
          created_at?: string
          default_stock?: number
          display_order?: number
          id?: string
          preset_id?: string
          price_modifier?: number
          size_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "variation_preset_sizes_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "variation_presets"
            referencedColumns: ["id"]
          },
        ]
      }
      variation_presets: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          display_order: number | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      viva_payment_sessions: {
        Row: {
          amount_cents: number
          checkout_url: string | null
          created_at: string
          id: string
          order_id: string
          payload: Json | null
          status: string
          updated_at: string
          viva_order_code: string
        }
        Insert: {
          amount_cents: number
          checkout_url?: string | null
          created_at?: string
          id?: string
          order_id: string
          payload?: Json | null
          status?: string
          updated_at?: string
          viva_order_code: string
        }
        Update: {
          amount_cents?: number
          checkout_url?: string | null
          created_at?: string
          id?: string
          order_id?: string
          payload?: Json | null
          status?: string
          updated_at?: string
          viva_order_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "viva_payment_sessions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlist: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      home_section_items_public: {
        Row: {
          author_location: string | null
          author_name: string | null
          author_role: string | null
          body: string | null
          created_at: string | null
          display_order: number | null
          icon: string | null
          id: string | null
          image_url: string | null
          is_active: boolean | null
          kind: string | null
          rating: number | null
          section_key: string | null
          stat_label: string | null
          stat_value: string | null
          status: string | null
          subtitle: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          author_location?: string | null
          author_name?: string | null
          author_role?: string | null
          body?: string | null
          created_at?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string | null
          image_url?: string | null
          is_active?: boolean | null
          kind?: string | null
          rating?: number | null
          section_key?: string | null
          stat_label?: string | null
          stat_value?: string | null
          status?: string | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          author_location?: string | null
          author_name?: string | null
          author_role?: string | null
          body?: string | null
          created_at?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string | null
          image_url?: string | null
          is_active?: boolean | null
          kind?: string | null
          rating?: number | null
          section_key?: string | null
          stat_label?: string | null
          stat_value?: string | null
          status?: string | null
          subtitle?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      product_reviews_public: {
        Row: {
          approved: boolean | null
          comment: string | null
          created_at: string | null
          customer_name: string | null
          display_name: string | null
          id: string | null
          product_id: string | null
          rating: number | null
          title: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_list_customers: {
        Args: never
        Returns: {
          company_name: string
          created_at: string
          email: string
          full_name: string
          phone: string
          tax_id: string
          user_id: string
        }[]
      }
      admin_reorder_products: {
        Args: { p_category?: string; p_product_ids: string[]; p_scope: string }
        Returns: undefined
      }
      admin_set_payment_status: {
        Args: { _note?: string; _order_id: string; _payment_status: string }
        Returns: undefined
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_active_payment_methods: {
        Args: never
        Returns: {
          details: Json
          display_order: number
          id: string
          is_active: boolean
          name: string
          type: string
        }[]
      }
      get_storage_usage: {
        Args: never
        Returns: {
          bucket_id: string
          bytes: number
          count: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_orphan_dtf_objects: {
        Args: { _limit?: number }
        Returns: {
          name: string
          size: number
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      request_order_cancellation: {
        Args: { _order_id: string; _reason: string }
        Returns: undefined
      }
      validate_coupon: {
        Args: { _code: string }
        Returns: {
          code: string
          discount_type: string
          discount_value: number
          min_purchase: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
