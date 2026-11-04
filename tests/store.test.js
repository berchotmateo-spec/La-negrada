// Tests de la lógica de stock y facturación. Ejecutar con: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
require('../js/store.js');

function memoria() {
  const m = {};
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); }
  };
}

function storeConProductos() {
  const s = globalThis.crearStore(memoria());
  const cerveza = s.crearProducto({ codigo: 'CER1', nombre: 'Cerveza', precio: 1500, stock: 10, stockMinimo: 3 });
  const fernet = s.crearProducto({ codigo: 'FER1', nombre: 'Fernet', precio: 9000, stock: 2 });
  return { s, cerveza, fernet };
}

test('facturar descuenta el stock de cada producto', () => {
  const { s, cerveza, fernet } = storeConProductos();
  const f = s.facturar([{ productoId: cerveza.id, cantidad: 4 }, { productoId: fernet.id, cantidad: 1 }]);
  assert.strictEqual(s.producto(cerveza.id).stock, 6);
  assert.strictEqual(s.producto(fernet.id).stock, 1);
  assert.strictEqual(f.total, 4 * 1500 + 9000);
  assert.strictEqual(f.numero, 1);
  assert.strictEqual(s.config().proximoNumero, 2);
});

test('registra un movimiento de venta por cada producto facturado', () => {
  const { s, cerveza } = storeConProductos();
  s.facturar([{ productoId: cerveza.id, cantidad: 2 }]);
  const ventas = s.movimientos().filter((m) => m.tipo === 'venta');
  assert.strictEqual(ventas.length, 1);
  assert.strictEqual(ventas[0].cantidad, -2);
  assert.strictEqual(ventas[0].stockResultante, 8);
  assert.strictEqual(ventas[0].referencia, '0001-00000001');
});

test('si falta stock de un producto no se factura nada ni se toca el stock', () => {
  const { s, cerveza, fernet } = storeConProductos();
  assert.throws(
    () => s.facturar([{ productoId: cerveza.id, cantidad: 1 }, { productoId: fernet.id, cantidad: 5 }]),
    /Stock insuficiente/
  );
  assert.strictEqual(s.producto(cerveza.id).stock, 10);
  assert.strictEqual(s.producto(fernet.id).stock, 2);
  assert.strictEqual(s.facturas().length, 0);
  assert.strictEqual(s.config().proximoNumero, 1);
});

test('suma cantidades del mismo producto repetido en la factura', () => {
  const { s, fernet } = storeConProductos();
  assert.throws(() => s.facturar([{ productoId: fernet.id, cantidad: 2 }, { productoId: fernet.id, cantidad: 1 }]), /Stock insuficiente/);
  s.facturar([{ productoId: fernet.id, cantidad: 1 }, { productoId: fernet.id, cantidad: 1 }]);
  assert.strictEqual(s.producto(fernet.id).stock, 0);
});

test('anular una factura devuelve el stock', () => {
  const { s, cerveza } = storeConProductos();
  const f = s.facturar([{ productoId: cerveza.id, cantidad: 3 }]);
  s.anularFactura(f.id, 'Error de carga');
  assert.strictEqual(s.producto(cerveza.id).stock, 10);
  assert.strictEqual(s.facturas()[0].estado, 'anulada');
  assert.throws(() => s.anularFactura(f.id), /ya está anulada/);
});

test('aplica el descuento porcentual', () => {
  const { s, cerveza } = storeConProductos();
  const f = s.facturar([{ productoId: cerveza.id, cantidad: 2 }], { descuento: 10 });
  assert.strictEqual(f.subtotal, 3000);
  assert.strictEqual(f.descuento, 300);
  assert.strictEqual(f.total, 2700);
});

test('ingreso y ajuste de stock', () => {
  const { s, cerveza } = storeConProductos();
  s.ingresarStock(cerveza.id, 5, 'Compra proveedor');
  assert.strictEqual(s.producto(cerveza.id).stock, 15);
  s.ajustarStock(cerveza.id, 12, 'Conteo');
  assert.strictEqual(s.producto(cerveza.id).stock, 12);
  const ajuste = s.movimientos().find((m) => m.tipo === 'ajuste');
  assert.strictEqual(ajuste.cantidad, -3);
  assert.throws(() => s.ingresarStock(cerveza.id, 0), /mayor a 0/);
});

test('detecta productos con stock bajo', () => {
  const { s, cerveza } = storeConProductos();
  s.facturar([{ productoId: cerveza.id, cantidad: 7 }]);
  assert.deepStrictEqual(s.productosBajoStock().map((p) => p.nombre), ['Cerveza']);
});

test('no deja facturar productos sin precio', () => {
  const s = globalThis.crearStore(memoria());
  const p = s.crearProducto({ nombre: 'Humita', precio: 0, stock: 5 });
  assert.throws(() => s.facturar([{ productoId: p.id, cantidad: 1 }]), /no tiene precio/);
  assert.strictEqual(s.producto(p.id).stock, 5);
});

test('carga rápida cambia precios y suma stock de varios productos', () => {
  const s = globalThis.crearStore(memoria());
  const a = s.crearProducto({ nombre: 'Empanada', precio: 0 });
  const b = s.crearProducto({ nombre: 'Vino', precio: 0, stock: 2 });
  const cambios = s.cargaRapida([
    { productoId: a.id, precio: '1500', ingreso: '48' },
    { productoId: b.id, precio: '', ingreso: '' }
  ]);
  assert.strictEqual(cambios, 2);
  assert.strictEqual(s.producto(a.id).precio, 1500);
  assert.strictEqual(s.producto(a.id).stock, 48);
  assert.strictEqual(s.producto(b.id).precio, 0);
  assert.strictEqual(s.producto(b.id).stock, 2);
});

test('carga rápida con un error no guarda nada', () => {
  const s = globalThis.crearStore(memoria());
  const a = s.crearProducto({ nombre: 'Empanada', precio: 0 });
  const b = s.crearProducto({ nombre: 'Vino', precio: 0 });
  assert.throws(() => s.cargaRapida([
    { productoId: a.id, precio: '1500', ingreso: '10' },
    { productoId: b.id, precio: '-3', ingreso: '' }
  ]), /negativo/);
  assert.strictEqual(s.producto(a.id).precio, 0);
  assert.strictEqual(s.producto(a.id).stock, 0);
});

test('las botellas que entran se pasan a vasos según el rinde', () => {
  const s = globalThis.crearStore(memoria());
  const fernet = s.crearProducto({ nombre: 'Fernet', precio: 0, unidad: 'vaso' });
  s.cargaRapida([{ productoId: fernet.id, precio: '3000', rinde: '8', envases: '3', ingreso: '' }]);
  assert.strictEqual(s.producto(fernet.id).rinde, 8);
  assert.strictEqual(s.producto(fernet.id).stock, 24);
  s.facturar([{ productoId: fernet.id, cantidad: 2 }]);
  assert.strictEqual(s.producto(fernet.id).stock, 22);
  assert.strictEqual(s.facturas()[0].items[0].unidad, 'vaso');
});

test('no deja ingresar botellas sin saber cuántos vasos rinden', () => {
  const s = globalThis.crearStore(memoria());
  const gancia = s.crearProducto({ nombre: 'Gancia', precio: 100, unidad: 'vaso' });
  assert.throws(() => s.cargaRapida([{ productoId: gancia.id, envases: '2' }]), /cuántos vasos rinde/);
  assert.strictEqual(s.producto(gancia.id).stock, 0);
});

test('el rinde solo se guarda en productos por vaso', () => {
  const s = globalThis.crearStore(memoria());
  const vino = s.crearProducto({ nombre: 'Vino', precio: 100, unidad: 'botella', rinde: 5 });
  assert.strictEqual(vino.rinde, 0);
  assert.strictEqual(vino.unidad, 'botella');
});

test('resumen del cierre separa efectivo y transferencia y no cuenta anuladas', () => {
  const { s, cerveza, fernet } = storeConProductos();
  s.facturar([{ productoId: cerveza.id, cantidad: 2 }], { medioPago: 'Efectivo' });
  s.facturar([{ productoId: fernet.id, cantidad: 1 }], { medioPago: 'Transferencia' });
  const anulada = s.facturar([{ productoId: cerveza.id, cantidad: 1 }], { medioPago: 'Efectivo' });
  s.anularFactura(anulada.id);
  const r = s.resumen(new Date(Date.now() - 3600e3), new Date(Date.now() + 3600e3));
  assert.strictEqual(r.porPago.Efectivo, 3000);
  assert.strictEqual(r.porPago.Transferencia, 9000);
  assert.strictEqual(r.total, 12000);
  assert.strictEqual(r.cantidadVentas, 2);
  assert.strictEqual(r.anuladas, 1);
  assert.strictEqual(r.productos.Cerveza.cantidad, 2);
  const vacio = s.resumen(new Date(0), new Date(1000));
  assert.strictEqual(vacio.total, 0);
});

test('las ventas quedan registradas en la peña abierta', () => {
  const { s, cerveza, fernet } = storeConProductos();
  s.facturar([{ productoId: cerveza.id, cantidad: 1 }]); // antes de abrir: no cuenta
  const pena = s.abrirEvento({ nombre: 'Peña del domingo 8', fecha: '2026-11-08' });
  s.facturar([{ productoId: cerveza.id, cantidad: 2 }], { medioPago: 'Efectivo' });
  s.facturar([{ productoId: fernet.id, cantidad: 1 }], { medioPago: 'Transferencia' });
  s.cerrarEvento(pena.id);
  s.facturar([{ productoId: cerveza.id, cantidad: 1 }]); // después de cerrar: no cuenta
  const r = s.resumenEvento(pena.id);
  assert.strictEqual(r.porPago.Efectivo, 3000);
  assert.strictEqual(r.porPago.Transferencia, 9000);
  assert.strictEqual(r.total, 12000);
  assert.strictEqual(r.cantidadVentas, 2);
  assert.strictEqual(s.eventoAbierto(), null);
});

test('si se anula una venta de la peña, deja de sumar', () => {
  const { s, cerveza } = storeConProductos();
  const pena = s.abrirEvento({ nombre: 'Peña', fecha: '2026-11-08' });
  const f = s.facturar([{ productoId: cerveza.id, cantidad: 2 }]);
  s.anularFactura(f.id);
  assert.strictEqual(s.resumenEvento(pena.id).total, 0);
  assert.strictEqual(s.resumenEvento(pena.id).anuladas, 1);
});

test('no deja abrir dos peñas a la vez y permite reabrir', () => {
  const s = globalThis.crearStore(memoria());
  const a = s.abrirEvento({ nombre: 'Peña 1', fecha: '2026-11-01' });
  assert.throws(() => s.abrirEvento({ nombre: 'Peña 2', fecha: '2026-11-08' }), /Ya hay una peña abierta/);
  s.cerrarEvento(a.id);
  s.reabrirEvento(a.id);
  assert.strictEqual(s.eventoAbierto().id, a.id);
  s.cerrarEvento(a.id);
  assert.throws(() => s.abrirEvento({ nombre: '', fecha: '2026-11-08' }), /nombre/);
});

test('la peña anterior se busca por fecha', () => {
  const s = globalThis.crearStore(memoria());
  const b = s.abrirEvento({ nombre: 'Domingo 8', fecha: '2026-11-08' }); s.cerrarEvento(b.id);
  const a = s.abrirEvento({ nombre: 'Domingo 1', fecha: '2026-11-01' }); s.cerrarEvento(a.id);
  assert.strictEqual(s.eventoAnterior(b.id).id, a.id);
  assert.strictEqual(s.eventoAnterior(a.id), null);
});

test('volver todos los precios a 0', () => {
  const { s, cerveza, fernet } = storeConProductos();
  assert.strictEqual(s.reiniciarPrecios(), 2);
  assert.strictEqual(s.producto(cerveza.id).precio, 0);
  assert.strictEqual(s.producto(fernet.id).precio, 0);
  assert.strictEqual(s.producto(cerveza.id).stock, 10);
  assert.throws(() => s.facturar([{ productoId: cerveza.id, cantidad: 1 }]), /no tiene precio/);
});

test('reservas: pagada (verde) o paga en efectivo (naranja) y resumen por fecha', () => {
  const s = globalThis.crearStore(memoria());
  s.guardarPrecioEntrada(5000);
  assert.strictEqual(s.config().precioEntrada, 5000);
  const mateo = s.crearReserva({ nombre: 'Mateo y familia', personas: 5, fecha: '2026-11-08', monto: 25000, pagada: true });
  const juan = s.crearReserva({ nombre: 'Juan', personas: 2, fecha: '2026-11-08', monto: 10000, pagada: false });
  s.crearReserva({ nombre: 'Otra fecha', personas: 3, fecha: '2026-11-15', monto: 15000, pagada: false });
  assert.strictEqual(mateo.estado, 'pagada');
  assert.strictEqual(mateo.medioPago, 'Transferencia');
  assert.strictEqual(juan.estado, 'pendiente');

  let r = s.resumenReservas('2026-11-08');
  assert.strictEqual(r.cantidad, 2);
  assert.strictEqual(r.personas, 7);
  assert.strictEqual(r.cobrado, 25000);
  assert.strictEqual(r.pendiente, 10000);

  s.cobrarReserva(juan.id, 'Efectivo');
  r = s.resumenReservas('2026-11-08');
  assert.strictEqual(r.pendiente, 0);
  assert.strictEqual(r.porPago.Efectivo, 10000);
  assert.strictEqual(r.porPago.Transferencia, 25000);
  assert.throws(() => s.cobrarReserva(juan.id), /ya está paga/);
});

test('reservas: validaciones, edición y borrado', () => {
  const s = globalThis.crearStore(memoria());
  assert.throws(() => s.crearReserva({ nombre: '', personas: 2, fecha: '2026-11-08' }), /nombre/);
  assert.throws(() => s.crearReserva({ nombre: 'A', personas: 0, fecha: '2026-11-08' }), /al menos 1/);
  const r = s.crearReserva({ nombre: 'Ana', personas: 2, fecha: '2026-11-08', monto: 8000, pagada: false });
  s.editarReserva(r.id, { nombre: 'Ana López', personas: 3, fecha: '2026-11-08', monto: 12000, pagada: true });
  assert.strictEqual(s.reservas()[0].personas, 3);
  assert.strictEqual(s.reservas()[0].estado, 'pagada');
  s.eliminarReserva(r.id);
  assert.strictEqual(s.reservas().length, 0);
});

test('al cerrar la peña queda guardado el stock que sobró', () => {
  const { s, cerveza } = storeConProductos();
  const pena = s.abrirEvento({ nombre: 'Peña', fecha: '2026-11-08' });
  s.facturar([{ productoId: cerveza.id, cantidad: 4 }]);
  s.cerrarEvento(pena.id);
  s.ingresarStock(cerveza.id, 20);
  const foto = s.eventos()[0].stockAlCerrar.find((x) => x.nombre === 'Cerveza');
  assert.strictEqual(foto.stock, 6);
});

test('no permite códigos repetidos', () => {
  const { s } = storeConProductos();
  assert.throws(() => s.crearProducto({ codigo: 'cer1', nombre: 'Otra', precio: 1 }), /Ya existe/);
});

test('los datos persisten en el almacenamiento', () => {
  const mem = memoria();
  const s1 = globalThis.crearStore(mem);
  const p = s1.crearProducto({ nombre: 'Agua', precio: 800, stock: 5 });
  s1.facturar([{ productoId: p.id, cantidad: 2 }]);
  const s2 = globalThis.crearStore(mem);
  assert.strictEqual(s2.producto(p.id).stock, 3);
  assert.strictEqual(s2.facturas().length, 1);
});
