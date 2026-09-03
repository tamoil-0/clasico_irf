import Link from "next/link";
export default function NotFound() { return <main className="flex min-h-screen items-center justify-center px-4"><div className="text-center"><p className="text-sm font-bold text-primary">404</p><h1 className="mt-2 text-2xl font-black">Registro no encontrado</h1><Link href="/" className="secondary-button mt-6">Volver al inicio</Link></div></main>; }
