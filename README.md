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
Cada venta descuenta de a una unidad o porción (una empanada, un vaso de fernet, una porción de guiso).

### La noche del bar

Los totales "de la noche" toman la jornada de **6 am a 6 am**: una venta a la 1 de la madrugada
cuenta para la noche que empezó el día anterior.

### Reglas de stock

- Al **facturar** se valida el stock de todos los productos del ticket. Si alguno no alcanza, no se factura nada y el stock queda igual.
- Si alcanza, en un solo paso se descuenta el stock, se registra el movimiento y se emite la factura con número correlativo (`0001-00000001`).
- **Anular** una factura devuelve el stock de cada producto.
- El stock no se puede editar a mano desde el producto: se mueve solo con ingresos, ajustes, ventas o anulaciones, así siempre queda registrado.

## Cómo usarla

No hace falta instalar nada: abrí `index.html` con el navegador (Chrome, Edge o Firefox).

Primeros pasos:

1. **Productos → Editar** en cada producto para cargarle el precio.
2. **Stock → Ingreso de mercadería** al arrancar la noche (por ejemplo: 48 empanadas, 20 chorizos, 30 fernets).
3. A vender desde **Vender**. Al cerrar, mirar **Inicio → Caja de la noche**.
4. Si sobró algo o se rompió, **Stock → Ajuste por conteo** con lo que realmente quedó.

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
img/                Logo y favicon
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
