# Guía: conectar La Negrada a la nube (Supabase)

Con esto, todas las computadoras ven los mismos datos: precios, stock, peñas, ventas y reservas.
Se hace **una sola vez** y lleva unos 10 minutos. Es gratis.

---

## 1. Crear la cuenta y el proyecto

1. Entrá a **https://supabase.com** y tocá **Start your project**. Podés entrar con tu cuenta de GitHub.
2. Tocá **New project** y completá:
   - **Name:** `la-negrada`
   - **Database Password:** inventá una contraseña larga y **guardala** (no es la de la app, es la de la base de datos).
   - **Region:** `South America (São Paulo)`, que es la más cercana.
   - Plan: **Free**.
3. Tocá **Create new project** y esperá 1 o 2 minutos a que termine.

## 2. Crear la tabla (copiar y pegar)

1. En el menú de la izquierda entrá a **SQL Editor** y tocá **New query**.
2. Abrí el archivo `supabase/instalar.sql` de este repositorio, copiá **todo** y pegalo en el editor.
3. Tocá **Run**. Tiene que decir *Success*.

## 3. Crear el usuario del bar

En la app se entra con un **usuario simple** (por ejemplo `lanegrada` o `juanjose`) y una contraseña,
los mismos en todas las compus. Supabase pide un formato de mail, así que el usuario se crea agregándole `@lanegrada.app`:

1. Menú de la izquierda: **Authentication → Users → Add user → Create new user**.
2. **Email:** el usuario + `@lanegrada.app`, en minúsculas y sin espacios ni acentos.
   Por ejemplo, para entrar como `juanjose`: `juanjose@lanegrada.app`.
3. **Password:** la contraseña que van a usar (mejor que tenga al menos 8 caracteres).
4. Marcá **Auto Confirm User** y tocá **Create user**. No se manda ningún mail.

> También se puede usar un mail real (por ejemplo `lanegrada@gmail.com`): en ese caso, en la app se entra escribiendo el mail completo.

## 4. Autorizar ese usuario

En **SQL Editor → New query**, pegá esta línea **con el email del paso 3**, y tocá **Run**:

```sql
insert into public.accesos (email) values ('juanjose@lanegrada.app') on conflict do nothing;
```

Solo los usuarios de esta lista pueden ver y cambiar los datos. Todos los autorizados ven **los mismos datos del bar**.
Para agregar otra persona con su propio usuario, repetí los pasos 3 y 4.

## 5. Cerrar la puerta a desconocidos (recomendado)

**Authentication → Sign In / Providers**: desactivá **Allow new users to sign up** y guardá.
Así nadie puede crearse una cuenta sola. Aunque lo hiciera, no vería nada, porque su mail no está autorizado.

## 6. Copiar los dos datos de conexión

En **Project Settings → API Keys** (o **Data API**):

- **Project URL**: algo como `https://abcdefgh.supabase.co`
- **anon public** key (o **Publishable key**, que empieza con `sb_publishable_`)

⚠️ **Nunca** copies ni compartas la **service_role** / **secret** key: esa da acceso total.

Pasale esos dos datos a Claude para que los deje fijos en la app (`js/nube-config.js`).
Así, en cada compu solo hay que poner mail y contraseña.
También se pueden pegar a mano en cada compu, en **Ajustes → Compartir entre computadoras**.

## 7. Conectar las computadoras

1. **Primero, la compu del bar** (la que tiene los precios cargados):
   **Ajustes → Compartir entre computadoras** → usuario y contraseña → **Conectar esta compu** →
   **Sí, subir los datos de esta compu**.
2. **Después, las demás:** el mismo usuario y contraseña → **Conectar esta compu**.
   Si esa compu tenía datos de prueba, elegí **Usar los datos de la nube (recomendado)**.

Abajo del menú de la izquierda se ve el estado:

| Aviso | Qué significa |
|---|---|
| ☁ Al día | Todo sincronizado. |
| ☁ Sincronizando… | Subiendo o bajando cambios. |
| ⚠ Sin internet · N sin subir | Se cobra igual. Todo queda guardado en la compu y se sube solo cuando vuelve la señal. |
| ☁ Sin conectar | Esta compu no está conectada (funciona sola, como antes). |
| ⚠ Problema con la nube | Entrar a Ajustes para ver el detalle. |

---

## Cosas para saber

- **La caja nunca depende de internet.** Si el wifi del fondo del patio se corta, se sigue cobrando y el stock se descuenta.
  Cuando vuelve la señal, se sube todo solo.
- **Cada 15 segundos** las compus conectadas se ponen al día (y enseguida después de cada venta, si hay señal).
- **Si dos compus cambian lo mismo** (por ejemplo, el precio del fernet), queda el cambio más nuevo.
- **El stock se suma bien aunque se trabaje en dos compus a la vez**: se calcula con los movimientos (ventas, ingresos, ajustes).
- **Plan gratis de Supabase:** si **ninguna** compu abre la app durante **7 días seguidos**, Supabase pausa el proyecto.
  Los datos no se pierden: hay que entrar a supabase.com y tocar **Restore project**. Con una peña por semana no debería pasar.
- **Borrar todo** y **Volver a cero** se aplican en **todas** las compus conectadas.
