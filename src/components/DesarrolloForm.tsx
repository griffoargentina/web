"use client";

import { useState, useRef } from "react";
import { HoneypotField } from "@/components/HoneypotField";

type Status = "idle" | "loading" | "ok" | "error";

const INDUSTRIAS = [
  "Alimenticia",
  "Petrolera",
  "Electrodomésticos",
  "Autopartista",
  "Construcción",
  "Minería",
  "Otra",
];

export function DesarrolloForm({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<Status>("idle");
  const [fileName, setFileName] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");

    try {
      const formData = new FormData(e.currentTarget);
      const res = await fetch("/api/desarrollo", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error();
      setStatus("ok");
      formRef.current?.reset();
      setFileName("");
    } catch {
      setStatus("error");
    }
  }

  const gap = compact ? "gap-3" : "gap-4";
  const inputCls = compact
    ? "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary"
    : "w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary";
  const selectCls = compact
    ? "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary appearance-none cursor-pointer"
    : "w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary appearance-none cursor-pointer";

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className={compact ? "space-y-3" : "bg-white rounded-lg shadow-lg p-6 lg:p-8 space-y-5"}
      encType="multipart/form-data"
    >
      <HoneypotField />
      {!compact && (
        <>
          <h3 className="text-xl font-black text-[#0a2b3d]">
            Contanos qué pieza necesitás
          </h3>
          <p className="text-sm text-gray-500">
            Completá el formulario y te asesoramos sin compromiso.
          </p>
        </>
      )}

      <div className={`grid grid-cols-2 ${gap}`}>
        <input id="nombre" name="nombre" type="text" placeholder="Nombre *" required className={inputCls} />
        <input id="empresa" name="empresa" type="text" placeholder="Empresa *" required className={inputCls} />
        <input id="email" name="email" type="email" placeholder="Email *" required className={inputCls} />
        <input id="telefono" name="telefono" type="tel" placeholder="Teléfono" className={inputCls} />
      </div>

      <div className={`grid grid-cols-2 ${gap}`}>
        <div>
          <label htmlFor="industria" className="sr-only">Industria</label>
          <select id="industria" name="industria" required className={selectCls} defaultValue="">
            <option value="" disabled>Industria *</option>
            {INDUSTRIAS.map((i) => (
              <option key={i} value={i}>{i}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cantidad" className="sr-only">Cantidad anual</label>
          <input id="cantidad" name="cantidad" type="text" placeholder="Cantidad anual" className={inputCls} />
        </div>
      </div>

      <div>
        <label htmlFor="descripcion" className="sr-only">Descripción de la pieza</label>
        <textarea
          id="descripcion"
          name="descripcion"
          required
          rows={compact ? 3 : 4}
          placeholder="Describí la pieza: uso, material, dimensiones aproximadas… *"
          className={`w-full ${compact ? "px-3 py-2 text-sm" : "px-4 py-3"} border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary resize-y`}
        />
      </div>

      {/* Upload de plano o muestra */}
      <div>
        {!compact && (
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            ¿Tenés plano o muestra? (imagen o PDF)
          </label>
        )}
        <div
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed border-gray-300 rounded-lg ${compact ? "p-2" : "p-4"} text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition`}
        >
          <input
            ref={fileRef}
            type="file"
            name="archivo"
            accept="image/*,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              setFileName(file ? file.name : "");
            }}
          />
          {fileName ? (
            <p className="text-sm text-primary font-semibold">
              📎 {fileName}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (fileRef.current) fileRef.current.value = "";
                  setFileName("");
                }}
                className="ml-2 text-red-500 hover:text-red-700"
              >
                ✕
              </button>
            </p>
          ) : (
            <p className="text-sm text-gray-400">
              📎 {compact ? "Adjuntar plano o PDF (máx. 5 MB)" : "Click para adjuntar imagen o PDF — Máx. 5 MB"}
            </p>
          )}
        </div>
      </div>

      <button
        type="submit"
        disabled={status === "loading"}
        className={`w-full ${compact ? "py-2.5 text-sm" : "sm:w-auto px-10 py-3"} uppercase bg-primary text-white font-bold rounded-full border border-primary hover:bg-white hover:text-primary transition disabled:opacity-60 cursor-pointer`}
      >
        {status === "loading" ? "Enviando..." : "Enviar consulta"}
      </button>

      {status === "ok" && (
        <p className="text-green-700 font-semibold text-sm">
          ¡Gracias! Recibimos tu consulta. Te contactamos a la brevedad.
        </p>
      )}
      {status === "error" && (
        <p className="text-red-700 font-semibold text-sm">
          Hubo un error. Probá de nuevo o escribinos por WhatsApp.
        </p>
      )}
    </form>
  );
}

function Field({
  name,
  placeholder,
  type = "text",
  required,
}: {
  name: string;
  placeholder: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={name} className="sr-only">
        {placeholder}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        placeholder={placeholder}
        required={required}
        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  );
}
