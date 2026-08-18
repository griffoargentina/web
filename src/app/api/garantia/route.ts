import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp, isBot } from "@/lib/antispam";
import { logAdminError } from "@/lib/admin-log";
import { escapeHtml } from "@/lib/escape";
import { saveLead } from "@/lib/leads";
import { sendEmail } from "@/lib/resend";
import { checkFieldLength, isValidEmail } from "@/lib/validate";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;

    if (isBot(body)) {
      return NextResponse.json({ ok: true });
    }
    const rl = await checkRateLimit("garantia", getClientIp(request));
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Demasiados envíos. Probá en ${Math.ceil(rl.resetSec / 60)} min.` },
        { status: 429 }
      );
    }

    const required = [
      "serial", "buying_date", "buying_place", "name", "company",
      "place", "country", "province", "city", "email", "phone",
    ];
    for (const k of required) {
      if (!body[k] || typeof body[k] !== "string" || !(body[k] as string).trim()) {
        return NextResponse.json(
          { error: `Campo obligatorio faltante: ${k}` },
          { status: 400 }
        );
      }
      const lenErr = checkFieldLength(String(body[k]), k);
      if (lenErr) {
        return NextResponse.json({ error: lenErr }, { status: 400 });
      }
    }

    const email = String(body.email);
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Email inválido" }, { status: 400 });
    }

    await saveLead({
      kind: "garantia",
      ts: Date.now(),
      serial: String(body.serial),
      buyingDate: String(body.buying_date),
      buyingPlace: String(body.buying_place),
      nombre: String(body.name),
      empresa: String(body.company),
      domicilio: String(body.place),
      pais: String(body.country),
      provincia: String(body.province),
      ciudad: String(body.city),
      email,
      telefono: String(body.phone),
      subscribe: !!body.subscribe,
    });

    try {
      await sendEmail({
        from: "Griffo <contacto@griffo.com.ar>",
        to: ["contacto@griffo.com.ar", "jgriffo@griffo.com.ar", "web@griffo.com.ar"],
        replyTo: email,
        subject: `Registro de garantía — ${body.name} (S/N: ${body.serial})`,
        html: `
          <h2>Nuevo registro de garantía de máquina montadora</h2>
          <table style="border-collapse:collapse;width:100%">
            <tr><td style="padding:5px;font-weight:bold">Número de serie</td><td style="padding:5px">${escapeHtml(body.serial)}</td></tr>
            <tr><td style="padding:5px;font-weight:bold">Fecha de compra</td><td style="padding:5px">${escapeHtml(body.buying_date)}</td></tr>
            <tr><td style="padding:5px;font-weight:bold">Lugar de compra</td><td style="padding:5px">${escapeHtml(body.buying_place)}</td></tr>
            <tr><td style="padding:5px;font-weight:bold">Nombre</td><td style="padding:5px">${escapeHtml(body.name)}</td></tr>
            <tr><td style="padding:5px;font-weight:bold">Empresa</td><td style="padding:5px">${escapeHtml(body.company)}</td></tr>
            <tr><td style="padding:5px;font-weight:bold">Domicilio</td><td style="padding:5px">${escapeHtml(body.place)}</td></tr>
            <tr><td style="padding:5px;font-weight:bold">País</td><td style="padding:5px">${escapeHtml(body.country)}</td></tr>
            <tr><td style="padding:5px;font-weight:bold">Provincia</td><td style="padding:5px">${escapeHtml(body.province)}</td></tr>
            <tr><td style="padding:5px;font-weight:bold">Ciudad</td><td style="padding:5px">${escapeHtml(body.city)}</td></tr>
            <tr><td style="padding:5px;font-weight:bold">Email</td><td style="padding:5px">${escapeHtml(body.email)}</td></tr>
            <tr><td style="padding:5px;font-weight:bold">Teléfono</td><td style="padding:5px">${escapeHtml(body.phone)}</td></tr>
            <tr><td style="padding:5px;font-weight:bold">Newsletter</td><td style="padding:5px">${body.subscribe ? "Sí" : "No"}</td></tr>
          </table>
        `,
      });
    } catch (e) {
      // Si Resend falla, el lead ya quedó en Redis — devolvemos OK igual.
      console.error("[garantia] error enviando email:", e);
      await logAdminError("resend", e);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[garantia] error:", e);
    return NextResponse.json({ error: "Error al enviar" }, { status: 500 });
  }
}
