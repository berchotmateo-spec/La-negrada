// Tests de la conexión con la nube (js/nube.js) contra un Supabase simulado.
// Ejecutar con: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
require('../js/store.js');
require('../js/nube.js');

function memoria(dispositivo) {
  const m = {};
  if (dispositivo !== undefined) m['la-negrada:dispositivo'] = String(dispositivo);
  return {
    getItem: (k) => (k in m ? m[k] : null),
    setItem: (k, v) => { m[k] = String(v); },
    removeItem: (k) => { delete m[k]; }
  };
}

/*
 * Supabase simulado: auth con mail y contraseña + tabla registros (gana el más nuevo)
 * + tabla accesos. Se puede "cortar internet".
 */
function supabaseFalso() {
  const usuarios = { 'lanegrada@gmail.com': 'secreta', 'otro@gmail.com': 'otra' };
  const accesos = ['lanegrada@gmail.com'];
  const filas = new Map();
  const tokens = {};
  let reloj = Date.parse('2026-11-05T20:00:00Z');
  const s = {
    sinInternet: false,
    pedidos: [],
    filas,
    fetch: async (url, op) => {
      if (s.sinInternet) throw new TypeError('Failed to fetch');
      const u = new URL(url);
      s.pedidos.push(op.method + ' ' + u.pathname);
      assert.strictEqual(op.headers.apikey, 'clave-publica-de-prueba-123456');
      const cuerpo = op.body ? JSON.parse(op.body) : null;
      const responder = (status, json) => ({ ok: status < 300, status, text: async () => (json === undefined ? '' : JSON.stringify(json)) });
      if (u.pathname === '/auth/v1/token') {
        if (u.searchParams.get('grant_type') === 'password') {
          if (usuarios[cuerpo.email] !== cuerpo.password) return responder(400, { error_description: 'Invalid login credentials' });
          const t = 'tok-' + Math.random();
          tokens[t] = cuerpo.email;
          return responder(200, { access_token: t, refresh_token: 'ref-' + t, expires_in: 3600, user: { email: cuerpo.email } });
        }
        const viejo = cuerpo.refresh_token.slice(4);
        if (!tokens[viejo]) return responder(400, { error_description: 'Invalid Refresh Token' });
        const t = 'tok-' + Math.random();
        tokens[t] = tokens[viejo];
        return responder(200, { access_token: t, refresh_token: 'ref-' + t, expires_in: 3600, user: { email: tokens[t] } });
      }
      const email = tokens[(op.headers.Authorization || '').replace('Bearer ', '')];
      if (!email) return responder(401, { message: 'JWT expired' });
      const autorizado = accesos.includes(email);
      if (u.pathname === '/rest/v1/accesos') return responder(200, autorizado ? [{ email }] : []);
      if (u.pathname === '/rest/v1/registros') {
        if (op.method === 'POST') {
          assert.match(op.headers.Prefer, /resolution=merge-duplicates/);
          assert.strictEqual(u.searchParams.get('on_conflict'), 'coleccion,id');
          if (!autorizado) return responder(403, { message: 'new row violates row-level security policy' });
          cuerpo.forEach((r) => {
            const k = r.coleccion + ':' + r.id;
            const actual = filas.get(k);
            if (actual && r.actualizado < actual.actualizado) return; // gana el más nuevo
            reloj += 1;
            filas.set(k, { ...JSON.parse(JSON.stringify(r)), recibido: new Date(reloj).toISOString() });
          });
          return responder(201);
        }
        if (!autorizado) return responder(200, []);
        let lista = [...filas.values()];
        const gte = u.searchParams.get('recibido');
        if (gte) lista = lista.filter((f) => f.recibido >= gte.replace('gte.', ''));
        lista.sort((a, b) => (a.recibido < b.recibido ? -1 : 1));
        const limite = Number(u.searchParams.get('limit') || 1000);
        return responder(200, lista.slice(0, limite));
      }
      return responder(404, { message: 'no existe' });
    }
  };
  return s;
}

function compu(srv, dispositivo) {
  const storage = memoria(dispositivo);
  const store = globalThis.crearStore(storage);
  const nube = globalThis.crearNube({
    store, storage, fetch: srv.fetch,
    config: { url: 'https://abc.supabase.co', clave: 'clave-publica-de-prueba-123456' }
  });
  return { store, nube, storage };
}

const prod = (store, n) => store.productos().find((p) => p.nombre === n);

test('la compu del bar sube sus datos y la de casa los baja al entrar', async () => {
  const srv = supabaseFalso();
  const bar = compu(srv, 1);
  bar.store.crearProducto({ nombre: 'Empanada', precio: 1500, stock: 48 });
  const r = await bar.nube.iniciarSesion('LaNegrada@gmail.com ', 'secreta');
  assert.deepStrictEqual(r, { pregunta: 'subir' });       // nube vacía y el bar tiene datos
  await bar.nube.decidir('subir');
  assert.strictEqual(bar.nube.estado().estado, 'al-dia');
  assert.strictEqual(bar.store.cantidadPendientes(), 0);

  const casa = compu(srv, 2);
  const r2 = await casa.nube.iniciarSesion('lanegrada@gmail.com', 'secreta');
  assert.deepStrictEqual(r2, { listo: true });             // casa vacía: baja directo
  await casa.nube.sincronizar();
  assert.strictEqual(prod(casa.store, 'Empanada').stock, 48);
  bar.nube.detener(); casa.nube.detener();
});

test('contraseña mal o mail no autorizado: mensajes claros', async () => {
  const srv = supabaseFalso();
  const a = compu(srv, 1);
  await assert.rejects(a.nube.iniciarSesion('lanegrada@gmail.com', 'mal'), /no son correctos/);
  await assert.rejects(a.nube.iniciarSesion('otro@gmail.com', 'otra'), /no está autorizado/);
  assert.strictEqual(a.storage.getItem('la-negrada:nube-sesion'), null);  // no queda una sesión a medias
  srv.sinInternet = true;
  await assert.rejects(a.nube.iniciarSesion('lanegrada@gmail.com', 'secreta'), /No hay internet/);
});

test('sin internet la caja sigue vendiendo y sube todo cuando vuelve', async () => {
  const srv = supabaseFalso();
  const bar = compu(srv, 1);
  bar.store.crearProducto({ nombre: 'Fernet', precio: 4000, unidad: 'vaso', stock: 24 });
  await bar.nube.iniciarSesion('lanegrada@gmail.com', 'secreta');
  await bar.nube.decidir('subir');
  const casa = compu(srv, 2);
  await casa.nube.iniciarSesion('lanegrada@gmail.com', 'secreta');
  await casa.nube.sincronizar();

  srv.sinInternet = true;                                   // se corta el wifi del patio
  const pena = bar.store.abrirEvento({ nombre: 'Peña del domingo 8', fecha: '2026-11-08' });
  bar.store.facturar([{ productoId: prod(bar.store, 'Fernet').id, cantidad: 3 }], { medioPago: 'Efectivo' });
  bar.store.facturar([{ productoId: prod(bar.store, 'Fernet').id, cantidad: 2 }], { medioPago: 'Transferencia' });
  await bar.nube.sincronizar();
  assert.strictEqual(bar.nube.estado().estado, 'sin-internet');
  assert.ok(bar.store.cantidadPendientes() > 0);
  assert.strictEqual(prod(bar.store, 'Fernet').stock, 19);  // la caja descontó igual

  srv.sinInternet = false;                                  // vuelve
  await bar.nube.sincronizar();
  assert.strictEqual(bar.nube.estado().estado, 'al-dia');
  assert.strictEqual(bar.store.cantidadPendientes(), 0);
  await casa.nube.sincronizar();
  const r = casa.store.resumenEvento(pena.id);
  assert.strictEqual(r.porPago.Efectivo, 12000);
  assert.strictEqual(r.porPago.Transferencia, 8000);
  assert.strictEqual(prod(casa.store, 'Fernet').stock, 19);
  bar.nube.detener(); casa.nube.detener();
});

test('compu nueva con datos de prueba: puede usar solo los de la nube', async () => {
  const srv = supabaseFalso();
  const bar = compu(srv, 1);
  bar.store.crearProducto({ nombre: 'Vino', precio: 9000, unidad: 'botella', stock: 12 });
  await bar.nube.iniciarSesion('lanegrada@gmail.com', 'secreta');
  await bar.nube.decidir('subir');

  const otra = compu(srv, 3);
  otra.store.crearProducto({ nombre: 'Producto de prueba', precio: 1, stock: 1 });
  const r = await otra.nube.iniciarSesion('lanegrada@gmail.com', 'secreta');
  assert.deepStrictEqual(r, { pregunta: 'juntar' });
  assert.strictEqual(otra.nube.estado().estado, 'primera-vez');
  await otra.nube.decidir('nube');
  assert.deepStrictEqual(otra.store.productos().map((p) => p.nombre), ['Vino']);
  assert.ok(![...srv.filas.values()].some((f) => f.datos.nombre === 'Producto de prueba'));
  bar.nube.detener(); otra.nube.detener();
});

test('baja en páginas cuando hay muchos registros', async () => {
  const srv = supabaseFalso();
  const bar = compu(srv, 1);
  const p = bar.store.crearProducto({ nombre: 'Empanada', precio: 100, stock: 2000 });
  for (let i = 0; i < 60; i++) bar.store.facturar([{ productoId: p.id, cantidad: 1 }]);
  // 1 producto + 61 movimientos + 60 facturas + config = más de 1 página si la página fuera chica:
  // se prueba con la página real (500) subiendo bastantes registros
  for (let i = 0; i < 200; i++) bar.store.facturar([{ productoId: p.id, cantidad: 1 }]);
  await bar.nube.iniciarSesion('lanegrada@gmail.com', 'secreta');
  await bar.nube.decidir('subir');
  assert.ok(srv.filas.size > 500);
  const casa = compu(srv, 2);
  await casa.nube.iniciarSesion('lanegrada@gmail.com', 'secreta');
  await casa.nube.sincronizar();
  assert.strictEqual(casa.store.facturas().length, 260);
  assert.strictEqual(prod(casa.store, 'Empanada').stock, 2000 - 260);
  bar.nube.detener(); casa.nube.detener();
});

test('si la sesión vence, se renueva sola', async () => {
  const srv = supabaseFalso();
  const bar = compu(srv, 1);
  await bar.nube.iniciarSesion('lanegrada@gmail.com', 'secreta');
  const s = JSON.parse(bar.storage.getItem('la-negrada:nube-sesion'));
  s.expira = Date.now() - 1000;                             // vencida
  bar.storage.setItem('la-negrada:nube-sesion', JSON.stringify(s));
  bar.store.crearProducto({ nombre: 'Agua', precio: 900 });
  await bar.nube.sincronizar();
  assert.strictEqual(bar.nube.estado().estado, 'al-dia');
  assert.ok(srv.pedidos.some((x) => x === 'POST /auth/v1/token'));
  bar.nube.detener();
});

test('al volver a entrar con el mismo mail en la misma compu, no pregunta de nuevo', async () => {
  const srv = supabaseFalso();
  const bar = compu(srv, 1);
  bar.store.crearProducto({ nombre: 'Agua', precio: 900, stock: 5 });
  await bar.nube.iniciarSesion('lanegrada@gmail.com', 'secreta');
  await bar.nube.decidir('subir');
  await bar.nube.cerrarSesion();
  assert.strictEqual(bar.nube.estado().estado, 'sin-sesion');
  bar.store.crearProducto({ nombre: 'Hielo', precio: 500 });  // cambio con la sesión cerrada
  const r = await bar.nube.iniciarSesion('lanegrada@gmail.com', 'secreta');
  assert.deepStrictEqual(r, { listo: true });
  await bar.nube.sincronizar();
  assert.ok([...srv.filas.values()].some((f) => f.datos.nombre === 'Hielo'));
  bar.nube.detener();
});
