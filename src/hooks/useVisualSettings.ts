import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VisualSettings {
  section_styles: {
    hero: string;
    featured: string;
    testimonials: string;
  };
  hidden_categories: string[];
  broadcast_modal: {
    style: string;
    title: string;
    description: string;
    button_text: string;
    discount_code: string;
    terms_text: string;
    enabled: boolean;
  };
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  font_family?: string;
  header_sticky?: boolean;
  announcement_bar?: {
    enabled: boolean;
    text: string;
    link: string;
    bg_color: string;
    text_color: string;
  };
  shipping?: {
    upsell_window_minutes?: number;
  };
  print_quality?: {
    low_dpi_threshold?: number;
    warning_dpi_threshold?: number;
    low_dpi_title?: string;
    low_dpi_body?: string;
    low_dpi_checkbox?: string;
    upscale_title?: string;
    upscale_body?: string;
    upscale_checkbox?: string;
  };
  plugins?: {
    whatsapp?: {
      enabled: boolean;
      phone: string;
      message: string;
      position: string;
    };
    sales_popup?: {
      enabled: boolean;
      interval: number;
      duration: number;
      showRecentSales: boolean;
      showBrowsingNow: boolean;
    };
    abandoned_cart?: {
      enabled: boolean;
      delay: number;
      coupon: string;
      method: string;
    };
    free_shipping_bar?: {
      enabled: boolean;
      threshold: number;
      successMessage: string;
      barColor: string;
    };
    smart_search?: {
      enabled: boolean;
      minChars: number;
      limit: number;
    };
    trust_badges?: {
      enabled: boolean;
      showPayments: boolean;
      showSecurity: boolean;
      theme: string;
    };
    production_pause?: {
      enabled: boolean;
      start_date?: string;
      end_date?: string;
      reason?: string;
      title?: string;
      message?: string;
      checkbox_text?: string;
      return_date?: string;
    };
  };
}

export const useVisualSettings = () => {
  return useQuery({
    queryKey: ["visualSettings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("store_settings")
        .select("value")
        .eq("key", "visual_settings")
        .maybeSingle();

      if (error) throw error;
      
      const defaultSettings: VisualSettings = {
        section_styles: {
          hero: "default",
          featured: "grid",
          testimonials: "carousel",
        },
        hidden_categories: [],
        broadcast_modal: {
          style: "modern",
          title: "Participe da nossa Lista VIP",
          description: "Receba descontos exclusivos e novidades em primeira mão!",
          button_text: "Quero entrar na lista",
          discount_code: "VIP10",
          terms_text: "Aceito os termos e condições para receber o desconto.",
          enabled: false,
        },
        logo_url: "",
        // Vazios de propósito: sem valor no Admin vale a identidade PRINT3D de src/index.css.
        primary_color: "",
        secondary_color: "",
        font_family: "",
        header_sticky: true,
        announcement_bar: {
          enabled: false,
          text: "",
          link: "",
          bg_color: "#171717",
          text_color: "#ffffff"
        },
        plugins: {
          whatsapp: {
            // Sem número no Admin, os botões de WhatsApp não aparecem (nada de número de exemplo).
            enabled: true,
            phone: "",
            message: "Olá! Vim do site e gostaria de tirar uma dúvida.",
            position: "right"
          },
          sales_popup: {
            enabled: false,
            interval: 30,
            duration: 5,
            showRecentSales: true,
            showBrowsingNow: true
          },
          abandoned_cart: {
            enabled: true,
            delay: 24,
            coupon: "VOLTA10",
            method: "email"
          },
          free_shipping_bar: {
            enabled: true,
            threshold: 299,
            successMessage: "",
            barColor: "primary"
          },
          smart_search: {
            enabled: true,
            minChars: 3,
            limit: 5
          },
          trust_badges: {
            enabled: true,
            showPayments: true,
            showSecurity: true,
            theme: "light"
          }
        }
      };

      if (!data || !data.value) return defaultSettings;
      
      return {
        ...defaultSettings,
        ...(data.value as any)
      } as VisualSettings;
    },
  });
};