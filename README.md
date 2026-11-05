# La Negrada · Patio de Retumbos — Sistema de gestión

App web para que el dueño del bar maneje solo la caja, el stock y la facturación.
**Cada vez que se factura, el stock de los productos vendidos se da de baja automáticamente.**

## Qué hace

| Sección | Para qué sirve |
|---|---|
| **Inicio** | Caja de la noche por medio de pago, lo que más salió, ventas del mes, productos para reponer y últimas ventas. |
| **Vender** | Punto de venta con la carta separada en Comidas, Postres y Bebidas. Tocás los productos, armás el ticket, aplicás descuento, elegís medio de pago y facturás. |
| **Peñas** | Historial de cada peña: efectivo, transferencia, total y comparación con la peña anterior. |
| **Reservas** | Reservas de entradas por peña: nombre, personas y monto. Verde = ya pagó, naranja = paga en efectivo en la puerta. |
| **Productos** | Alta, edición y baja de productos con código, categoría, precio, costo y stock mínimo. |
| **Stock** | Ingreso de mercadería y ajustes por conteo. Historial de todos los movimientos (ventas, ingresos, ajustes, anulaciones). |
| **Facturas** | Historial con búsqueda y filtro por fechas. Ver, imprimir o anular (al anular, el stock vuelve). |
| **Ajustes** | Datos del negocio que salen en el comprobante, respaldo y restauración de datos. |

### La carta

La primera vez que se abre, la app carga la carta del bar:

- **Comidas:** Choripán, Guiso de lentejas, Humita, Empanada, Pastelito
- **Postres:** Arroz con leche
- **Bebidas:** Vino, Cerveza, Fernet, Gancia, Gaseosa, Agua, Limonada

Los productos arrancan **sin precio y sin stock**. Mientras no tengan precio y stock no se pueden vender.

Cómo se vende cada cosa:

- **Vino:** por botella. El stock se cuenta en botellas.
- **Cerveza, Fernet, Gancia, Gaseosa, Agua y Limonada:** por vaso. El stock se cuenta en vasos.
  En "Cargar precios y stock" se pone cuántos vasos rinde una botella (o una jarra, en la limonada)
  y el stock se carga en botellas: la app lo pasa a vasos. Ejemplo: 3 botellas de fernet × 8 vasos = 24 vasos.
- **Comidas:** por unidad (choripán, empanada, pastelito) o por porción (guiso, humita, arroz con leche).

### La noche del bar

- **El stock se descuenta en el momento**, con cada venta que se cobra.
- Al cobrar se elige **Efectivo** o **Transferencia** con dos botones grandes.
- **Inicio → Caja** muestra en vivo cuánto entró en efectivo y en transferencia en la peña abierta.
- Si no hay peña abierta, Inicio muestra la noche (de **6 am a 6 am**: una venta a la 1 de la madrugada
  cuenta para la noche que empezó el día anterior).

### Peñas

1. Al arrancar el evento: **Inicio → Abrir peña**. Se elige la fecha y la app sugiere el nombre
   (por ejemplo "Peña del domingo 8"), que se puede cambiar.
2. Todo lo que se vende queda guardado en esa peña. Inicio muestra en vivo efectivo, transferencia y total.
3. Al terminar: **Cerrar peña**. Aparece el resumen: efectivo, transferencia, total, lo vendido de cada
   producto y la **comparación con la peña anterior** (cuánto más o menos se facturó, en pesos y en %).
4. En **Peñas** queda el historial de todas, para comparar.

Si se cierra una peña sin querer, se puede **Reabrir** desde su detalle. También se le puede cambiar el nombre o la fecha.
Si se vende sin ninguna peña abierta, la venta se cobra igual pero no suma en ninguna peña (la caja avisa).

Al cerrar la peña también queda guardado **el stock que sobró**, al lado del que sobró en la peña anterior,
para llevar el control de stock entre patios.

### Reservas de entradas

1. En **Reservas** se carga una vez el **precio de la entrada**.
2. **Nueva reserva:** nombre (por ejemplo "Mateo y familia"), cantidad de personas (Mateo + 4 = 5),
   fecha de la peña, teléfono y nota opcionales. El monto se calcula solo (5 × precio) y se puede cambiar.
3. Se marca si **ya pagó** (transferencia, en **verde**) o si **paga en efectivo** en la puerta (en **naranja**).
4. Cuando llega y paga, **Cobrar en efectivo** la pasa a verde.
5. Arriba se ve cuánto ya entró, cuánto falta cobrar y cuántas personas vienen.
6. En el cierre de la peña aparecen las entradas (transferencia, efectivo y lo que faltó cobrar)
   y el total de la peña: bar + entradas cobradas.

### Volver a cero (ventas de prueba)

- **Inicio → abajo de todo → Volver a cero** (también en Ajustes): borra las ventas de prueba
  (las que no son de una peña cerrada), la peña abierta y las reservas sin peña cerrada.
  **Las peñas cerradas nunca se borran**, con sus ventas y reservas. Productos, precios y stock se mantienen;
  lo que se vendió de prueba vuelve al stock. Antes de borrar muestra qué se va a borrar y pide confirmación dos veces.
- **No hace falta volver a cero entre peñas:** al cerrar una peña queda guardada y la próxima arranca sola en $0.
- **Eliminar una sola peña:** Peñas → Ver → Eliminar. Borra esa peña y sus ventas (vuelven al stock).
- **Borrar todo** (Ajustes) deja la app vacía, incluso sin peñas ni productos. Pide escribir la palabra BORRAR.

### Precios

- **Editar precios:** Productos → Cargar precios y stock (o Ajustes → Editar precios).
- **Volver todos a 0:** Ajustes → Poner todos los precios en 0 (también desde la pantalla de carga).
  Los productos quedan sin precio hasta cargarlos de nuevo; el stock no se toca.

### Reglas de stock

- Al **facturar** se valida el stock de todos los productos del ticket. Si alguno no alcanza, no se factura nada y el stock queda igual.
- Si alcanza, en un solo paso se descuenta el stock, se registra el movimiento y se emite la factura con número correlativo (`0001-00000001`).
- **Anular** una factura devuelve el stock de cada producto.
- El stock no se puede editar a mano desde el producto: se mueve solo con ingresos, ajustes, ventas o anulaciones, así siempre queda registrado.

## Cómo usarla

No hace falta instalar nada: abrí `index.html` con el navegador (Chrome, Edge o Firefox).

Primeros pasos:

1. **Productos → Cargar precios y stock**: aparece la carta entera en una lista. Se escribe el precio de cada
   producto y cuánto stock entra (Enter pasa al siguiente casillero) y se guarda todo junto.
   También se abre desde el aviso amarillo de Inicio mientras falten precios.
2. Cada noche, la misma pantalla (o **Stock → Ingreso de mercadería**) para sumar lo que se preparó o compró
   (por ejemplo: 48 empanadas, 20 chorizos, 30 fernets). Para subir precios por inflación, lo mismo.
3. **Abrir peña**, vender desde **Vender** y al terminar **Cerrar peña**.
4. Si sobró algo o se rompió, **Stock → Ajuste por conteo** con lo que realmente quedó.

### Instalarla como app en la compu del bar

Link: **https://berchotmateo-spec.github.io/La-negrada/**

1. Abrir el link en Chrome o Edge.
2. Tocar **Instalar app** (abajo del menú de la izquierda, o en Ajustes). Si el navegador lo permite, instala directo;
   si no, muestra los pasos para Brave, Chrome o Edge.
3. Queda un ícono con el logo en el escritorio y se abre en su propia ventana.

Una vez abierta con internet, **funciona aunque se corte la conexión**.

### Publicarla gratis con GitHub Pages

1. En GitHub, entrá al repositorio → **Settings → Pages**.
2. En *Source* elegí **Deploy from a branch**, la rama que quieras publicar y la carpeta `/ (root)`.
3. En un par de minutos queda online en `https://<usuario>.github.io/<repositorio>/`.

## Varias computadoras (nube)

La app puede compartir los datos entre varias computadoras usando **Supabase** (gratis).
Cómo configurarlo, paso a paso: **[docs/GUIA-NUBE.md](docs/GUIA-NUBE.md)**.

- Cada compu guarda primero localmente: **la caja nunca depende de internet**. Si se corta el wifi, sigue cobrando
  y sube todo sola cuando vuelve la señal.
- Las compus conectadas se ponen al día cada 15 segundos.
- Si dos compus cambian lo mismo, gana el cambio más nuevo. El stock se calcula con los movimientos,
  así que da exacto aunque se cargue mercadería en una compu mientras la otra vende.
- Sin conectar a la nube, la app funciona igual que siempre, con los datos en esa compu.

El comprobante que imprime es **interno, no fiscal**. Para emitir factura electrónica válida hay que integrar con ARCA (ex AFIP).

## Estructura

```
index.html          Pantallas de la app
css/styles.css      Estilos (adaptado a celular)
img/                Logo, favicon e íconos de la app
manifest.json       Datos para instalarla como app
sw.js               Hace que funcione sin internet
js/store.js         Lógica de datos: productos, stock, facturas (lista para sincronizar)
js/nube.js          Sincronización con Supabase (subir pendientes, bajar lo nuevo)
js/nube-config.js   Dirección y clave pública de Supabase del bar
supabase/           Script de la base de datos (instalar.sql)
docs/GUIA-NUBE.md   Guía para crear la cuenta de Supabase y conectar las compus
js/app.js           Interfaz y eventos
tests/              Tests de la lógica de stock y facturación
```

Para correr los tests (requiere Node.js 18 o más):

```bash
node --test tests/*.test.js
```

## Próximos pasos posibles

- Usuarios con contraseña y permisos (dueño / vendedor).
- Factura electrónica con ARCA.
- Cuentas abiertas por mesa (anotar consumos y cobrar al final).
- Descontar insumos por receta (por ejemplo, que un fernet con coca descuente de la botella de fernet y de la gaseosa).
- Proveedores y compras, reportes por semana y por mes.
