-- Add country column to user_addresses
ALTER TABLE public.user_addresses 
ADD COLUMN country TEXT DEFAULT 'Brasil';

-- Update guest-order edge function to handle international addresses if needed
-- Actually the function already takes shippingAddress as a JSON object, 
-- so as long as we pass the country in that object, it will be saved in orders.shipping_address.
