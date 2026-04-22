import { useEffect, useState, useRef } from "react";

export type ProjectWeather = {
  min: number;
  max: number;
  avg: number;
  description: string;
  icon: string;
  weatherCode: number;
  source: "forecast" | "historical" | "current";
};

/**
 * Holt Wetter-Daten fuer eine Projektadresse an einem bestimmten Datum.
 *
 * Nutzt Open-Meteo:
 * - Datum in der Vergangenheit (>1 Tag alt): Archive API (historisch)
 * - Datum heute/Zukunft: Forecast API
 *
 * @param location  Freitext (PLZ, Adresse, Stadt) - wird via Geocoding aufgeloest
 * @param date  ISO-String (YYYY-MM-DD)
 * @returns  min/max-Temperatur + Wetter-Code + Icon
 */
export function useProjectWeather(location: string | null | undefined, date: string | null | undefined) {
  const [data, setData] = useState<ProjectWeather | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cache per key
  const cacheRef = useRef<Map<string, ProjectWeather>>(new Map());

  useEffect(() => {
    if (!location?.trim() || !date) {
      setData(null);
      setError(null);
      return;
    }
    const key = `${location.trim()}|${date}`;
    if (cacheRef.current.has(key)) {
      setData(cacheRef.current.get(key)!);
      setError(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // 1. Geocoding
        const searchTerm = `${location} Austria`;
        const geoResp = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchTerm)}&count=1&language=de&format=json`
        );
        const geoData = await geoResp.json();
        let lat = 47.07, lon = 15.44;
        if (geoData?.results?.[0]) {
          lat = geoData.results[0].latitude;
          lon = geoData.results[0].longitude;
        }

        // 2. Datum-Klassifikation
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const target = new Date(date);
        target.setHours(0, 0, 0, 0);
        const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

        let url: string;
        let source: ProjectWeather["source"];

        if (diffDays < -1) {
          // Historisch (Archive API, verzoegert ~2 Tage)
          url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&daily=temperature_2m_min,temperature_2m_max,weather_code&timezone=Europe/Vienna`;
          source = "historical";
        } else if (diffDays >= -1 && diffDays <= 16) {
          // Forecast (bis 16 Tage vorau)
          url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&daily=temperature_2m_min,temperature_2m_max,weather_code&timezone=Europe/Vienna`;
          source = "forecast";
        } else {
          setLoading(false);
          setError("Datum zu weit in der Zukunft (max. 16 Tage)");
          return;
        }

        const resp = await fetch(url);
        const weather = await resp.json();
        const d = weather?.daily;
        // Vorsicht: `!d.temperature_2m_min?.[0] == null` wuerde wegen Operator-
        // Praezedenz immer `false` ergeben. Richtig: direkt nullish-check.
        if (!d || d.temperature_2m_min?.[0] == null) {
          throw new Error("Keine Wetterdaten fuer dieses Datum");
        }

        const min = Math.round(d.temperature_2m_min[0]);
        const max = Math.round(d.temperature_2m_max[0]);
        const code = d.weather_code?.[0] ?? 0;

        const description =
          code <= 3 ? "Sonnig"
          : code <= 48 ? "Bewölkt"
          : code <= 67 ? "Regen"
          : code <= 77 ? "Schnee"
          : "Gewitter";
        const icon =
          code <= 3 ? "☀️"
          : code <= 48 ? "☁️"
          : code <= 67 ? "🌧️"
          : code <= 77 ? "❄️"
          : "⛈️";

        const result: ProjectWeather = {
          min,
          max,
          avg: Math.round((min + max) / 2),
          description,
          icon,
          weatherCode: code,
          source,
        };
        if (!cancelled) {
          cacheRef.current.set(key, result);
          setData(result);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Wetter konnte nicht geladen werden");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [location, date]);

  return { data, loading, error };
}
