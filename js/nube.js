/*
 * Nube: sincroniza los datos entre computadoras usando Supabase.
 *
 * Cómo funciona:
 *  - La app siempre guarda primero en la compu (store.js). La caja nunca espera a internet.
 *  - Cada 15 segundos, cuando hay cambios y cuando vuelve internet: sube lo pendiente y baja lo nuevo.
 *  - En Supabase hay una sola tabla, "registros" (ver supabase/instalar.sql). Si dos compus
 *    cambian lo mismo, gana el cambio más nuevo (lo decide la base de datos y también la app).
 *
 * No depende del HTML: recibe store, storage y fetch, así se puede testear.
 */
(function (global) {
  'use strict';

  var CLAVES = {
    conexion: 'la-negrada:nube-conexion',  // { url, clave } si no vienen en nube-config.js
    sesion: 'la-negrada:nube-sesion',      // { access_token, refresh_token, expira, email }
    lista: 'la-negrada:nube-lista',        // email con el que esta compu ya quedó vinculada
    cursor: 'la-negrada:nube-cursor'       // hasta dónde se bajó (hora de la nube)
  };
  var LOTE = 200;           // registros por subida
  var PAGINA = 500;         // registros por bajada
  var SOLAPE_MS = 10000;    // se vuelve a pedir un poco hacia atrás, por las dudas
  var CADA_MS = 15000;      // sincronización automática

  function crearNube(op) {
    var store = op.store;
    var storage = op.storage;
    var pedir = op.fetch;
    var configFija = op.config || {};
    var ahora = op.ahora || function () { return Date.now(); };

    var estado = 'sin-configurar';
    var detalle = '';
    var ultimaSync = null;
    var oyentes = [];
    var enCurso = null;
    var otraVez = false;
    var temporizador = null;
    var espera = null;

    function leer(clave) {
      try { return JSON.parse(storage.getItem(clave)); } catch (e) { return null; }
    }
    function escribir(clave, valor) {
      if (valor === null || valor === undefined) storage.removeItem(clave);
      else storage.setItem(clave, JSON.stringify(valor));
    }

    function conexion() {
      if (configFija.url && configFija.clave) return { url: configFija.url, clave: configFija.clave, fija: true };
      var c = leer(CLAVES.conexion);
      return c && c.url && c.clave ? { url: c.url, clave: c.clave, fija: false } : null;
    }

    function cambiar(nuevo, texto) {
      estado = nuevo;
      detalle = texto || '';
      oyentes.forEach(function (fn) { fn(); });
    }

    function errorDe(respuesta, cuerpo) {
      var msg = (cuerpo && (cuerpo.error_description || cuerpo.msg || cuerpo.message || cuerpo.error)) || ('Error ' + respuesta.status);
      var e = new Error(msg);
      e.status = respuesta.status;
      return e;
    }

    // Pedido HTTP a Supabase. Si no hay internet, el error lleva sinInternet = true.
    function http(metodo, ruta, cuerpo, extra) {
      var c = conexion();
      var cabeceras = Object.assign({ apikey: c.clave, 'Content-Type': 'application/json' }, extra || {});
      return pedir(c.url.replace(/\/+$/, '') + ruta, {
        method: metodo,
        headers: cabeceras,
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo)
      }).then(function (r) {
        return r.text().then(function (t) {
          var json = null;
          try { json = t ? JSON.parse(t) : null; } catch (e) { json = null; }
          if (!r.ok) throw errorDe(r, json);
          return json;
        });
      }, function () {
        var e = new Error('Sin internet');
        e.sinInternet = true;
        throw e;
      });
    }

    function guardarSesion(r, email) {
      var s = {
        access_token: r.access_token,
        refresh_token: r.refresh_token,
        expira: ahora() + (r.expires_in || 3600) * 1000,
        email: (r.user && r.user.email) || email
      };
      escribir(CLAVES.sesion, s);
      return s;
    }

    // Token válido (lo renueva si está por vencer)
    function token() {
      var s = leer(CLAVES.sesion);
      if (!s) return Promise.reject(Object.assign(new Error('Sin sesión'), { sinSesion: true }));
      if (s.expira - ahora() > 60000) return Promise.resolve(s.access_token);
      return http('POST', '/auth/v1/token?grant_type=refresh_token', { refresh_token: s.refresh_token })
        .then(function (r) { return guardarSesion(r, s.email).access_token; }, function (e) {
          if (e.sinInternet) throw e;
          escribir(CLAVES.sesion, null);
          throw Object.assign(new Error('La sesión venció. Volvé a entrar.'), { sinSesion: true });
        });
    }

    function rest(metodo, ruta, cuerpo, extra) {
      return token().then(function (t) {
        return http(metodo, '/rest/v1' + ruta, cuerpo, Object.assign({ Authorization: 'Bearer ' + t }, extra || {}));
      });
    }

    // ---------- Subir y bajar ----------
    function subir() {
      var pend = store.pendientes();
      if (!pend.length) return Promise.resolve(0);
      var lotes = [];
      for (var i = 0; i < pend.length; i += LOTE) lotes.push(pend.slice(i, i + LOTE));
      var total = 0;
      return lotes.reduce(function (cadena, lote) {
        return cadena.then(function () {
          var filas = lote.map(function (r) {
            return { coleccion: r.coleccion, id: r.id, datos: r.datos, actualizado: r.actualizado };
          });
          return rest('POST', '/registros?on_conflict=coleccion,id', filas, {
            Prefer: 'resolution=merge-duplicates,return=minimal'
          }).then(function () {
            store.confirmarEnviados(lote);
            total += lote.length;
          });
        });
      }, Promise.resolve()).then(function () { return total; });
    }

    function bajar() {
      var cursor = leer(CLAVES.cursor);
      var desde = cursor ? new Date(new Date(cursor).getTime() - SOLAPE_MS).toISOString() : '1970-01-01T00:00:00Z';
      var vistos = {};
      var recibidos = 0;
      var maximo = cursor;

      function pagina(desdeAca) {
        var ruta = '/registros?select=coleccion,id,datos,actualizado,recibido' +
          '&recibido=gte.' + encodeURIComponent(desdeAca) + '&order=recibido.asc&limit=' + PAGINA;
        return rest('GET', ruta).then(function (filas) {
          filas = filas || [];
          var nuevas = filas.filter(function (f) {
            var k = f.coleccion + ':' + f.id + ':' + f.actualizado;
            if (vistos[k]) return false;
            vistos[k] = true;
            return true;
          });
          if (nuevas.length) {
            store.aplicarRemotos(nuevas.map(function (f) {
              return { coleccion: f.coleccion, id: f.id, datos: f.datos, actualizado: Number(f.actualizado) };
            }));
            recibidos += nuevas.length;
          }
          filas.forEach(function (f) { if (!maximo || f.recibido > maximo) maximo = f.recibido; });
          if (filas.length === PAGINA && nuevas.length) return pagina(filas[filas.length - 1].recibido);
        });
      }

      return pagina(desde).then(function () {
        if (maximo) escribir(CLAVES.cursor, maximo);
        return recibidos;
      });
    }

    function sincronizar() {
      if (!conexion()) { cambiar('sin-configurar'); return Promise.resolve(); }
      if (!leer(CLAVES.sesion)) { cambiar('sin-sesion'); return Promise.resolve(); }
      if (!leer(CLAVES.lista)) { cambiar('primera-vez'); return Promise.resolve(); }
      if (enCurso) { otraVez = true; return enCurso; }
      cambiar('sincronizando', store.cantidadPendientes() ? 'Subiendo ' + store.cantidadPendientes() + ' cambios…' : '');
      enCurso = subir().then(bajar).then(function () {
        ultimaSync = ahora();
        cambiar('al-dia');
      }, function (e) {
        if (e.sinInternet) cambiar('sin-internet');
        else if (e.sinSesion) cambiar('sin-sesion', e.message);
        else if (e.status === 401 || e.status === 403) cambiar('error', 'Esta cuenta no tiene permiso. Revisá que el mail esté autorizado en Supabase.');
        else cambiar('error', e.message);
      }).then(function () {
        enCurso = null;
        if (otraVez) { otraVez = false; return sincronizar(); }
      });
      return enCurso;
    }

    // ---------- Sesión ----------
    /*
     * Entra con mail y contraseña. Devuelve qué hay que decidir la primera vez:
     *  { listo: true } -> ya está sincronizando
     *  { pregunta: 'subir' }  -> la nube está vacía y esta compu tiene datos
     *  { pregunta: 'juntar' } -> la nube y esta compu tienen datos
     */
    function iniciarSesion(email, contrasena) {
      email = String(email || '').trim().toLowerCase();
      if (!email || !contrasena) return Promise.reject(new Error('Escribí el mail y la contraseña.'));
      if (!conexion()) return Promise.reject(new Error('Falta la conexión con la nube.'));
      return http('POST', '/auth/v1/token?grant_type=password', { email: email, password: contrasena })
        .catch(function (e) {
          if (e.sinInternet) throw new Error('No hay internet. Probá de nuevo cuando vuelva la conexión.');
          if (e.status === 400) throw new Error('El mail o la contraseña no son correctos.');
          throw e;
        })
        .then(function (r) {
          guardarSesion(r, email);
          return rest('GET', '/accesos?select=email');
        })
        .then(function (accesos) {
          if (!accesos || !accesos.length) {
            escribir(CLAVES.sesion, null);
            throw new Error('Este mail todavía no está autorizado. Hay que agregarlo en Supabase (tabla accesos).');
          }
          // Si esta compu ya estaba vinculada con este mail, sigue como antes
          if (leer(CLAVES.lista) === email) return { listo: true };
          return rest('GET', '/registros?select=id&limit=1').then(function (filas) {
            var nubeConDatos = filas && filas.length > 0;
            var localConDatos = store.tieneDatosPropios();
            if (!localConDatos) return decidir(nubeConDatos ? 'nube' : 'subir');
            return { pregunta: nubeConDatos ? 'juntar' : 'subir' };
          });
        })
        .then(function (r) {
          if (r.listo) { arrancar(); sincronizar(); }
          else cambiar('primera-vez');
          return r;
        });
    }

    /*
     * Decisión de la primera vez:
     *  'nube'   -> esta compu usa solo los datos de la nube (lo de esta compu se descarta)
     *  'subir'  -> se suben los datos de esta compu (nube vacía)
     *  'juntar' -> se juntan los datos de esta compu con los de la nube
     */
    function decidir(opcion) {
      var s = leer(CLAVES.sesion);
      if (!s) return Promise.reject(new Error('Primero entrá con tu mail.'));
      if (opcion === 'nube') store.reiniciarLocal();
      else store.marcarTodoPendiente();
      escribir(CLAVES.cursor, null);
      escribir(CLAVES.lista, s.email);
      arrancar();
      return sincronizar().then(function () { return { listo: true }; });
    }

    function cerrarSesion() {
      var s = leer(CLAVES.sesion);
      var antes = s ? sincronizar() : Promise.resolve();
      return antes.then(function () {
        detener();
        escribir(CLAVES.sesion, null);
        cambiar(conexion() ? 'sin-sesion' : 'sin-configurar');
      });
    }

    function guardarConexion(url, clave) {
      url = String(url || '').trim().replace(/\/+$/, '');
      clave = String(clave || '').trim();
      // https siempre; http solo para pruebas en la misma compu (localhost)
      if (!/^https:\/\/.+/.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(url)) {
        throw new Error('La dirección tiene que empezar con https://');
      }
      if (clave.length < 20) throw new Error('La clave parece incompleta.');
      escribir(CLAVES.conexion, { url: url, clave: clave });
      cambiar(leer(CLAVES.sesion) ? estado : 'sin-sesion');
    }

    // ---------- Automático ----------
    function arrancar() {
      if (temporizador) return;
      temporizador = setInterval(sincronizar, CADA_MS);
    }
    function detener() {
      if (temporizador) clearInterval(temporizador);
      temporizador = null;
    }
    // Después de un cambio local, subirlo enseguida (con una pequeña espera para juntar cambios)
    function avisarCambio() {
      if (estado === 'sin-configurar' || estado === 'sin-sesion' || estado === 'primera-vez') return;
      if (espera) clearTimeout(espera);
      espera = setTimeout(function () { espera = null; if (store.cantidadPendientes()) sincronizar(); }, 1500);
    }

    function iniciar() {
      if (!conexion()) { cambiar('sin-configurar'); return; }
      if (!leer(CLAVES.sesion)) { cambiar('sin-sesion'); return; }
      if (!leer(CLAVES.lista)) { cambiar('primera-vez'); return; }
      arrancar();
      sincronizar();
    }

    return {
      iniciar: iniciar,
      sincronizar: sincronizar,
      iniciarSesion: iniciarSesion,
      decidir: decidir,
      cerrarSesion: cerrarSesion,
      guardarConexion: guardarConexion,
      avisarCambio: avisarCambio,
      detener: detener,
      conexion: conexion,
      estado: function () {
        var s = leer(CLAVES.sesion);
        return {
          estado: estado,
          detalle: detalle,
          email: s && s.email,
          ultimaSync: ultimaSync,
          pendientes: store.cantidadPendientes()
        };
      },
      suscribir: function (fn) { oyentes.push(fn); }
    };
  }

  global.crearNube = crearNube;
})(typeof window !== 'undefined' ? window : globalThis);
