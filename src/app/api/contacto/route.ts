import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp, isBot } from "@/lib/antispam";
import { escapeHtml, escapeHtmlMultiline } from "@/lib/escape";
import { logAdminError } from "@/lib/admin-log";
import { saveLead } from "@/lib/leads";
import { sendEmail } from "@/lib/resend";
import {
  checkFieldLength,
  isValidEmail,
  MAX_MESSAGE_LEN,
} from "@/lib/validate";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      nombre?: string;
      email?: string;
      telefono?: string;
      mensaje?: string;
      website?: string;
    };

    // Antispam — honeypot. Devolvemos 200 OK silenciosamente para no
    // dar feedback al bot de que detectamos el campo. NO guardamos lead.
    if (isBot(body)) {
      return NextResponse.json({ ok: true });
    }

    // Antispam — rate limit (3 envíos cada 10 min por IP).
    const rl = await checkRateLimit("contacto", getClientIp(request));
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Demasiados envíos. Probá en ${Math.ceil(rl.resetSec / 60)} min.` },
        { status: 429 }
      );
    }

    if (!body.nombre || !body.email || !body.mensaje) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios" },
        { status: 400 }
      );
    }
    const lenErr =
      checkFieldLength(body.nombre, "Nombre") ||
      checkFieldLength(body.email, "Email") ||
      (body.telefono && checkFieldLength(body.telefono, "Teléfono")) ||
      checkFieldLength(body.mensaje, "Mensaje", MAX_MESSAGE_LEN);
    if (lenErr) {
      return NextResponse.json({ error: lenErr }, { status: 400 });
    }
    if (!isValidEmail(body.email)) {
      return NextResponse.json(
        { error: "Email inválido" },
        { status: 400 }
      );
    }

    await saveLead({
      kind: "contacto",
      ts: Date.now(),
      nombre: body.nombre,
      email: body.email,
      telefono: body.telefono,
      mensaje: body.mensaje,
    });

    try {
      await sendEmail({
        from: "Griffo <contacto@griffo.com.ar>",
        to: ["contacto@griffo.com.ar", "jgriffo@griffo.com.ar"],
        replyTo: body.email,
        subject: `Consulta web de ${body.nombre}`,
        html: `
          <h2>Nueva consulta desde la web</h2>
          <p><strong>Nombre:</strong> ${escapeHtml(body.nombre)}</p>
          <p><strong>Email:</strong> ${escapeHtml(body.email)}</p>
          <p><strong>Teléfono:</strong> ${escapeHtml(body.telefono || "No proporcionado")}</p>
          <hr />
          <p><strong>Mensaje:</strong></p>
          <p>${escapeHtmlMultiline(body.mensaje)}</p>
        `,
      });
    } catch (e) {
      // Si Resend falla (API key faltante, sender no verificado, etc.)
      // el lead igual quedó guardado en Redis, así que devolvemos OK.
      console.error("[contacto] error enviando email:", e);
      await logAdminError("resend", e);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[contacto] error:", e);
    return NextResponse.json({ error: "Error al enviar" }, { status: 500 });
  }
}
