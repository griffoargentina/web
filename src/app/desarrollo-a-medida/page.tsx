import type { Metadata } from "next";
import Link from "next/link";
import { AssetImage } from "@/components/AssetImage";
import { AssetVideo } from "@/components/AssetVideo";
import { DesarrolloForm } from "@/components/DesarrolloForm";

export const metadata: Metadata = {
  title: "Desarrollo a medida",
  description:
    "Desarrollo a medida de piezas de caucho moldeado bajo demanda para industrias diversas.",
  keywords: ["desarrollo a medida", "piezas de caucho"],
  openGraph: {
    title: "Desarrollo a medida",
    description: "Desarrollo a medida de piezas de caucho moldeado.",
  },
};

// 7 logos de clientes
const CLIENTES = Array.from({ length: 7 }, (_, i) => i + 1);

export default function DesarrolloAMedidaPage() {
  return (
    /* Layout desktop: 2 columnas — contenido izq, formulario sticky der.
       Mobile: columna única, formulario al final (ver sección #consulta). */
    <div className="lg:flex lg:items-start">

      {/* ── COLUMNA IZQUIERDA: todo el contenido ───────────────────────── */}
      <div className="lg:flex-1 lg:min-w-0">

        {/* HERO */}
        <section className="container mx-auto max-w-4xl px-5 py-8 lg:py-12">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div className="space-y-3">
              <h1 className="text-2xl lg:text-3xl text-primary font-medium leading-tight">
                Desarrollos a medida de piezas de caucho moldeado
              </h1>
              <p className="text-base lg:text-lg text-gray-600 leading-relaxed font-medium">
                Proveemos piezas de caucho moldeado bajo demanda a empresas de la
                industria alimenticia, de petróleo, de electrodomésticos,
                autopartistas, entre otros. Donde nos caracterizamos por entender
                la necesidad de nuestros clientes y ofrecerle soluciones.
              </p>
            </div>
            <div className="flex justify-center lg:justify-end rounded-xl overflow-hidden">
              <AssetImage
                src="/images/empresa/industriales.jpg"
                alt="Piezas de caucho desarrollo a medida"
                caption="Piezas header"
                bare
                className="max-h-[300px] w-auto object-cover rounded-xl"
                fallbackAspect="aspect-[4/3]"
              />
            </div>
          </div>
        </section>

        {/* TECNOLOGÍA */}
        <section className="grid lg:grid-cols-2 grid-cols-1 bg-gray-100">
          <div className="flex flex-col justify-center p-10 lg:pl-16 xl:pl-24 lg:pr-10">
            <div className="flex gap-6 items-start">
              <AssetImage
                src="/images/desarrollo-a-medida/ico1.svg"
                alt="Icono Tecnología"
                bare
                className="w-16 h-16 object-contain flex-shrink-0 mt-1"
              />
              <div className="space-y-4">
                <h2 className="text-3xl text-primary font-bold">Tecnología</h2>
                <h3 className="text-primary text-lg font-medium leading-snug">
                  Contamos con todo el equipamiento necesario para producir
                  piezas moldeadas asegurando calidad.
                </h3>
                <p className="text-black text-sm leading-relaxed">
                  Disponemos de equipos de diferentes tamaños que nos permiten
                  cubrir diversas necesidades, para piezas de uso frecuente de
                  alta/media/baja producción y/o de grandes dimensiones.
                </p>
              </div>
            </div>
          </div>
          <div className="relative min-h-[300px] lg:min-h-[420px] max-h-[560px] overflow-hidden">
            <AssetVideo
              src="/videos/tecnologia.mp4"
              poster="/images/desarrollo-a-medida/tecnologia.jpg"
              label="Video: Tecnología"
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
        </section>

        {/* LABORATORIO PROPIO */}
        <section className="grid lg:grid-cols-2 grid-cols-1 bg-[#FBFBFB]">
          <div className="flex flex-col justify-center p-10 lg:pl-16 xl:pl-24 lg:pr-10">
            <div className="flex gap-6 items-start">
              <AssetImage
                src="/images/desarrollo-a-medida/ico2.svg"
                alt="Icono Laboratorio"
                bare
                className="w-16 h-16 object-contain flex-shrink-0 mt-1"
              />
              <div className="space-y-4">
                <h2 className="text-3xl text-primary font-bold">
                  Laboratorio Propio
                </h2>
                <h3 className="text-primary text-lg font-medium leading-snug">
                  Nos permite desarrollar y asegurar homogeneidad en compuestos
                  según las necesidades del cliente.
                </h3>
                <p className="text-black text-sm leading-relaxed">
                  Contamos con Reómetro, cámara de ozono, estufa, cicladora,
                  entre otros importantes elementos necesarios para asegurar la
                  calidad. Además de laboratorios externos para complementar
                  según requerimiento.
                </p>
              </div>
            </div>
          </div>
          <div className="relative min-h-[300px] lg:min-h-[420px] max-h-[560px] overflow-hidden">
            <AssetVideo
              src="/videos/medida.mp4"
              poster="/images/desarrollo-a-medida/laboratorio.jpg"
              label="Video: Laboratorio"
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
        </section>

        {/* ISO 9001 */}
        <aside className="bg-primary/10 py-12">
          <div className="container mx-auto max-w-4xl px-5">
            <h2 className="text-xl lg:text-2xl font-bold text-center text-black">
              Además, desde hace más de 20 años la empresa cuenta con la
              certificación ISO 9001.
            </h2>
          </div>
        </aside>

        {/* CLIENTES */}
        <aside className="py-16 container mx-auto max-w-4xl px-5">
          <h2 className="text-2xl lg:text-3xl font-bold text-center text-primary mb-10">
            Algunos de nuestros clientes
          </h2>
          <ul className="flex flex-wrap justify-center gap-12 items-center grayscale hover:grayscale-0 transition-all duration-500">
            {CLIENTES.map((n) => (
              <li key={n} className="min-w-[110px] flex justify-center">
                <AssetImage
                  src={`/clientes/cliente${n}.png`}
                  alt={`Cliente ${n}`}
                  bare
                  className="h-16 w-[110px] object-contain"
                />
              </li>
            ))}
          </ul>
        </aside>

        {/* FORMULARIO — mobile only (en desktop está en la columna sticky) */}
        <section
          id="consulta"
          className="lg:hidden bg-gray-50 py-14 scroll-mt-20"
        >
          <div className="container mx-auto max-w-2xl px-5">
            <h2 className="text-2xl font-black text-[#0a2b3d]">
              ¿Tenés un proyecto en mente?
            </h2>
            <p className="mt-3 text-gray-600 leading-relaxed">
              Contanos qué pieza necesitás y te asesoramos sin compromiso.
            </p>
            <div className="mt-6">
              <DesarrolloForm />
            </div>
          </div>
        </section>

      </div>

      {/* ── COLUMNA DERECHA: formulario sticky (solo desktop) ──────────── */}
      <aside className="hidden lg:block lg:sticky lg:top-20 self-start w-[380px] xl:w-[420px] shrink-0 border-l border-gray-200 bg-gray-50 min-h-screen px-8 py-10">
        <h2 className="text-xl font-black text-[#0a2b3d] leading-tight">
          ¿Tenés un proyecto en mente?
        </h2>
        <p className="mt-2 mb-6 text-sm text-gray-600 leading-relaxed">
          Contanos qué pieza necesitás y te asesoramos sin compromiso.
          Podés adjuntar un plano, foto o PDF de referencia.
        </p>
        <ul className="mb-6 space-y-2 text-sm text-gray-700">
          <li className="flex items-start gap-2">
            <span className="text-primary font-bold mt-0.5">✓</span>
            Asesoramiento técnico gratuito
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary font-bold mt-0.5">✓</span>
            Más de 50 años de experiencia
          </li>
          <li className="flex items-start gap-2">
            <span className="text-primary font-bold mt-0.5">✓</span>
            Certificación ISO 9001
          </li>
        </ul>
        <DesarrolloForm compact />
      </aside>

    </div>
  );
}
