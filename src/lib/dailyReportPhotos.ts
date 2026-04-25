import { supabase } from "@/integrations/supabase/client";

export async function autoRotateImage(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => resolve(blob || file), "image/jpeg", 0.9);
    };
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Lädt ein Foto für einen Tagesbericht hoch:
 * - daily-report-photos Storage
 * - daily_report_photos DB-Tabelle
 * - Spiegel im project-photos Storage + documents-Tabelle (nur Bilder)
 */
export async function uploadDailyReportPhoto(params: {
  reportId: string;
  projectId: string;
  userId: string;
  file: File;
}): Promise<{ ok: boolean; error?: string }> {
  const { reportId, projectId, userId, file } = params;
  const isImage = file.type.startsWith("image/");
  const blob = isImage ? await autoRotateImage(file) : file;
  const ext = file.name.split(".").pop() || "jpg";
  const filePath = `${reportId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("daily-report-photos")
    .upload(filePath, blob);
  if (uploadError) return { ok: false, error: uploadError.message };

  await supabase.from("daily_report_photos").insert({
    daily_report_id: reportId,
    user_id: userId,
    file_path: filePath,
    file_name: file.name,
  });

  // Spiegel im Projekt-Foto-Bereich
  if (isImage && projectId) {
    const photoPath = `${projectId}/${Date.now()}_${file.name}`;
    const { error: mirrorErr } = await supabase.storage
      .from("project-photos")
      .upload(photoPath, blob, { upsert: false });
    if (!mirrorErr) {
      await supabase.from("documents").insert({
        name: file.name,
        project_id: projectId,
        typ: "photos",
        file_url: photoPath,
        user_id: userId,
        archived: false,
      });
    }
  }

  return { ok: true };
}
