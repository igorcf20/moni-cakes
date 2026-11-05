-- Update visual_settings with more options
UPDATE public.store_settings
SET value = value || '{
  "logo_url": "",
  "primary_color": "#b8860b",
  "secondary_color": "#fdf5e6",
  "font_family": "jost",
  "header_sticky": true,
  "announcement_bar": {
    "enabled": true,
    "text": "Frete grátis em compras acima de R$ 200!",
    "link": "",
    "bg_color": "#000000",
    "text_color": "#ffffff"
  }
}'::jsonb
WHERE key = 'visual_settings';
