import "server-only";

/** Send an email through Resend (https://resend.com). Silently skipped when not configured. */
export async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return false;
  const from = process.env.EMAIL_FROM || "NopeQ <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!res.ok) console.error("resend", res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.error("resend", e);
    return false;
  }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function emailLayout(title: string, rows: [string, string][], button?: { label: string; url: string }, footer?: string) {
  return `<!doctype html><html><body style="margin:0;background:#F7F8FA;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0D1224">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px">
    <div style="font-weight:800;font-size:22px;letter-spacing:-.5px">Nope<span style="color:#F0521F">Q</span></div>
    <div style="background:#fff;border:1px solid #E6E8EE;border-radius:16px;padding:24px;margin-top:16px">
      <h1 style="font-size:20px;margin:0 0 16px">${esc(title)}</h1>
      <table style="width:100%;border-collapse:collapse;font-size:15px">
        ${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#6B7186;width:110px">${esc(k)}</td><td style="padding:6px 0;font-weight:600">${esc(v)}</td></tr>`).join("")}
      </table>
      ${button ? `<a href="${button.url}" style="display:block;text-align:center;margin-top:20px;background:#F0521F;color:#fff;text-decoration:none;font-weight:700;padding:14px;border-radius:12px">${esc(button.label)}</a>` : ""}
    </div>
    <p style="font-size:12px;color:#6B7186;text-align:center;margin-top:16px">${footer ? esc(footer) + "<br>" : ""}powered by Ravion Studio</p>
  </div></body></html>`;
}
