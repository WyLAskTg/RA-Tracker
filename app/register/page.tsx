import Link from "next/link";
import { getCurrentUser, safeReturnPath } from "../auth";
import { redirect } from "next/navigation";

type Props = { searchParams: Promise<{ error?: string; return_to?: string }> };

export default async function RegisterPage({ searchParams }: Props) {
  const params = await searchParams;
  const returnTo = safeReturnPath(params.return_to);
  if (await getCurrentUser()) redirect(returnTo);

  return <main className="auth-page"><section className="auth-card" aria-labelledby="register-title">
    <Link className="auth-brand" href="/"><span className="brand-mark">R</span><span>Research Tracker</span></Link>
    <div><p className="section-label">GET STARTED</p><h1 id="register-title">Create your account</h1><p className="auth-intro">Each account keeps its terms and applications private.</p></div>
    {params.error && <p className="auth-error" role="alert">{params.error}</p>}
    <form action="/api/auth/register" method="post" className="auth-form">
      <input type="hidden" name="return_to" value={returnTo} />
      <label>Email<input name="email" type="email" autoComplete="email" required maxLength={254} /></label>
      <label>Password<input name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} aria-describedby="password-help" /></label>
      <p id="password-help" className="field-help">Use at least 10 characters.</p>
      <button className="button primary auth-submit" type="submit">Create account</button>
    </form>
    <p className="auth-switch">Already have an account? <Link href={`/login?return_to=${encodeURIComponent(returnTo)}`}>Sign in</Link></p>
  </section></main>;
}
