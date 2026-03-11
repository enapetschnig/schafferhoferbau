-- New users must be activated by admin before they can access the app
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    NEW.id,
    CASE
      WHEN NEW.email = 'holzknecht.natursteine@gmail.com' THEN 'administrator'::app_role
      ELSE 'mitarbeiter'::app_role
    END
  )
  ON CONFLICT (user_id, role) DO NOTHING;

  -- New users start inactive (admin must activate)
  -- Admin email is auto-activated
  INSERT INTO public.profiles (id, vorname, nachname, is_active)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'vorname', ''),
    COALESCE(NEW.raw_user_meta_data->>'nachname', ''),
    CASE WHEN NEW.email = 'holzknecht.natursteine@gmail.com' THEN true ELSE false END
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Update ensure_user_profile RPC to default to inactive
CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid;
  _email text;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN RETURN json_build_object('success', false); END IF;

  -- Check if profile already exists
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id) THEN RETURN json_build_object('success', true); END IF;

  -- Get email
  SELECT email INTO _email FROM auth.users WHERE id = _user_id;

  -- Create profile (inactive by default, admin auto-activated)
  INSERT INTO public.profiles (id, vorname, nachname, is_active)
  SELECT
    _user_id,
    COALESCE(raw_user_meta_data->>'vorname', ''),
    COALESCE(raw_user_meta_data->>'nachname', ''),
    CASE WHEN email = 'holzknecht.natursteine@gmail.com' THEN true ELSE false END
  FROM auth.users WHERE id = _user_id
  ON CONFLICT (id) DO NOTHING;

  -- Assign default role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (
    _user_id,
    CASE WHEN _email = 'holzknecht.natursteine@gmail.com' THEN 'administrator'::app_role ELSE 'mitarbeiter'::app_role END
  )
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN json_build_object('success', true);
END;
$function$;
