import { create } from "zustand";

// Global open state for the mini-cart drawer, so the header icon and "added to cart" flows share it.
type CartDrawerState = { open: boolean; setOpen: (open: boolean) => void };

export const useCartDrawer = create<CartDrawerState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
