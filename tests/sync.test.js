// Tests de sincronización entre computadoras. Ejecutar con: node --test tests/
// Simula dos compus (cada una con su propio almacenamiento) y un servidor en memoria
// que se comporta como la tabla de Supabase: por cada registro guarda el más nuevo.
const test = require('node:test');
const assert = require('node:assert');
require('../js/store.js');

function memoria(dispositivo) {
  const m = {};
  if (dispositivo !== undefined) m['la-negrada:dispositivo'] = String(dispositivo);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    _m: m
  };
}

function servidor() {
  const filas = new Map();
  return {
    subir(registros) {
      registros.forEach((r) => {
        const clave = r.coleccion + ':' + r.id;
        const actual = filas.get(clave);
        if (!actual || r.actualizado >= actual.actualizado) filas.set(clave, JSON.parse(JSON.stringify(r)));
      });
    },
    bajar() { return [...filas.values()].map((r) => JSON.parse(JSON.stringify(r))); },
    filas
  };
}

// Lo que hace nube.js: subir lo pendiente y bajar todo lo nuevo
function sincronizar(store, srv) {
  const pend = store.pendientes();
  srv.subir(pend);
  store.confirmarEnviados(pend);
  store.aplicarRemotos(srv.bajar());
}

// Espera unos milisegundos (para que un cambio sea claramente posterior a otro)
function esperar(ms) { const fin = Date.now() + ms; while (Date.now() < fin) { /* esperar */ } }

const nombre = (s, n) => s.productos().find((p) => p.nombre === n);

function dosCompus() {
  const srv = servidor();
  const bar = globalThis.crearStore(memoria(1));
  bar.crearProducto({ nombre: 'Empanada', precio: 1500, stock: 50 });
  bar.crearProducto({ nombre: 'Fernet', precio: 4000, unidad: 'vaso', stock: 24 });
  sincronizar(bar, srv);
  const casa = globalThis.crearStore(memoria(2));
  sincronizar(casa, srv);
  return { srv, bar, casa };
}

test('lo cargado en una compu aparece en la otra', () => {
  const { bar, casa } = dosCompus();
  assert.strictEqual(casa.productos().length, 2);
  assert.strictEqual(nombre(casa, 'Empanada').stock, 50);
  assert.strictEqual(nombre(casa, 'Fernet').precio, 4000);
  assert.strictEqual(bar.cantidadPendientes(), 0);
});

test('venta sin internet en el bar + mercadería cargada desde casa: el stock da exacto en las dos', () => {
  const { srv, bar, casa } = dosCompus();
  const empBar = nombre(bar, 'Empanada');
  // El bar vende 10 sin internet (no sincroniza todavía)
  bar.facturar([{ productoId: empBar.id, cantidad: 10 }]);
  // Mientras tanto, desde casa cargan 30 empanadas más
  casa.ingresarStock(nombre(casa, 'Empanada').id, 30, 'Compra');
  // Vuelve internet
  sincronizar(bar, srv);
  sincronizar(casa, srv);
  sincronizar(bar, srv);
  assert.strictEqual(nombre(bar, 'Empanada').stock, 70);
  assert.strictEqual(nombre(casa, 'Empanada').stock, 70);
  assert.strictEqual(casa.facturas().length, 1);
});

test('si en casa cambian un precio mientras el bar vende, no se pisa el precio', () => {
  const { srv, bar, casa } = dosCompus();
  casa.cargaRapida([{ productoId: nombre(casa, 'Fernet').id, precio: '4500' }]);
  sincronizar(casa, srv);
  // El bar todavía no bajó el precio nuevo y vende (el stock del producto cambia en el bar)
  bar.facturar([{ productoId: nombre(bar, 'Fernet').id, cantidad: 2 }]);
  sincronizar(bar, srv);
  sincronizar(casa, srv);
  assert.strictEqual(nombre(bar, 'Fernet').precio, 4500);
  assert.strictEqual(nombre(casa, 'Fernet').precio, 4500);
  assert.strictEqual(nombre(casa, 'Fernet').stock, 22);
});

test('lo borrado en una compu se borra en la otra', () => {
  const { srv, bar, casa } = dosCompus();
  const r = casa.crearReserva({ nombre: 'Mateo y familia', personas: 5, fecha: '2026-11-08', monto: 25000, pagada: true });
  sincronizar(casa, srv);
  sincronizar(bar, srv);
  assert.strictEqual(bar.reservas().length, 1);
  bar.eliminarReserva(r.id);
  sincronizar(bar, srv);
  sincronizar(casa, srv);
  assert.strictEqual(casa.reservas().length, 0);
});

test('peña y caja: lo que cobra el bar se ve en casa con efectivo y transferencia', () => {
  const { srv, bar, casa } = dosCompus();
  const pena = bar.abrirEvento({ nombre: 'Peña del domingo 8', fecha: '2026-11-08' });
  bar.facturar([{ productoId: nombre(bar, 'Empanada').id, cantidad: 4 }], { medioPago: 'Efectivo' });
  bar.facturar([{ productoId: nombre(bar, 'Fernet').id, cantidad: 1 }], { medioPago: 'Transferencia' });
  sincronizar(bar, srv);
  sincronizar(casa, srv);
  assert.strictEqual(casa.eventoAbierto().nombre, 'Peña del domingo 8');
  const r = casa.resumenEvento(pena.id);
  assert.strictEqual(r.porPago.Efectivo, 6000);
  assert.strictEqual(r.porPago.Transferencia, 4000);
});

test('anular en una compu devuelve el stock en las dos', () => {
  const { srv, bar, casa } = dosCompus();
  const f = bar.facturar([{ productoId: nombre(bar, 'Empanada').id, cantidad: 5 }]);
  sincronizar(bar, srv);
  sincronizar(casa, srv);
  assert.strictEqual(nombre(casa, 'Empanada').stock, 45);
  casa.anularFactura(f.id, 'Error');
  sincronizar(casa, srv);
  sincronizar(bar, srv);
  assert.strictEqual(nombre(bar, 'Empanada').stock, 50);
  assert.strictEqual(bar.facturas()[0].estado, 'anulada');
});

test('volver a cero en una compu limpia las pruebas en la otra y deja el stock bien', () => {
  const { srv, bar, casa } = dosCompus();
  bar.facturar([{ productoId: nombre(bar, 'Empanada').id, cantidad: 3 }]);
  sincronizar(bar, srv);
  sincronizar(casa, srv);
  casa.volverACero();
  sincronizar(casa, srv);
  sincronizar(bar, srv);
  assert.strictEqual(bar.facturas().length, 0);
  assert.strictEqual(nombre(bar, 'Empanada').stock, 50);
  assert.strictEqual(bar.proximoNumero(), 1);
});

test('dos compus nunca generan la misma marca de hora', () => {
  const a = globalThis.crearStore(memoria(7));
  const b = globalThis.crearStore(memoria(8));
  const pa = a.crearProducto({ nombre: 'X', precio: 1 });
  const pb = b.crearProducto({ nombre: 'Y', precio: 1 });
  assert.notStrictEqual(pa.actualizado, undefined);
  const ta = a.pendientes()[0].actualizado, tb = b.pendientes()[0].actualizado;
  assert.notStrictEqual(ta, tb);
  assert.strictEqual(ta % 1000, 7);
  assert.strictEqual(tb % 1000, 8);
  assert.ok(pb);
});

test('si un registro cambia mientras se sube, queda pendiente para la próxima', () => {
  const s = globalThis.crearStore(memoria());
  const p = s.crearProducto({ nombre: 'Agua', precio: 100 });
  const enviados = s.pendientes();
  s.editarProducto(p.id, { nombre: 'Agua', precio: 200 });  // cambia "durante" la subida
  s.confirmarEnviados(enviados);
  assert.ok(s.pendientes().some((r) => r.coleccion === 'productos' && r.id === p.id));
});

test('el cambio más nuevo gana aunque llegue después', () => {
  const { srv, bar, casa } = dosCompus();
  const id = nombre(bar, 'Empanada').id;
  bar.editarProducto(id, { nombre: 'Empanada', precio: 1600 });
  esperar(20);
  casa.editarProducto(id, { nombre: 'Empanada', precio: 1700 }); // más nuevo
  sincronizar(casa, srv);
  sincronizar(bar, srv);   // el bar sube su cambio viejo: no debe pisar
  sincronizar(casa, srv);
  assert.strictEqual(nombre(bar, 'Empanada').precio, 1700);
  assert.strictEqual(nombre(casa, 'Empanada').precio, 1700);
});

test('cambios al mismo tiempo en dos compus: las dos terminan con el mismo valor', () => {
  for (let i = 0; i < 20; i++) {
    const { srv, bar, casa } = dosCompus();
    const id = nombre(bar, 'Empanada').id;
    bar.editarProducto(id, { nombre: 'Empanada', precio: 1600 });
    casa.editarProducto(id, { nombre: 'Empanada', precio: 1700 });
    sincronizar(bar, srv);
    sincronizar(casa, srv);
    sincronizar(bar, srv);
    assert.strictEqual(nombre(bar, 'Empanada').precio, nombre(casa, 'Empanada').precio);
  }
});

test('datos de la versión anterior: el stock queda igual y se puede sincronizar', () => {
  const mem = memoria();
  mem.setItem('la-negrada:datos', JSON.stringify({
    version: 1,
    config: { nombreNegocio: 'La Negrada', puntoVenta: 1, proximoNumero: 5 },
    productos: [{ id: 'a', nombre: 'Vino', precio: 9000, stock: 12, stockMinimo: 0, activo: true }],
    movimientos: [{ id: 'm1', productoId: 'a', productoNombre: 'Vino', tipo: 'ingreso', cantidad: 10 }],
    facturas: [{ id: 'f4', numero: 4, puntoVenta: 1, fecha: '2026-11-01T22:00:00Z', items: [], total: 0, estado: 'emitida', medioPago: 'Efectivo' }],
    eventos: [], reservas: []
  }));
  const s = globalThis.crearStore(mem);
  assert.strictEqual(s.producto('a').stock, 12);
  assert.strictEqual(s.proximoNumero(), 5);
  const srv = servidor();
  s.marcarTodoPendiente();
  sincronizar(s, srv);
  const otra = globalThis.crearStore(memoria());
  sincronizar(otra, srv);
  assert.strictEqual(otra.producto('a').stock, 12);
});

test('usar solo los datos de la nube reemplaza los de esta compu', () => {
  const { srv } = dosCompus();
  const nueva = globalThis.crearStore(memoria());
  nueva.crearProducto({ nombre: 'Prueba', precio: 1, stock: 3 });
  assert.ok(nueva.tieneDatosPropios());
  nueva.reiniciarLocal();
  sincronizar(nueva, srv);
  assert.deepStrictEqual(nueva.productos().map((p) => p.nombre).sort(), ['Empanada', 'Fernet']);
  assert.ok(![...srv.filas.values()].some((r) => r.datos && r.datos.nombre === 'Prueba'));
});
