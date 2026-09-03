"use client";

import { useActionState } from "react";
import { LockKeyhole } from "lucide-react";
import { login, type AdminActionState } from "@/app/admin/actions";
import { Brand } from "@/components/brand";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, {} as AdminActionState);
  return <main className="flex min-h-screen items-center justify-center px-4 py-10"><section className="glass-panel w-full max-w-sm p-6 sm:p-8"><Brand /><div className="mt-8 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><LockKeyhole /></div><h1 className="mt-4 text-2xl font-black">Administración</h1><p className="mt-2 text-sm text-zinc-500">Acceso exclusivo para administradores autorizados.</p><form action={action} className="mt-6 space-y-4"><div><label htmlFor="email" className="field-label">Correo</label><input className="field" type="email" id="email" name="email" autoComplete="email" required /></div><div><label htmlFor="password" className="field-label">Contraseña</label><input className="field" type="password" id="password" name="password" autoComplete="current-password" minLength={8} required /></div>{state.error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{state.error}</p>}<button type="submit" className="primary-button" disabled={pending}>{pending ? "Ingresando…" : "Ingresar"}</button></form></section></main>;
}
