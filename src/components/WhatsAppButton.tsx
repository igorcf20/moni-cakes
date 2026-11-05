import { useVisualSettings } from "@/hooks/useVisualSettings";
import { useMessages } from "@/i18n";
import { layoutMessages } from "@/i18n/layout";

const WhatsAppButton = () => {
  const { data: visualSettings } = useVisualSettings();
  const { t } = useMessages(layoutMessages);
  const config = visualSettings?.plugins?.whatsapp;
  
  const phoneNumber = config?.phone?.replace(/\D/g, '') || "";
  const message = config?.message || t("waMessage");

  // Só aparece quando o Admin configurou um número de WhatsApp.
  if (config?.enabled === false || phoneNumber.length < 8) return null;

  return (
    <a
      href={`https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-36 lg:bottom-20 right-6 z-40 transition-all duration-200 hover:scale-105 active:scale-95"
      aria-label={t("waAria")}
    >
      <div className="relative group">
        <div className="h-14 w-14 rounded-full bg-[#25D366] shadow-lg flex items-center justify-center ring-2 ring-white/20">
          <svg viewBox="0 0 32 32" className="h-8 w-8" aria-hidden="true">
            <path
              fill="#ffffff"
              d="M19.11 17.205c-.372 0-1.088 1.39-1.518 1.39a.63.63 0 0 1-.315-.1c-.802-.402-1.504-.817-2.163-1.447-.545-.516-1.146-1.29-1.46-1.963a.426.426 0 0 1-.073-.215c0-.33.99-.945.99-1.49 0-.143-.73-2.09-.832-2.335-.143-.372-.214-.487-.6-.487-.187 0-.36-.043-.53-.043-.302 0-.53.115-.746.315-.688.645-1.032 1.318-1.06 2.264v.114c-.015.99.472 1.977 1.017 2.78 1.23 1.82 2.506 3.41 4.554 4.34.616.287 2.035.888 2.722.888.817 0 2.15-.515 2.478-1.318.144-.358.36-1.39.36-1.768 0-.232-.018-.532-.45-.86l-1.94-1.21M16.43 26.5c-6.04 0-10.93-4.89-10.93-10.93 0-6.04 4.89-10.93 10.93-10.93 6.04 0 10.93 4.89 10.93 10.93 0 6.04-4.89 10.93-10.93 10.93m0-24.5C9.34 2 3.57 7.77 3.57 14.86c0 2.27.6 4.48 1.73 6.42L3.6 29.39l8.34-2.4c1.87 1 3.97 1.54 6.13 1.54h.01c7.08 0 13.03-5.77 13.03-12.86C31.1 7.77 25.52 2 16.43 2"
            />
          </svg>
        </div>

        <div className="absolute right-16 top-1/2 -translate-y-1/2 bg-foreground text-background px-3 py-1.5 rounded-lg shadow-lg text-xs font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          {t("waHint")}
        </div>
      </div>
    </a>
  );
};

export default WhatsAppButton;
