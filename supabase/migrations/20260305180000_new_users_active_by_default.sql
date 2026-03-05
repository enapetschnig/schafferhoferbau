-- New users are automatically active (no admin approval needed)
-- Update handle_new_user to set is_active = true

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Owner email always gets administrator, everyone else gets mitarbeiter
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    CASE
      WHEN NEW.email = 'holzknecht.natursteine@gmail.com' THEN 'administrator'::app_role
      ELSE 'mitarbeiter'::app_role
    END
  )
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Create profile entry - all new users are active by default
  INSERT INTO public.profiles (id, vorname, nachname, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'vorname', ''),
    COALESCE(NEW.raw_user_meta_data->>'nachname', ''),
    true
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Also change the column default so is_active defaults to true
ALTER TABLE public.profiles ALTER COLUMN is_active SET DEFAULT true;
