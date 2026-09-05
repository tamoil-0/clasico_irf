# Clásico IRF

Micrositio independiente, mobile-first, para la dinámica privada de predicciones deportivas de IRF. Usa Next.js, TypeScript, Tailwind CSS y Supabase. Vive enteramente dentro de `clasico-irf/`; no modifica ni comparte el build de la web institucional del repositorio padre.

El sistema no simula Supabase. Sin credenciales o sin QR oficial, muestra el estado de configuración y bloquea nuevos registros. No existe pago ni liquidación automática: el participante aporta con Yape y un administrador verifica manualmente el comprobante.

## A. Requisitos

- Node.js 20 o 22 y npm.
- Cuenta y proyecto en Supabase.
- Cuenta en Vercel.
- QR oficial de IRF y, si corresponde, nombre real del titular/receptor.
- Revisión legal, tributaria y de privacidad antes de operar con dinero real en Perú.

## B. Desarrollo local

```bash
cd D:\IRF\irf_so\clasico-irf
npm install
Copy-Item .env.example .env.local
npm run dev
```

Abre `http://localhost:3000`. Verificaciones disponibles:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

## C. Supabase

### 1. Crear y migrar el proyecto

1. Crea un proyecto en [Supabase](https://supabase.com/dashboard).
2. En **Project Settings → API**, copia Project URL, anon key y service role key.
3. En **SQL Editor**, ejecuta en orden:
   - `supabase/migrations/202609020001_initial_schema.sql`
   - `supabase/migrations/202609030001_public_verified_and_atomic_verification.sql`
   - `supabase/migrations/202609030002_team_assets_bucket.sql`
   - `supabase/migrations/202609050001_public_registered_predictions_and_team_order.sql`
4. Ejecuta `supabase/seed.sql`. Solo crea el evento solicitado y la configuración base: no inserta participantes ni datos personales ficticios. El evento nace `CLOSED` y sin QR.

Con Supabase CLI, la alternativa es:

```bash
supabase link --project-ref TU_PROJECT_REF
supabase db push
supabase db seed
```

### 2. Tablas y seguridad

- `events`: partido, horario, cierre, multiplicador, estado y riesgo.
- `predictions`: identidad, contacto, elección, importes, comprobante y verificación.
- `settings`: ruta del QR, nombre del receptor, reglas, mantenimiento y límite de archivo.
- `admins`: allowlist vinculada a Supabase Auth.
- `settlements`: cálculos administrativos posteriores al resultado.
- `submission_attempts`: rate limit anonimizado.

Todas las tablas tienen RLS. `anon` no puede listar ni modificar participantes, teléfonos, comprobantes o notas. La RPC `public_registered_predictions` expone exclusivamente:

- `masked_name`
- `team_selected`
- `display_amount`
- `status`
- `created_at`
- `verified_at`

Solo devuelve filas `PENDING` o `VERIFIED`. Para una pendiente, `display_amount` es el monto declarado; para una verificada, es el monto realmente verificado. El enmascaramiento se realiza dentro de Postgres, no después de exponer el nombre completo.

### 3. Storage

La migración crea dos buckets privados:

- `receipts`: comprobantes JPG/JPEG, PNG o WEBP.
- `payment-assets`: QR oficial.

Ambos admiten hasta 10 MB a nivel bucket; `settings.max_receipt_mb` aplica el límite operativo configurable, 5 MB por defecto. Los comprobantes se renombran como `UUID.ext`. El navegador nunca recibe una URL pública permanente: administración genera signed URLs de 120 segundos y el QR se entrega con una signed URL de 5 minutos.

### 4. Crear el administrador

1. Ve a **Authentication → Users → Add user**.
2. Crea el usuario con correo real y contraseña robusta.
3. Copia su UUID y ejecuta:

```sql
insert into public.admins(user_id) values ('UUID-DEL-USUARIO');
```

El acceso queda en `/admin`. La ruta no es el control de seguridad: cada página y acción comprueba la sesión y la tabla `admins`. No hay contraseñas hardcodeadas. Activa MFA para operación real.

### 5. QR oficial

No se encontró un QR identificable dentro del proyecto IRF padre. Para no inventar datos de pago, el formulario permanece cerrado hasta completar este paso:

1. Entra en `/admin`.
2. Abre **Configuración → QR oficial de pago**.
3. Sube el archivo real JPG, PNG o WEBP.
4. Escribe el nombre real del titular/receptor solo si IRF lo ha confirmado.
5. Guarda la configuración y luego abre el evento.

## D. Variables de entorno

Copia `.env.example` a `.env.local`:

| Variable | Dónde se usa | Descripción |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente y servidor | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente y servidor | Clave pública `anon`, restringida por RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo servidor | Inserts controlados, consultas privadas y Storage |
| `RATE_LIMIT_SECRET` | Solo servidor | Secreto aleatorio de 32+ caracteres para hashear IP |

Nunca crees `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`. Todo valor `NEXT_PUBLIC_*` queda incluido en el JavaScript público. En Vercel marca `SUPABASE_SERVICE_ROLE_KEY` y `RATE_LIMIT_SECRET` como sensibles.

Las variables opcionales `TEST_ADMIN_EMAIL` y `TEST_ADMIN_PASSWORD` activan el test de integración admin solo en un entorno de pruebas; no deben existir en producción.

## E. Vercel y deploy

### Opción A — repositorio independiente (recomendada)

Es la opción más simple: publica el contenido de `clasico-irf` en su propio repositorio GitHub, impórtalo en Vercel y usa el preset Next.js. No configures Root Directory porque el proyecto ya está en la raíz.

### Opción B — mantener el monorepo

Importa el repositorio `irf_so` y configura en Vercel:

- **Root Directory:** `clasico-irf`
- **Framework Preset:** Next.js
- **Install Command:** `npm install`
- **Build Command:** `npm run build`
- **Output Directory:** valor predeterminado de Next.js

`next.config.ts` fija `outputFileTracingRoot` al directorio de ejecución para que Next no tome el `package-lock.json` del proyecto IRF padre. No es necesario borrar ni modificar ese lockfile.

### Pasos finales

1. Añade las cuatro variables del apartado D en **Project Settings → Environment Variables**.
2. Despliega.
3. En **Settings → Domains**, agrega el dominio o subdominio y aplica el DNS indicado.
4. En Supabase, añade el dominio en **Authentication → URL Configuration → Site URL / Redirect URLs**.
5. Comprueba `/`, `/admin`, login, upload del QR, upload de comprobante y verificación.

## F. Operación del evento

1. **Configurar partido:** en `/admin → Configuración`, revisa equipos, logos, fecha, hora, cierre, mínimo, multiplicador y riesgo. El seed usa el sábado 12 de septiembre de 2026 a las 20:00 (Lima); vuelve a verificar la programación antes de publicar.
2. **Configurar QR:** carga el asset oficial y el nombre confirmado del receptor.
3. **Abrir registros:** cambia `events.status` de `CLOSED` a `OPEN`. Sin QR, la UI continúa bloqueada.
4. **Verificar participaciones:** abre el registro, inspecciona el comprobante mediante signed URL e ingresa el monto realmente recibido. La RPC atómica usa `verified_amount` y aplica `HARD_LIMIT` del lado servidor.
5. **Cerrar registros:** cambia el estado a `CLOSED`, o deja que `betting_close_at` bloquee automáticamente cada nuevo intento.
6. **Registrar resultado:** confirma Alianza, empate o Universitario desde **Resultados**.
7. **Gestionar liquidaciones:** ganadores quedan `PENDING_SETTLEMENT`; perdedores `VOID`; un empate asigna `IRF_FUNDS` y monto calculado cero. No se genera devolución ni pago automático.

## G. Reglas técnicas clave

- La participación nace `PENDING` y aparece de inmediato en la lista pública; al validarse cambia a `VERIFIED`.
- `maskParticipantName()` produce, por ejemplo, `Jhon Aracayo Mamani → Jhon A.`. Postgres replica la misma regla antes de devolver datos públicos.
- La lista pública muestra `declared_amount` solo mientras una fila está `PENDING` y `verified_amount` cuando está `VERIFIED`; nunca entrega ninguno de esos campos directamente.
- Los cálculos financieros, de exposición, riesgo y liquidación siempre usan `verified_amount`, nunca `declared_amount`.
- Exposición: `POOL=A+B`, `LIABILITY_A=A×M`, `LIABILITY_B=B×M`, `BALANCE=POOL−LIABILITY`.
- `OPEN` acepta; `WARN` alerta; `HARD_LIMIT` impide superar la pérdida configurada. La verificación usa advisory lock por evento para evitar carreras.
- El formulario tiene honeypot, idempotency key, validación Zod, firma real del archivo, constraints SQL y rate limit persistente de 5 intentos por 10 minutos.
- No hay WebSockets ni polling. La lista se actualiza al recargar o tras la revalidación normal de Next.js.

## H. Información que debe proporcionar IRF

- Archivo del QR oficial (no estaba en el repositorio inspeccionado).
- Nombre exacto del titular/receptor, si debe mostrarse.
- Escudos oficiales autorizados de ambos clubes; los SVG actuales son ilustrativos.
- Dominio final.
- Confirmación final de fecha/hora/cierre, multiplicador, monto mínimo y límite de riesgo.
- Texto legal aprobado, política de privacidad/retención y procedimiento operativo de liquidación.

La auditoría de la identidad visual reutilizada está en `docs/visual-audit.md`.
