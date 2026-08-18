"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { upload } from "@vercel/blob/client";

import type { CatalogoImagenSlot } from "@/lib/catalogo-imagenes-store";

type Props = {
  slots: CatalogoImagenSlot[];
  /** URL actual resuelta por slot.id (override Redis → fallback /public). */
  resolvedUrls: Record<string, string | undefined>;
  /** True si el slot tiene override en Redis (para mostrar 'Restaurar default'). */
  hasOverride: Record<string, boolean>;
};

export function CatalogoImagenesManager({ slots, resolvedUrls, hasOverride }: Props) {
  return (
    <div className="flex flex-col gap-5">
      {slots.map((slot) => (
        <SlotCard
          key={slot.id}
          slot={slot}
          initialUrl={resolvedUrls[slot.id]}
          initialHasOverride={hasOverride[slot.id] ?? false}
        />
      ))}
    </div>
  );
}

function SlotCard({
  slot,
  initialUrl,
  initialHasOverride,
}: {
  slot: CatalogoImagenSlot;
  initialUrl: string | undefined;
  initialHasOverride: boolean;
}) {
  const [currentUrl, setCurrentUrl] = useState<string | undefined>(initialUrl);
  const [hasOverride, setHasOverride] = useState(initialHasOverride);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setUploading(true);
    setUploadProgress(0);
    try {
      const blob = await upload(`catalogo-imagenes/${slot.id}/${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/admin/catalogo-imagenes/upload",
        clientPayload: slot.id,
        onUploadProgress: ({ percentage }) => setUploadProgress(Math.round(percentage)),
      });
      // Fallback idempotente: el webhook onUploadCompleted no siempre
      // llega en deploys con protección activa. Llamamos /save directamente
      // para garantizar que la URL quede en Redis.
      await fetch("/api/admin/catalogo-imagenes/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: slot.id, url: blob.url }),
      });
      setCurrentUrl(blob.url);
      setHasOverride(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir");
    } finally {
      setUploading(false);
    }
  };

  const handleClear = () => {
    if (!confirm("¿Restaurar la imagen al default del repo?")) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/catalogo-imagenes/clear", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: slot.id }),
        });
        if (!res.ok) {
          const { error: msg } = (await res.json()) as { error?: string };
          throw new Error(msg || "Error al restaurar");
        }
        setCurrentUrl(slot.fallback);
        setHasOverride(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error");
      }
    });
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest text-[#0a2b3d]">
            {slot.title}
          </h2>
          <p className="mt-1 max-w-xl text-xs text-gray-600">{slot.description}</p>
        </div>
        {hasOverride ? (
          <span className="inline-block rounded bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-emerald-700">
            Override activo
          </span>
        ) : slot.fallback ? (
          <span className="inline-block rounded bg-gray-100 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-gray-600">
            Default del repo
          </span>
        ) : (
          <span className="inline-block rounded bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-700">
            Sin imagen
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_240px]">
        {/* Preview */}
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4">
          {currentUrl ? (
            /* Usamos <img> y no next/image porque la URL puede venir de
               Blob (dominios variables) — evita tener que mantener
               remotePatterns para cada hostname de Blob. El peso está
               controlado por recomendaciones de medidas. */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={currentUrl}
              alt={slot.title}
              className="mx-auto max-h-80 w-auto object-contain"
            />
          ) : (
            <div className="flex h-48 items-center justify-center text-xs text-gray-400">
              No hay imagen disponible. Subí una para que aparezca en el catálogo.
            </div>
          )}
        </div>

        {/* Acciones + recomendaciones */}
        <div className="flex flex-col gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              // Reset para poder subir el mismo archivo dos veces
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-primary-dark disabled:opacity-60"
          >
            {uploading
              ? `Subiendo... ${uploadProgress}%`
              : hasOverride
                ? "Reemplazar imagen"
                : "Subir imagen"}
          </button>

          {hasOverride ? (
            <button
              type="button"
              onClick={handleClear}
              disabled={pending}
              className="rounded-lg border border-gray-300 px-4 py-2 text-xs font-bold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
            >
              {pending ? "Restaurando..." : "Restaurar default"}
            </button>
          ) : null}

          {error ? (
            <p className="rounded-md bg-red-50 p-2 text-[11px] text-red-700">{error}</p>
          ) : null}

          <div className="rounded-md bg-gray-50 p-3 text-[11px]">
            <p className="font-bold uppercase tracking-widest text-gray-500">
              Recomendaciones
            </p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-gray-600">
              {slot.recomendaciones.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
