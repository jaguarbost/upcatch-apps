export type EmailKind = 'welcome_email' | 'paired_email' | 'trusted_email'
export type EmailPayload = {
  title?: string
  text?: string
  to?: string
  expires_at?: string
  meetup_id?: string
  partner_name?: string
  venue?: string
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]!)

export function notificationEmail(kind: EmailKind, siteOrigin: string, payload: EmailPayload = {}) {
  const origin = new URL(siteOrigin)
  if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && origin.hostname === 'localhost')) {
    throw new Error('Email links require a trusted HTTPS origin.')
  }
  const url = origin.origin + '/app'
  const paired = kind === 'paired_email'
  const trusted = kind === 'trusted_email'
  const welcome = kind === 'welcome_email'
  const welcomeSteps = [
    { title: 'Choose your catch-up', text: 'Pick Coffee, Dine or Drinks, and choose friends, new people, or both.' },
    { title: "Go Live when you're free", text: "Allow location and go online when you're ready. We'll search for a compatible person nearby." },
    { title: 'Both say yes', text: 'Once you both accept, agree on a public spot in chat. Confirm arrival, then rate your meetup afterwards.' },
  ]
  const howItWorksText = welcome ? ['How it works', ...welcomeSteps.map((step, index) => (index + 1) + '. ' + step.title + '\n' + step.text)].join('\n\n') : ''
  const subject = trusted ? (payload.title || 'UpCatch meetup details')
    : paired ? "You're paired up. Let the hello begin!" : 'Welcome to UpCatch. Your next hello starts here.'
  const heading = trusted ? 'A little peace of mind.' : paired ? 'Two yeses. One new hello.' : 'Less scrolling. More hellos.'
  const intro = trusted ? (payload.text || 'Your contact has shared their UpCatch meetup details with you.')
    : paired ? `You and ${payload.partner_name || 'your new catch'} both said yes. Time to take this hello into the real world.`
      : "You're in! Your profile is ready, and your next great conversation could be just around the corner."
  const detail = trusted ? 'These details were shared by your contact. Plans can change; check in with them directly for the latest.'
    : paired ? (payload.venue ? `The meeting spot: ${payload.venue}. Open UpCatch for the latest plan and to say you're on your way.`
      : "Pick a public meeting spot together in UpCatch, then say you're on your way.")
      : "Got a little free time? Go Live when you're ready. We'll look for someone in your city who's free too. You both get a say before any meetup is confirmed."
  const label = paired ? 'See your meetup' : 'Find your next hello'
  const eyebrow = trusted ? 'LOOKING OUT FOR EACH OTHER' : paired ? 'IT’S A CATCH' : 'GOOD TO HAVE YOU HERE'
  const footer = trusted ? 'You received this because an UpCatch member chose you as their trusted contact.'
    : paired ? 'You received this because you both accepted an UpCatch meetup.' : 'You received this because you completed your UpCatch profile.'
  const text = [subject, heading, intro, detail, howItWorksText, trusted ? '' : `${label}: ${url}`, footer].filter(Boolean).join('\n\n')
  const display = "'Bricolage Grotesque',Arial,sans-serif"
  const body = "'Figtree',Arial,sans-serif"
  const howItWorksHtml = welcome ? "<table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"margin:28px 0 0;background:#2b59ff;border-radius:20px\"><tr><td bgcolor=\"#2b59ff\" style=\"padding:24px;border-radius:20px\"><h2 style=\"margin:0 0 20px;font-family:" + display + ";font-size:26px;line-height:1.2;font-weight:800;color:#ffc940\">How it works</h2><table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\">"
    + welcomeSteps.map((step, index) => "<tr><td width=\"40\" valign=\"top\" style=\"padding:0 8px 18px 0\"><table role=\"presentation\" width=\"32\" cellspacing=\"0\" cellpadding=\"0\"><tr><td align=\"center\" bgcolor=\"#ffc940\" style=\"height:32px;border-radius:10px;font-family:" + display + ";font-size:18px;font-weight:800;color:#0e1726\">" + (index + 1)
      + "</td></tr></table></td><td valign=\"top\" style=\"padding:0 0 18px;color:#ffffff\"><p style=\"margin:0 0 6px;font-family:" + display + ";font-size:18px;line-height:1.3;font-weight:700\">" + escapeHtml(step.title)
      + "</p><p style=\"margin:0;font-size:14px;line-height:1.6\">" + escapeHtml(step.text) + '</p></td></tr>').join('')
    + '</table></td></tr></table>' : ''
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@600;700;800&amp;family=Figtree:wght@400;500;600;700&amp;display=swap" rel="stylesheet">
<style>@media(max-width:600px){.outer{padding:16px 8px!important}.content{padding:28px 24px!important}.headline{font-size:36px!important}}</style></head>
<body style="margin:0;padding:0;background:#f3f5f8;color:#0e1726;font-family:${body}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(intro)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f5f8"><tr><td class="outer" align="center" style="padding:40px 16px">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #dde2ea;border-radius:24px;overflow:hidden">
<tr><td class="content" style="padding:32px 40px;background:#ffc940;border-radius:24px 24px 0 0">
<p style="margin:0 0 32px;font-family:${display};font-size:28px;font-weight:800;letter-spacing:-1px">upcatch<span style="color:#2b59ff">.</span></p>
<p style="margin:0 0 14px;font-size:11px;letter-spacing:2px;font-weight:700">${eyebrow}</p>
<h1 class="headline" style="margin:0;font-family:${display};font-size:44px;line-height:1.08;letter-spacing:-1.5px;font-weight:800">${heading}</h1>
<p style="margin:22px 0 0;font-size:14px;font-weight:600">A little free time. A whole lot of possibility.</p></td></tr>
<tr><td class="content" style="padding:32px 40px 36px">
<p style="margin:0 0 20px;font-size:18px;line-height:1.6">${escapeHtml(intro)}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:20px;background:#f3f5f8;border:1px solid #dde2ea;border-radius:16px;font-size:15px;line-height:1.6">${escapeHtml(detail)}</td></tr></table>
${howItWorksHtml}
${trusted ? '' : `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 0"><tr><td bgcolor="#2b59ff" style="border-radius:999px;text-align:center"><a href="${escapeHtml(url)}" style="display:inline-block;padding:16px 28px;border:1px solid #2b59ff;border-radius:999px;font-family:${body};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;mso-padding-alt:16px 28px">${label} &rarr;</a></td></tr></table>
<p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#5a6475">Button taking a breather? <a href="${escapeHtml(url)}" style="color:#2b59ff;text-decoration:underline">Open UpCatch here</a>.</p>`}
<p style="margin:28px 0 0;font-family:${display};font-size:20px;font-weight:700">See you out there,<br>The UpCatch crew</p></td></tr></table>
<p style="max-width:480px;margin:22px 12px 0;font-size:12px;line-height:1.6;color:#5a6475">${footer}<br><a href="${escapeHtml(origin.origin + '/privacy')}" style="color:#5a6475">Privacy</a></p>
</td></tr></table></body></html>`
  return { subject, text, html }
}
