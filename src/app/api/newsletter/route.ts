import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp, isBot } from "@/lib/antispam";
import { logAdminError } from "@/lib/admin-log";
import { escapeHtml } from "@/lib/escape";
import { saveLead } from "@/lib/leads";
import { sendEmail } from "@/lib/resend";
import { isValidEmail } from "@/lib/validate";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string;
      website?: string;
    };
    const { email } = body;

    if (isBot(body)) {
      return NextResponse.json({ ok: true });
    }
    const rl = await checkRateLimit("newsletter", getClientIp(request), {
      max: 5,
      windowSec: 600,
    });
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Demasiados envíos. Probá en ${Math.ceil(rl.resetSec / 60)} min.` },
        { status: 429 }
      );
    }

    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { error: "Email inválido" },
        { status: 400 }
      );
    }

    await saveLead({ kind: "newsletter", ts: Date.now(), email });

    try {
      await sendEmail({
        from: "Griffo <contacto@griffo.com.ar>",
        to: ["contacto@griffo.com.ar", "jgriffo@griffo.com.ar", "web@griffo.com.ar"],
        subject: `Nueva suscripción al newsletter: ${email}`,
        html: `
          <h2>Nueva suscripción al newsletter</h2>
          <p><strong>Email:</strong> ${escapeHtml(email)}</p>
          <p>El usuario solicitó recibir información sobre productos, lanzamientos y promociones.</p>
        `,
      });
    } catch (e) {
      console.error("[newsletter] error enviando email:", e);
      await logAdminError("resend", e);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[newsletter] error:", e);
    return NextResponse.json({ error: "Error al enviar" }, { status: 500 });
  }
}
