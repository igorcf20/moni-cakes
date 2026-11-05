import { useState } from "react";
import { Check, Home, MapPin, Pencil, Plus, Receipt, Star, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useAddresses, type Address } from "@/hooks/useAddresses";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useMessages } from "@/i18n";
import { accountMessages } from "@/i18n/account";
import { addressCountryCode } from "@/lib/addressFormats";
import { countryName, useCountry } from "@/lib/countries";
import { cn } from "@/lib/utils";
import AddressForm from "./AddressForm";
import { addressLines } from "./accountUtils";
import { EmptyState, btnDanger, btnGhost, btnPrimary, btnSecondary, cardCls, focusRing, iconBtn } from "./ui";

const AddressManager = () => {
  const { t, locale } = useMessages(accountMessages);
  const { user } = useAuth();
  const country = useCountry();
  const { addresses, isLoading, deleteAddress, updateAddress } = useAddresses(user?.id);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);

  const openEdit = (address: Address) => { setEditingAddress(address); setIsDialogOpen(true); };
  const openAdd = () => { setEditingAddress(null); setIsDialogOpen(true); };
  const close = () => { setIsDialogOpen(false); setEditingAddress(null); };

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2" aria-busy="true">
        {[0, 1].map((i) => <div key={i} className="skeleton h-44 rounded-[20px]" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {addresses.length === 0 ? (
        <EmptyState Icon={MapPin} title={t("addrEmptyTitle")} text={t("addrEmptyText")}>
          <button type="button" onClick={openAdd} className={btnPrimary}><Plus className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden="true" />{t("addrAdd")}</button>
        </EmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[15px] text-muted-foreground">
              {addresses.length === 1 ? t("addrCount_one") : t("addrCount_other", { count: addresses.length })}
            </p>
            <button type="button" onClick={openAdd} className={cn(btnPrimary, "min-h-11 px-4 text-[14px]")}>
              <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />{t("addrAdd")}
            </button>
          </div>

          <ul className="grid gap-3 sm:grid-cols-2">
            {addresses.map((address) => {
              const name = address.name || t("addrUnnamed");
              const code = addressCountryCode(address.country, country.code);
              return (
                <li
                  key={address.id}
                  className={cn(cardCls, "flex flex-col p-4 sm:p-5", address.is_default && "border-primary/40 shadow-[var(--shadow-ring-royal)]")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-[12px]", address.is_default ? "bg-brand-orange-soft text-primary" : "bg-brand-alt text-brand-ink-soft")}>
                        <Home className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[16px] font-semibold">{name}</p>
                        {(address.is_default || address.is_billing_default) && (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {address.is_default && (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                                <Star className="h-3 w-3" strokeWidth={2} aria-hidden="true" />{t("addrBadgeShipping")}
                              </span>
                            )}
                            {address.is_billing_default && (
                              <span className="inline-flex items-center gap-1 rounded-lg bg-brand-alt px-2 py-0.5 text-[11px] font-bold text-brand-ink-soft">
                                <Receipt className="h-3 w-3" strokeWidth={2} aria-hidden="true" />{t("addrBadgeBilling")}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="-mr-2 -mt-2 flex shrink-0">
                      <button type="button" className={iconBtn} onClick={() => openEdit(address)} aria-label={t("addrEdit", { name })} title={t("addrEdit", { name })}>
                        <Pencil className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                      </button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button type="button" className={cn(iconBtn, "hover:bg-destructive/10 hover:text-destructive")} aria-label={t("addrRemove", { name })} title={t("addrRemove", { name })}>
                            <Trash2 className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-[20px]">
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-[20px] font-bold tracking-[-0.02em]">{t("addrRemoveTitle")}</AlertDialogTitle>
                            <AlertDialogDescription className="text-[15px] text-brand-ink-soft">{t("addrRemoveText", { name })}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter className="gap-2 sm:gap-2">
                            <AlertDialogCancel className={cn(btnSecondary, "mt-0")}>{t("cancel")}</AlertDialogCancel>
                            <AlertDialogAction className={btnDanger} onClick={() => deleteAddress(address.id)}>{t("addrRemoveConfirm")}</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  <address className="mt-3 flex-1 text-[14px] not-italic leading-relaxed text-brand-ink-soft">
                    {addressLines(address, countryName(code, locale)).map((l, i) => (
                      <span key={l} className={cn("block", i === 0 && "font-medium text-foreground")}>{l}</span>
                    ))}
                  </address>

                  {!address.is_default && (
                    <button type="button" onClick={() => updateAddress({ id: address.id, is_default: true })} className={cn(btnGhost, "-ml-3 mt-2 self-start")}>
                      <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />{t("addrSetDefault")}
                    </button>
                  )}
                </li>
              );
            })}
            <li>
              <button
                type="button" onClick={openAdd}
                className={cn("flex h-full min-h-[160px] w-full flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-dashed border-border bg-white/50 text-[15px] font-semibold text-brand-ink-soft transition-colors duration-150 hover:border-primary hover:bg-accent hover:text-brand-orange-text", focusRing)}
              >
                <span className="grid h-11 w-11 place-items-center rounded-[14px] border-2 border-dashed border-current"><Plus className="h-5 w-5" strokeWidth={2} aria-hidden="true" /></span>
                {t("addrNew")}
              </button>
            </li>
          </ul>
        </>
      )}

      <Dialog open={isDialogOpen} onOpenChange={(o) => (o ? setIsDialogOpen(true) : close())}>
        <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto rounded-[20px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[22px] font-bold tracking-[-0.02em]">
              <MapPin className="h-5 w-5 text-primary" strokeWidth={1.8} aria-hidden="true" />
              {editingAddress ? t("addrEditTitle") : t("addrNew")}
            </DialogTitle>
            <DialogDescription className="sr-only">{editingAddress ? t("addrEditTitle") : t("addrNew")}</DialogDescription>
          </DialogHeader>
          <AddressForm key={editingAddress?.id ?? "new"} address={editingAddress} onClose={close} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AddressManager;
