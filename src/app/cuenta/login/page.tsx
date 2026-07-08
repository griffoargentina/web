import Link from "next/link";
import type { Metadata } from "next";
import { LoginForm } from "@/components/cuenta/LoginForm";

export const metadata: Metadata = {
  title: "Acceso clientes",
  description:
    "Portal para clientes mayoristas de Griffo. Ingresá para ver tu cuenta corriente, facturas, pedidos y lista de precios.",
  robots: { index: false, follow: false },
};

export default function LoginPage() {
  return (
    <section className="min-h-[calc(100vh-200px)] flex items-center justify-center bg-gray-50 py-16 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#00549F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <h1 className="text-2xl font-black text-[#0a2b3d]">
              Acceso clientes
            </h1>
          </div>

          <LoginForm />

          <div className="mt-5 pt-5 border-t border-gray-100 text-center text-sm text-gray-600">
            ¿Todavía no tenés cuenta?{" "}
            <Link href="/contacto" className="text-primary font-semibold hover:underline">
              Contactanos
            </Link>
          </div>
        </div>

        <div className="text-center mt-5">
          <Link href="/" className="text-sm text-gray-600 hover:text-[#0a2b3d] transition">
            ← Volver al sitio
          </Link>
        </div>
      </div>
    </section>
  );
}
