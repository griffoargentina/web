"use client";

import { useEffect, useState } from "react";

/**
 * Botón flotante mobile que lleva al formulario de consulta.
 * Se oculta con transición suave cuando el formulario entra en pantalla.
 * Solo visible en mobile (lg:hidden).
 */
export function FloatingConsultarButton() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const target = document.getElementById("consulta");
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`lg:hidden fixed bottom-0 left-0 right-0 z-20 px-4 pb-5 pt-8 bg-gradient-to-t from-white via-white/80 to-transparent pointer-events-none transition-all duration-300 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
      }`}
    >
      <a
        href="#consulta"
        className={`pointer-events-auto flex items-center justify-center gap-2 w-full py-3.5 px-6 bg-primary text-white font-black rounded-full shadow-lg text-sm uppercase tracking-wide hover:bg-primary-dark active:scale-[0.98] transition-all ${
          visible ? "" : "pointer-events-none"
        }`}
      >
        ¿Tenés un proyecto en mente?
        <span aria-hidden>→</span>
      </a>
    </div>
  );
}
