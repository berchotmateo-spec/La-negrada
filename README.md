# La Negrada · Patio de Retumbos — Sistema de gestión

App web para que el dueño del bar maneje solo la caja, el stock y la facturación.
**Cada vez que se factura, el stock de los productos vendidos se da de baja automáticamente.**

## Qué hace

| Sección | Para qué sirve |
|---|---|
| **Inicio** | Caja de la noche por medio de pago, lo que más salió, ventas del mes, productos para reponer y últimas ventas. |
| **Vender** | Punto de venta con la carta separada en Comidas, Postres y Bebidas. Tocás los productos, armás el ticket, aplicás descuento, elegís medio de pago y facturás. |
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
- **Inicio → Caja de la noche** muestra en vivo cuánto entró en efectivo y en transferencia.
- **Cierre de la noche** (botón en Inicio): efectivo, transferencia y total, cantidad de ventas,
  lo que se vendió de cada producto y el stock que queda. Se puede imprimir y ver noches anteriores.
- La noche va de **6 am a 6 am**: una venta a la 1 de la madrugada cuenta para la noche que empezó el día anterior.

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
3. A vender desde **Vender**. Al terminar el evento, **Inicio → Cierre de la noche**.
4. Si sobró algo o se rompió, **Stock → Ajuste por conteo** con lo que realmente quedó.

### Instalarla como app en la compu del bar

Link: **https://berchotmateo-spec.github.io/La-negrada/**

1. Abrir el link en Chrome o Edge.
2. Tocar **Instalar app** (abajo del menú) o el ícono de instalar en la barra de direcciones.
3. Queda un ícono con el logo en el escritorio y se abre en su propia ventana.

Una vez abierta con internet, **funciona aunque se corte la conexión**.

### Publicarla gratis con GitHub Pages

1. En GitHub, entrá al repositorio → **Settings → Pages**.
2. En *Source* elegí **Deploy from a branch**, la rama que quieras publicar y la carpeta `/ (root)`.
3. En un par de minutos queda online en `https://<usuario>.github.io/<repositorio>/`.

## Importante sobre los datos

Los datos se guardan **en el navegador de la computadora donde se usa** (localStorage):

- Si se usa en dos computadoras distintas, cada una tiene sus propios datos.
- Si se borran los datos del navegador, se pierden. Por eso: **Ajustes → Descargar respaldo** seguido, y guardar el archivo en Drive o un pendrive.

El comprobante que imprime es **interno, no fiscal**. Para emitir factura electrónica válida hay que integrar con ARCA (ex AFIP).

## Estructura

```
index.html          Pantallas de la app
css/styles.css      Estilos (adaptado a celular)
img/                Logo, favicon e íconos de la app
manifest.json       Datos para instalarla como app
sw.js               Hace que funcione sin internet
js/store.js         Lógica de datos: productos, stock, facturas
js/app.js           Interfaz y eventos
tests/              Tests de la lógica de stock y facturación
```

Para correr los tests (requiere Node.js 18 o más):

```bash
node --test tests/store.test.js
```

## Próximos pasos posibles

- Base de datos en la nube (por ejemplo Supabase) para usarla desde varias computadoras y celulares a la vez.
- Usuarios con contraseña y permisos (dueño / vendedor).
- Factura electrónica con ARCA.
- Cuentas abiertas por mesa (anotar consumos y cobrar al final).
- Descontar insumos por receta (por ejemplo, que un fernet con coca descuente de la botella de fernet y de la gaseosa).
- Proveedores y compras, reportes por semana y por mes.
