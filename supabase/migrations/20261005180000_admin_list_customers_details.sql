-- Admin > Clientes: a lista passa a trazer o país do documento fiscal (para mostrar CPF/CNPJ, NIF... com a
-- máscara certa), o último acesso e se a conta é de administrador (fica fora dos números de clientes).
-- Muda as colunas devolvidas, por isso a função é recriada; continua só para administradores.
DROP FUNCTION IF EXISTS public.admin_list_customers();

CREATE FUNCTION public.admin_list_customers()
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  phone text,
  tax_id text,
  created_at timestamptz,
  tax_id_country text,
  last_sign_in_at timestamptz,
  is_admin boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id AS user_id,
    u.email::text,
    p.full_name,
    p.phone,
    p.tax_id,
    u.created_at,
    p.tax_id_country,
    u.last_sign_in_at,
    EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id AND r.role = 'admin'::app_role) AS is_admin
  FROM auth.users u
  LEFT JOIN public.user_profiles p ON p.user_id = u.id
  WHERE public.has_role(auth.uid(), 'admin'::app_role)
  ORDER BY u.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_customers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_customers() TO authenticated;
