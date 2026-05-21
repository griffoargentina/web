import type { Metadata } from "next";
import { PortalNav } from "@/components/cuenta/PortalNav";
import { CerrarSesionButton } from "@/components/cuenta/CerrarSesionButton";
import { ImpersonationBanner } from "@/components/cuenta/ImpersonationBanner";
import { getCurrentClient, isImpersonating, isUsingMockFallback } from "@/lib/b2b/current-client";

export const metadata: Metadata = {
  title: { default: "Mi cuenta", template: "%s | Portal clientes Griffo" },
  robots: { index: false, follow: false },
};

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const client = await getCurrentClient();
  const impersonating = await isImpersonating();
  const isMock = await isUsingMockFallback();

  return (
    <div className="bg-gray-50 min-h-[calc(100vh-220px)]">
      {impersonating ? <ImpersonationBanner clientName={client.name} /> : null}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-5 pt-5 pb-0">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold">
                Portal clientes
              </p>
              <h1 className="text-xl font-black text-[#0a2b3d] mt-0.5">
                {client.name}
              </h1>
              <p className="text-xs text-gray-600 mt-0.5">
                Código {client.client_id} · {client.email}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!impersonating && isMock && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900">
                  🚧 Modo demo
                </span>
              )}
              <CerrarSesionButton />
            </div>
          </div>
          <PortalNav />
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-5 py-8">{children}</div>
    </div>
  );
}
