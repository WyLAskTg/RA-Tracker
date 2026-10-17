import Link from "next/link";
import { getCurrentUser, safeReturnPath } from "../auth";
import { redirect } from "next/navigation";

type Props = { searchParams: Promise<{ error?: string; return_to?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;
  const returnTo = safeReturnPath(params.return_to);
  if (await getCurrentUser()) redirect(returnTo);

  return <main className="auth-page"><section className="auth-card" aria-labelledby="login-title">
    <Link className="auth-brand" href="/"><span className="brand-mark">R</span><span>Research Tracker</span></Link>
    <div><p className="section-label">WELCOME BACK</p><h1 id="login-title">Sign in</h1><p className="auth-intro">Continue tracking your research applications.</p></div>
    {params.error && <p className="auth-error" role="alert">{params.error}</p>}
    <form action="/api/auth/login" method="post" className="auth-form">
      <input type="hidden" name="return_to" value={returnTo} />
      <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
      <label>Password<input name="password" type="password" autoComplete="current-password" required minLength={10} maxLength={128} /></label>
      <button className="button primary auth-submit" type="submit">Sign in</button>
    </form>
    <p className="auth-switch">New here? <Link href={`/register?return_to=${encodeURIComponent(returnTo)}`}>Create an account</Link></p>
  </section></main>;
}
