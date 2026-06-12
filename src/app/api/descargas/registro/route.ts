import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp, isBot } from "@/lib/antispam";
import { logAdminError } from "@/lib/admin-log";
import { escapeHtml } from "@/lib/escape";
import { saveLead } from "@/lib/leads";
import { sendEmail } from "@/lib/resend";
import { checkFieldLength, isValidEmail } from "@/lib/validate";

/**
 * Registro para descarga de recursos gated (banco de imágenes, base de
 * datos). Notifica a contacto@griffo.com.ar con los datos del lead.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      nombre?: string;
      empresa?: string;
      email?: string;
      telefono?: string;
      compraA?: string;
      recursoId?: string;
      recursoTitulo?: string;
      website?: string;
    };

    if (isBot(body)) {
      return NextResponse.json({ ok: true });
    }
    const rl = await checkRateLimit("descarga", getClientIp(request));
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Demasiados envíos. Probá en ${Math.ceil(rl.resetSec / 60)} min.` },
        { status: 429 }
      );
    }

    if (
      !body.nombre ||
      !body.empresa ||
      !body.email ||
      !body.telefono ||
      !body.compraA ||
      !body.recursoId
    ) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios" },
        { status: 400 }
      );
    }
    const lenErr =
      checkFieldLength(body.nombre, "Nombre") ||
      checkFieldLength(body.empresa, "Empresa") ||
      checkFieldLength(body.email, "Email") ||
      checkFieldLength(body.telefono, "Teléfono") ||
      checkFieldLength(body.compraA, "Compra a");
    if (lenErr) {
      return NextResponse.json({ error: lenErr }, { status: 400 });
    }
    if (!isValidEmail(body.email)) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }

    await saveLead({
      kind: "descarga",
      ts: Date.now(),
      nombre: body.nombre,
      empresa: body.empresa,
      email: body.email,
      telefono: body.telefono,
      compraA: body.compraA,
      recurso: body.recursoTitulo ?? body.recursoId,
    });

    try {
      await sendEmail({
        from: "Griffo <contacto@griffo.com.ar>",
        to: ["contacto@griffo.com.ar", "jgriffo@griffo.com.ar"],
        replyTo: body.email,
        subject: `Descarga registrada: ${body.recursoTitulo ?? body.recursoId}`,
        html: `
          <h2>Nuevo registro para descarga</h2>
          <p>Recurso solicitado: <strong>${escapeHtml(body.recursoTitulo ?? body.recursoId)}</strong></p>
          <table style="border-collapse:collapse;width:100%;max-width:600px">
            <tr><td style="padding:6px;font-weight:bold;border-bottom:1px solid #eee">Nombre</td><td style="padding:6px;border-bottom:1px solid #eee">${escapeHtml(body.nombre)}</td></tr>
            <tr><td style="padding:6px;font-weight:bold;border-bottom:1px solid #eee">Empresa</td><td style="padding:6px;border-bottom:1px solid #eee">${escapeHtml(body.empresa)}</td></tr>
            <tr><td style="padding:6px;font-weight:bold;border-bottom:1px solid #eee">Email</td><td style="padding:6px;border-bottom:1px solid #eee">${escapeHtml(body.email)}</td></tr>
            <tr><td style="padding:6px;font-weight:bold;border-bottom:1px solid #eee">Teléfono</td><td style="padding:6px;border-bottom:1px solid #eee">${escapeHtml(body.telefono)}</td></tr>
            <tr><td style="padding:6px;font-weight:bold;border-bottom:1px solid #eee">Compra Griffo a</td><td style="padding:6px;border-bottom:1px solid #eee">${escapeHtml(body.compraA)}</td></tr>
          </table>
        `,
      });
    } catch (e) {
      console.error("[descargas/registro] error enviando email:", e);
      await logAdminError("resend", e);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[descargas/registro] error:", e);
    return NextResponse.json({ error: "Error al enviar" }, { status: 500 });
  }
}
