import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermission("unsupported");
      return;
    }

    setPermission(Notification.permission);

    // Auto-subscribe if already granted
    if (Notification.permission === "granted") {
      subscribeToPush();
    }
  }, []);

  const requestPermission = async (): Promise<boolean> => {
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      return false;
    }

    const result = await Notification.requestPermission();
    setPermission(result);

    if (result === "granted") {
      await subscribeToPush();
      return true;
    }
    return false;
  };

  const subscribeToPush = async () => {
    try {
      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!vapidKey) return;

      const registration = await navigator.serviceWorker.ready;

      // Check for existing subscription
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
      }

      // Save to Supabase
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const subJson = subscription.toJSON();

      // Upsert subscription (avoid duplicates)
      const { data: existing } = await supabase
        .from("push_subscriptions")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (existing && existing.length > 0) {
        await supabase
          .from("push_subscriptions")
          .update({ subscription: subJson })
          .eq("id", existing[0].id);
      } else {
        await supabase
          .from("push_subscriptions")
          .insert({ user_id: user.id, subscription: subJson });
      }
    } catch (err) {
      console.error("Push subscription failed:", err);
    }
  };

  return { permission, requestPermission };
}
