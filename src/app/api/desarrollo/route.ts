import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp, isBot } from "@/lib/antispam";
import { logAdminError } from "@/lib/admin-log";
import { escapeHtml, escapeHtmlMultiline } from "@/lib/escape";
import { saveLead } from "@/lib/leads";
import { sendEmail } from "@/lib/resend";
import {
  checkFieldLength,
  isValidEmail,
  MAX_MESSAGE_LEN,
} from "@/lib/validate";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    if (isBot(formData)) {
      return NextResponse.json({ ok: true });
    }
    const rl = await checkRateLimit("desarrollo", getClientIp(request));
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Demasiados envíos. Probá en ${Math.ceil(rl.resetSec / 60)} min.` },
        { status: 429 }
      );
    }

    const nombre = formData.get("nombre") as string;
    const empresa = formData.get("empresa") as string;
    const email = formData.get("email") as string;
    const telefono = (formData.get("telefono") as string) || "No proporcionado";
    const industria = formData.get("industria") as string;
    const cantidad = (formData.get("cantidad") as string) || "No especificada";
    const descripcion = formData.get("descripcion") as string;
    const archivo = formData.get("archivo") as File | null;

    if (!nombre || !empresa || !email || !industria || !descripcion) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios" },
        { status: 400 }
      );
    }
    const lenErr =
      checkFieldLength(nombre, "Nombre") ||
      checkFieldLength(empresa, "Empresa") ||
      checkFieldLength(email, "Email") ||
      checkFieldLength(telefono, "Teléfono") ||
      checkFieldLength(industria, "Industria") ||
      checkFieldLength(cantidad, "Cantidad") ||
      checkFieldLength(descripcion, "Descripción", MAX_MESSAGE_LEN);
    if (lenErr) {
      return NextResponse.json({ error: lenErr }, { status: 400 });
    }
    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Email inválido" },
        { status: 400 }
      );
    }

    // Preparar adjunto si hay archivo
    const attachments: Array<{
      filename: string;
      content: Buffer;
    }> = [];

    if (archivo && archivo.size > 0) {
      if (archivo.size > 5 * 1024 * 1024) {
        return NextResponse.json(
          { error: "El archivo no puede superar 5 MB" },
          { status: 400 }
        );
      }
      const buffer = Buffer.from(await archivo.arrayBuffer());
      attachments.push({
        filename: archivo.name,
        content: buffer,
      });
    }

    // Persiste el lead en Redis primero — si el email a Resend falla
    // (sender no verificado, etc), igual queda registrado para el admin.
    await saveLead({
      kind: "desarrollo",
      ts: Date.now(),
      nombre,
      empresa,
      email,
      telefono,
      industria,
      cantidad,
      descripcion,
      archivoNombre: archivo?.name,
    });

    await sendEmail({
      from: "Griffo <contacto@griffo.com.ar>",
      to: ["contacto@griffo.com.ar", "jgriffo@griffo.com.ar"],
      replyTo: email,
      subject: `Consulta desarrollo a medida — ${empresa}`,
      attachments,
      html: `
        <h2>Nueva consulta de desarrollo a medida</h2>
        <table style="border-collapse:collapse;width:100%">
          <tr><td style="padding:6px;font-weight:bold;border-bottom:1px solid #eee">Nombre</td><td style="padding:6px;border-bottom:1px solid #eee">${escapeHtml(nombre)}</td></tr>
          <tr><td style="padding:6px;font-weight:bold;border-bottom:1px solid #eee">Empresa</td><td style="padding:6px;border-bottom:1px solid #eee">${escapeHtml(empresa)}</td></tr>
          <tr><td style="padding:6px;font-weight:bold;border-bottom:1px solid #eee">Email</td><td style="padding:6px;border-bottom:1px solid #eee">${escapeHtml(email)}</td></tr>
          <tr><td style="padding:6px;font-weight:bold;border-bottom:1px solid #eee">Teléfono</td><td style="padding:6px;border-bottom:1px solid #eee">${escapeHtml(telefono)}</td></tr>
          <tr><td style="padding:6px;font-weight:bold;border-bottom:1px solid #eee">Industria</td><td style="padding:6px;border-bottom:1px solid #eee">${escapeHtml(industria)}</td></tr>
          <tr><td style="padding:6px;font-weight:bold;border-bottom:1px solid #eee">Cantidad estimada</td><td style="padding:6px;border-bottom:1px solid #eee">${escapeHtml(cantidad)}</td></tr>
        </table>
        <h3 style="margin-top:20px">Descripción de la pieza</h3>
        <p>${escapeHtmlMultiline(descripcion)}</p>
        ${attachments.length > 0 ? `<p style="margin-top:15px;color:#666">📎 Archivo adjunto: ${escapeHtml(archivo!.name)}</p>` : ""}
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[desarrollo] error:", e);
    await logAdminError("resend", e);
    return NextResponse.json({ error: "Error al enviar" }, { status: 500 });
  }
}
