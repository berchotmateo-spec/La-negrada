/*
 * Store: toda la lógica de datos de la app (productos, stock, facturas).
 * Guarda en localStorage del navegador. No depende del HTML, así se puede testear.
 *
 * Regla clave: facturar() valida el stock de TODOS los ítems antes de tocar nada.
 * Si alcanza, descuenta el stock, registra los movimientos y emite la factura
 * en un único guardado. Si no alcanza, no cambia nada.
 *
 * Sincronización entre computadoras (ver nube.js):
 *  - Cada registro (producto, venta, peña, reserva...) lleva "actualizado": la hora del último cambio.
 *    Si dos compus cambian lo mismo, gana el cambio más nuevo.
 *  - Lo que se borra no desaparece: queda una marca { id, borrado: true } para que se borre
 *    también en las otras compus. La app nunca muestra los registros borrados.
 *  - El stock se calcula sumando los movimientos (ingresos, ventas, ajustes, anulaciones).
 *    Así, si la caja vende sin internet y desde otra compu se carga mercadería, al juntar
 *    los datos el stock da exacto.
 *  - "pendientes" guarda qué cambió y todavía no se subió a la nube.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'la-negrada:datos';
  var PENDIENTES_KEY = 'la-negrada:pendientes';
  var DISPOSITIVO_KEY = 'la-negrada:dispositivo';
  var UNIDADES = ['unidad', 'porción', 'vaso', 'botella'];
  var COLECCIONES = ['productos', 'movimientos', 'facturas', 'eventos', 'reservas'];
  var VERSION = 2;

  function estadoInicial() {
    return {
      version: VERSION,
      config: {
        nombreNegocio: 'La Negrada',
        cuit: '',
        direccion: '',
        telefono: '',
        puntoVenta: 1,
        precioEntrada: 0
      },
      productos: [],
      movimientos: [],
      facturas: [],
      eventos: [],
      reservas: []
    };
  }

  function nuevoId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function redondear(n) {
    return Math.round(n * 100) / 100;
  }

  function aNumero(valor, nombreCampo) {
    var n = typeof valor === 'number' ? valor : parseFloat(String(valor).replace(',', '.'));
    if (!isFinite(n)) throw new Error('El campo "' + nombreCampo + '" tiene que ser un número.');
    return n;
  }

  function aEntero(valor, nombreCampo) {
    var n = aNumero(valor, nombreCampo);
    if (Math.floor(n) !== n) throw new Error('El campo "' + nombreCampo + '" tiene que ser un número entero.');
    return n;
  }

  function copiar(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  // Huella de un registro para saber si cambió (sin la hora; en productos, sin el stock,
  // que se calcula a partir de los movimientos)
  function huella(coleccion, e) {
    var x = Object.assign({}, e);
    delete x.actualizado;
    if (coleccion === 'productos') delete x.stock;
    return JSON.stringify(x);
  }

  function vivos(lista) {
    return lista.filter(function (e) { return !e.borrado; });
  }

  // Lo que ve la app: todo menos los registros borrados
  function armarVista(d) {
    var v = { version: d.version, config: d.config };
    COLECCIONES.forEach(function (c) { v[c] = vivos(d[c]); });
    return v;
  }

  // Stock de cada producto = suma de sus movimientos
  function recalcularStock(d) {
    var suma = {};
    d.movimientos.forEach(function (m) {
      if (m.borrado) return;
      suma[m.productoId] = (suma[m.productoId] || 0) + m.cantidad;
    });
    d.productos.forEach(function (p) {
      if (!p.borrado) p.stock = suma[p.id] || 0;
    });
  }

  function crearStore(storage) {
    var datos = cargar();
    var oyentes = [];
    var ultimoReloj = 0;
    var dispositivo = numeroDeDispositivo();
    migrar();
    var vista = armarVista(datos);
    var pendientes = cargarPendientes();
    verReloj(datos);

    // El reloj nunca queda detrás de un cambio ya visto (por si otra compu tiene la hora adelantada)
    function verReloj(d) {
      if (d.config && d.config.actualizado > ultimoReloj) ultimoReloj = d.config.actualizado;
      COLECCIONES.forEach(function (c) {
        d[c].forEach(function (e) { if (e.actualizado > ultimoReloj) ultimoReloj = e.actualizado; });
      });
    }

    // Cada compu tiene un número del 0 al 999 que va en las últimas cifras de la marca de hora:
    // así dos cambios hechos en el mismo milisegundo en compus distintas nunca empatan.
    function numeroDeDispositivo() {
      var n = parseInt(storage.getItem(DISPOSITIVO_KEY), 10);
      if (!(n >= 0 && n < 1000)) {
        n = Math.floor(Math.random() * 1000);
        try { storage.setItem(DISPOSITIVO_KEY, String(n)); } catch (e) { /* sin almacenamiento: se usa igual */ }
      }
      return n;
    }

    // Marca de hora del cambio: milisegundos × 1000 + número de compu. Siempre creciente.
    function reloj() {
      var ms = Date.now();
      if (ms * 1000 + dispositivo <= ultimoReloj) ms = Math.floor(ultimoReloj / 1000) + 1;
      ultimoReloj = ms * 1000 + dispositivo;
      return ultimoReloj;
    }

    function cargarPendientes() {
      try { return JSON.parse(storage.getItem(PENDIENTES_KEY)) || {}; } catch (e) { return {}; }
    }
    function guardarPendientes() {
      storage.setItem(PENDIENTES_KEY, JSON.stringify(pendientes));
    }
    function marcar(coleccion, id) { pendientes[coleccion + ':' + id] = true; }

    function guardar(nuevo) {
      storage.setItem(STORAGE_KEY, JSON.stringify(nuevo));
      datos = nuevo;
      vista = armarVista(datos);
      guardarPendientes();
      avisar();
    }

    /*
     * Versión 1 -> 2: el stock pasa a calcularse con los movimientos. Si en algún producto
     * no coinciden, se agrega un ajuste para que el stock quede exactamente igual que antes.
     */
    function migrar() {
      if (datos.version >= VERSION) return;
      var suma = {};
      datos.movimientos.forEach(function (m) { if (!m.borrado) suma[m.productoId] = (suma[m.productoId] || 0) + m.cantidad; });
      datos.productos.forEach(function (p) {
        if (p.borrado) return;
        var dif = (p.stock || 0) - (suma[p.id] || 0);
        if (dif !== 0) {
          datos.movimientos.push({
            id: nuevoId(), fecha: new Date().toISOString(), productoId: p.id, productoNombre: p.nombre,
            tipo: 'ajuste', cantidad: dif, stockResultante: p.stock || 0, referencia: '',
            nota: 'Ajuste automático para empezar a sincronizar'
          });
        }
      });
      delete datos.config.proximoNumero;
      datos.version = VERSION;
      try { storage.setItem(STORAGE_KEY, JSON.stringify(datos)); } catch (e) { /* se reintenta en el próximo guardado */ }
    }

    function cargar() {
      try {
        var crudo = storage.getItem(STORAGE_KEY);
        if (!crudo) return estadoInicial();
        var parseado = JSON.parse(crudo);
        return normalizar(parseado);
      } catch (e) {
        return estadoInicial();
      }
    }

    function normalizar(d) {
      var base = estadoInicial();
      if (!d || typeof d !== 'object') return base;
      return {
        version: d.version || 1,
        config: Object.assign(base.config, d.config || {}),
        productos: Array.isArray(d.productos) ? d.productos : [],
        movimientos: Array.isArray(d.movimientos) ? d.movimientos : [],
        facturas: Array.isArray(d.facturas) ? d.facturas : [],
        eventos: Array.isArray(d.eventos) ? d.eventos : [],
        reservas: Array.isArray(d.reservas) ? d.reservas : []
      };
    }

    /*
     * Aplica un cambio sobre una copia (sin los borrados) y la guarda; si algo falla, el estado no cambia.
     * Después compara con lo que había: lo nuevo o modificado se marca con la hora y queda pendiente
     * de subir; lo que desapareció se convierte en una marca de borrado.
     */
    function transaccion(fn) {
      var borrador = copiar(vista);
      var resultado = fn(borrador);
      var t = reloj();
      var nuevo = { version: VERSION, config: borrador.config };
      if (huella('config', datos.config) !== huella('config', borrador.config)) {
        borrador.config.actualizado = t;
        marcar('config', 'config');
      }
      COLECCIONES.forEach(function (c) {
        var antes = {};
        datos[c].forEach(function (e) { antes[e.id] = e; });
        var presentes = {};
        var lista = borrador[c].map(function (e) {
          presentes[e.id] = true;
          var previo = antes[e.id];
          if (!previo || previo.borrado || huella(c, previo) !== huella(c, e)) {
            e.actualizado = t;
            marcar(c, e.id);
          }
          return e;
        });
        datos[c].forEach(function (e) {
          if (presentes[e.id]) return;
          if (e.borrado) { lista.push(e); return; }
          lista.push({ id: e.id, borrado: true, actualizado: t });
          marcar(c, e.id);
        });
        nuevo[c] = lista;
      });
      guardar(nuevo);
      return resultado;
    }

    function avisar() {
      oyentes.forEach(function (fn) { fn(); });
    }

    function buscarProducto(d, id) {
      for (var i = 0; i < d.productos.length; i++) {
        if (d.productos[i].id === id) return d.productos[i];
      }
      return null;
    }

    function registrarMovimiento(d, producto, tipo, cantidad, referencia, nota) {
      d.movimientos.push({
        id: nuevoId(),
        fecha: new Date().toISOString(),
        productoId: producto.id,
        productoNombre: producto.nombre,
        tipo: tipo,
        cantidad: cantidad,
        stockResultante: producto.stock,
        referencia: referencia || '',
        nota: nota || ''
      });
    }

    function validarProducto(d, entrada, idActual) {
      var nombre = String(entrada.nombre || '').trim();
      if (!nombre) throw new Error('El producto necesita un nombre.');
      var codigo = String(entrada.codigo || '').trim();
      if (codigo) {
        var repetido = d.productos.some(function (p) {
          return p.id !== idActual && p.codigo && p.codigo.toLowerCase() === codigo.toLowerCase();
        });
        if (repetido) throw new Error('Ya existe otro producto con el código "' + codigo + '".');
      }
      var precio = aNumero(entrada.precio, 'Precio');
      if (precio < 0) throw new Error('El precio no puede ser negativo.');
      var costo = entrada.costo === '' || entrada.costo == null ? 0 : aNumero(entrada.costo, 'Costo');
      if (costo < 0) throw new Error('El costo no puede ser negativo.');
      var stockMinimo = entrada.stockMinimo === '' || entrada.stockMinimo == null ? 0 : aEntero(entrada.stockMinimo, 'Stock mínimo');
      if (stockMinimo < 0) throw new Error('El stock mínimo no puede ser negativo.');
      var unidad = UNIDADES.indexOf(entrada.unidad) !== -1 ? entrada.unidad : 'unidad';
      // rinde: cuántos vasos salen de una botella (solo para lo que se vende por vaso)
      var rinde = entrada.rinde === '' || entrada.rinde == null ? 0 : aEntero(entrada.rinde, 'Vasos por botella');
      if (rinde < 0) throw new Error('Los vasos por botella no pueden ser negativos.');
      if (unidad !== 'vaso') rinde = 0;
      return {
        codigo: codigo,
        nombre: nombre,
        categoria: String(entrada.categoria || '').trim(),
        precio: redondear(precio),
        costo: redondear(costo),
        stockMinimo: stockMinimo,
        unidad: unidad,
        rinde: rinde
      };
    }

    // Totales por medio de pago y unidades vendidas por producto (las anuladas no suman)
    function resumirFacturas(facturas) {
      var r = { total: 0, porPago: {}, cantidadVentas: 0, anuladas: 0, productos: {} };
      facturas.forEach(function (f) {
        if (f.estado === 'anulada') { r.anuladas++; return; }
        r.cantidadVentas++;
        r.total = redondear(r.total + f.total);
        r.porPago[f.medioPago] = redondear((r.porPago[f.medioPago] || 0) + f.total);
        f.items.forEach(function (i) {
          if (!r.productos[i.nombre]) r.productos[i.nombre] = { cantidad: 0, monto: 0, unidad: i.unidad || 'unidad' };
          r.productos[i.nombre].cantidad += i.cantidad;
          r.productos[i.nombre].monto = redondear(r.productos[i.nombre].monto + i.subtotal);
        });
      });
      return r;
    }

    // Borra las facturas que cumplen la condición, devuelve al stock lo vendido (si no estaban anuladas)
    // y saca sus movimientos de venta/anulación. Devuelve cuántas borró.
    function borrarVentas(d, condicion) {
      var aBorrar = d.facturas.filter(condicion);
      var refs = {};
      aBorrar.forEach(function (f) {
        refs[api.numeroFormateado(f)] = true;
        if (f.estado === 'anulada') return;
        f.items.forEach(function (l) {
          var p = buscarProducto(d, l.productoId);
          if (p) p.stock += l.cantidad;
        });
      });
      d.facturas = d.facturas.filter(function (f) { return !condicion(f); });
      d.movimientos = d.movimientos.filter(function (m) {
        return !((m.tipo === 'venta' || m.tipo === 'anulacion') && refs[m.referencia]);
      });
      return aBorrar.length;
    }

    function proximoNumero(d) {
      return d.facturas.reduce(function (m, f) { return Math.max(m, f.numero || 0); }, 0) + 1;
    }

    function buscarReserva(d, id) {
      var r = d.reservas.find(function (x) { return x.id === id; });
      if (!r) throw new Error('Reserva no encontrada.');
      return r;
    }

    function validarReserva(entrada) {
      var nombre = String(entrada.nombre || '').trim();
      if (!nombre) throw new Error('La reserva necesita un nombre.');
      var personas = aEntero(entrada.personas, 'Personas');
      if (personas < 1) throw new Error('La reserva tiene que ser de al menos 1 persona.');
      var fecha = String(entrada.fecha || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('Elegí la fecha de la peña.');
      var monto = entrada.monto === '' || entrada.monto == null ? 0 : aNumero(entrada.monto, 'Monto');
      if (monto < 0) throw new Error('El monto no puede ser negativo.');
      return {
        nombre: nombre,
        personas: personas,
        fecha: fecha,
        monto: redondear(monto),
        telefono: String(entrada.telefono || '').trim(),
        nota: String(entrada.nota || '').trim()
      };
    }

    var api = {
      // ---------- Lectura ----------
      obtener: function () { return vista; },
      config: function () { return vista.config; },
      productos: function () {
        return vista.productos.filter(function (p) { return p.activo !== false; });
      },
      producto: function (id) { return buscarProducto(vista, id); },
      facturas: function () { return vista.facturas; },
      movimientos: function () { return vista.movimientos; },
      // La numeración sigue a la factura más alta que existe (si se borran todas, vuelve a 1)
      proximoNumero: function () { return proximoNumero(vista); },
      productosBajoStock: function () {
        return api.productos().filter(function (p) { return p.stock <= p.stockMinimo; });
      },

      suscribir: function (fn) { oyentes.push(fn); },

      // Recargar si otra pestaña modificó los datos
      recargar: function () {
        datos = cargar();
        migrar();
        vista = armarVista(datos);
        pendientes = cargarPendientes();
        avisar();
      },

      // ---------- Productos ----------
      crearProducto: function (entrada) {
        return transaccion(function (d) {
          var limpio = validarProducto(d, entrada, null);
          var stockInicial = entrada.stock === '' || entrada.stock == null ? 0 : aEntero(entrada.stock, 'Stock');
          if (stockInicial < 0) throw new Error('El stock inicial no puede ser negativo.');
          var producto = Object.assign({ id: nuevoId(), stock: 0, activo: true }, limpio);
          d.productos.push(producto);
          if (stockInicial > 0) {
            producto.stock = stockInicial;
            registrarMovimiento(d, producto, 'ingreso', stockInicial, '', 'Stock inicial');
          }
          return producto;
        });
      },

      // Edita datos del producto. El stock NO se edita acá: se usa ingresar/ajustar.
      editarProducto: function (id, entrada) {
        return transaccion(function (d) {
          var producto = buscarProducto(d, id);
          if (!producto) throw new Error('Producto no encontrado.');
          Object.assign(producto, validarProducto(d, entrada, id));
          return producto;
        });
      },

      eliminarProducto: function (id) {
        return transaccion(function (d) {
          var producto = buscarProducto(d, id);
          if (!producto) throw new Error('Producto no encontrado.');
          // Baja lógica: las facturas viejas siguen mostrando el producto.
          producto.activo = false;
        });
      },

      // ---------- Stock ----------
      ingresarStock: function (id, cantidad, nota) {
        return transaccion(function (d) {
          var producto = buscarProducto(d, id);
          if (!producto) throw new Error('Producto no encontrado.');
          var cant = aEntero(cantidad, 'Cantidad');
          if (cant <= 0) throw new Error('La cantidad a ingresar tiene que ser mayor a 0.');
          producto.stock += cant;
          registrarMovimiento(d, producto, 'ingreso', cant, '', nota);
          return producto;
        });
      },

      // Fija el stock a un valor contado (inventario físico).
      ajustarStock: function (id, nuevoStock, nota) {
        return transaccion(function (d) {
          var producto = buscarProducto(d, id);
          if (!producto) throw new Error('Producto no encontrado.');
          var valor = aEntero(nuevoStock, 'Stock real');
          if (valor < 0) throw new Error('El stock no puede ser negativo.');
          var diferencia = valor - producto.stock;
          if (diferencia === 0) return producto;
          producto.stock = valor;
          registrarMovimiento(d, producto, 'ajuste', diferencia, '', nota);
          return producto;
        });
      },

      /*
       * Carga rápida: cambia precios y suma stock de varios productos en un solo guardado.
       * filas: [{ productoId, precio, rinde, envases, ingreso }]  (campos vacíos = no cambiar)
       *   ingreso = unidades que entran; envases = botellas (se multiplican por rinde)
       * Si una fila tiene un error, no se guarda ninguna.
       */
      cargaRapida: function (filas) {
        return transaccion(function (d) {
          var cambios = 0;
          filas.forEach(function (f) {
            var p = buscarProducto(d, f.productoId);
            if (!p) throw new Error('Producto no encontrado.');
            if (f.precio !== '' && f.precio != null) {
              var precio = aNumero(f.precio, 'Precio de ' + p.nombre);
              if (precio < 0) throw new Error('El precio de ' + p.nombre + ' no puede ser negativo.');
              if (redondear(precio) !== p.precio) { p.precio = redondear(precio); cambios++; }
            }
            if (f.rinde !== '' && f.rinde != null && p.unidad === 'vaso') {
              var rinde = aEntero(f.rinde, 'Vasos por botella de ' + p.nombre);
              if (rinde < 0) throw new Error('Los vasos por botella de ' + p.nombre + ' no pueden ser negativos.');
              if (rinde !== (p.rinde || 0)) { p.rinde = rinde; cambios++; }
            }
            // envases: botellas que entran de un producto que se vende por vaso; se pasan a vasos
            if (f.envases !== '' && f.envases != null) {
              var bot = aEntero(f.envases, 'Botellas que entran de ' + p.nombre);
              if (bot < 0) throw new Error('Las botellas de ' + p.nombre + ' no pueden ser negativas.');
              if (bot > 0) {
                if (!(p.rinde > 0)) throw new Error('Cargá cuántos vasos rinde una botella de ' + p.nombre + '.');
                p.stock += bot * p.rinde;
                registrarMovimiento(d, p, 'ingreso', bot * p.rinde, '', bot + (bot === 1 ? ' botella' : ' botellas') + ' × ' + p.rinde + ' vasos');
                cambios++;
              }
            }
            if (f.ingreso !== '' && f.ingreso != null) {
              var cant = aEntero(f.ingreso, 'Stock que entra de ' + p.nombre);
              if (cant < 0) throw new Error('El stock que entra de ' + p.nombre + ' no puede ser negativo.');
              if (cant > 0) {
                p.stock += cant;
                registrarMovimiento(d, p, 'ingreso', cant, '', 'Carga rápida');
                cambios++;
              }
            }
          });
          return cambios;
        });
      },

      // ---------- Facturación ----------
      /*
       * items: [{ productoId, cantidad }]
       * opciones: { cliente: {nombre, documento}, medioPago, descuento }
       */
      facturar: function (items, opciones) {
        opciones = opciones || {};
        if (!Array.isArray(items) || items.length === 0) {
          throw new Error('La factura no tiene productos.');
        }
        return transaccion(function (d) {
          // 1) Agrupar cantidades por producto
          var cantidades = {};
          var orden = [];
          items.forEach(function (it) {
            var cant = aEntero(it.cantidad, 'Cantidad');
            if (cant <= 0) throw new Error('Las cantidades tienen que ser mayores a 0.');
            if (!cantidades[it.productoId]) { cantidades[it.productoId] = 0; orden.push(it.productoId); }
            cantidades[it.productoId] += cant;
          });

          // 2) Validar TODO antes de modificar nada
          var faltantes = [];
          orden.forEach(function (pid) {
            var p = buscarProducto(d, pid);
            if (!p || p.activo === false) throw new Error('Hay un producto que ya no existe en el catálogo.');
            if (!(p.precio > 0)) throw new Error('"' + p.nombre + '" no tiene precio cargado. Cargalo en Productos.');
            if (p.stock < cantidades[pid]) {
              faltantes.push(p.nombre + ' (pediste ' + cantidades[pid] + ', hay ' + p.stock + ')');
            }
          });
          if (faltantes.length) {
            throw new Error('Stock insuficiente: ' + faltantes.join('; '));
          }

          // 3) Armar la factura
          var numero = proximoNumero(d);
          var lineas = orden.map(function (pid) {
            var p = buscarProducto(d, pid);
            var cant = cantidades[pid];
            return {
              productoId: p.id,
              codigo: p.codigo,
              nombre: p.nombre,
              unidad: p.unidad || 'unidad',
              precioUnitario: p.precio,
              cantidad: cant,
              subtotal: redondear(p.precio * cant)
            };
          });
          var subtotal = redondear(lineas.reduce(function (s, l) { return s + l.subtotal; }, 0));
          var descuento = opciones.descuento ? aNumero(opciones.descuento, 'Descuento') : 0;
          if (descuento < 0 || descuento > 100) throw new Error('El descuento tiene que estar entre 0 y 100%.');
          var montoDescuento = redondear(subtotal * descuento / 100);
          var cliente = opciones.cliente || {};

          var factura = {
            id: nuevoId(),
            numero: numero,
            puntoVenta: d.config.puntoVenta,
            fecha: new Date().toISOString(),
            cliente: {
              nombre: String(cliente.nombre || '').trim() || 'Consumidor final',
              documento: String(cliente.documento || '').trim()
            },
            medioPago: opciones.medioPago || 'Efectivo',
            items: lineas,
            subtotal: subtotal,
            descuentoPorcentaje: descuento,
            descuento: montoDescuento,
            total: redondear(subtotal - montoDescuento),
            estado: 'emitida'
          };
          // Si hay una peña abierta, la venta queda registrada en esa peña
          var abierto = d.eventos.find(function (e) { return e.abierto; });
          if (abierto) factura.eventoId = abierto.id;

          // 4) Dar de baja el stock y registrar cada movimiento
          var ref = api.numeroFormateado(factura);
          lineas.forEach(function (l) {
            var p = buscarProducto(d, l.productoId);
            p.stock -= l.cantidad;
            registrarMovimiento(d, p, 'venta', -l.cantidad, ref, '');
          });

          d.facturas.push(factura);
          return factura;
        });
      },

      // Anula una factura y devuelve el stock.
      anularFactura: function (id, motivo) {
        return transaccion(function (d) {
          var factura = null;
          for (var i = 0; i < d.facturas.length; i++) {
            if (d.facturas[i].id === id) { factura = d.facturas[i]; break; }
          }
          if (!factura) throw new Error('Factura no encontrada.');
          if (factura.estado === 'anulada') throw new Error('La factura ya está anulada.');
          var ref = api.numeroFormateado(factura);
          factura.items.forEach(function (l) {
            var p = buscarProducto(d, l.productoId);
            if (!p) return;
            p.stock += l.cantidad;
            registrarMovimiento(d, p, 'anulacion', l.cantidad, ref, motivo);
          });
          factura.estado = 'anulada';
          factura.fechaAnulacion = new Date().toISOString();
          factura.motivoAnulacion = String(motivo || '').trim();
          return factura;
        });
      },

      /*
       * Resumen para el cierre: facturas entre desde (incluido) y hasta (excluido).
       * Devuelve totales por medio de pago y unidades vendidas por producto.
       */
      resumen: function (desde, hasta) {
        return resumirFacturas(vista.facturas.filter(function (f) {
          var fecha = new Date(f.fecha);
          return fecha >= desde && fecha < hasta;
        }));
      },

      numeroFormateado: function (factura) {
        var pv = String(factura.puntoVenta || 1).padStart(4, '0');
        var nro = String(factura.numero).padStart(8, '0');
        return pv + '-' + nro;
      },

      // ---------- Configuración y respaldo ----------
      // ---------- Peñas (eventos) ----------
      eventos: function () { return vista.eventos; },
      eventoAbierto: function () {
        return vista.eventos.find(function (e) { return e.abierto; }) || null;
      },

      // entrada: { nombre, fecha: 'AAAA-MM-DD' }
      abrirEvento: function (entrada) {
        return transaccion(function (d) {
          if (d.eventos.some(function (e) { return e.abierto; })) {
            throw new Error('Ya hay una peña abierta. Cerrala antes de abrir otra.');
          }
          var nombre = String(entrada.nombre || '').trim();
          if (!nombre) throw new Error('La peña necesita un nombre.');
          var fecha = String(entrada.fecha || '');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('Elegí la fecha de la peña.');
          var evento = { id: nuevoId(), nombre: nombre, fecha: fecha, abierto: true, apertura: new Date().toISOString(), cierre: null };
          d.eventos.push(evento);
          return evento;
        });
      },

      cerrarEvento: function (id) {
        return transaccion(function (d) {
          var e = d.eventos.find(function (x) { return x.id === id; });
          if (!e) throw new Error('Peña no encontrada.');
          if (!e.abierto) throw new Error('Esa peña ya está cerrada.');
          e.abierto = false;
          e.cierre = new Date().toISOString();
          // Foto del stock al cerrar, para comparar entre peñas
          e.stockAlCerrar = d.productos.filter(function (p) { return p.activo !== false; }).map(function (p) {
            return { nombre: p.nombre, stock: p.stock, unidad: p.unidad || 'unidad' };
          });
          return e;
        });
      },

      // Por si se cerró sin querer
      reabrirEvento: function (id) {
        return transaccion(function (d) {
          var e = d.eventos.find(function (x) { return x.id === id; });
          if (!e) throw new Error('Peña no encontrada.');
          if (d.eventos.some(function (x) { return x.abierto; })) throw new Error('Ya hay otra peña abierta.');
          e.abierto = true;
          e.cierre = null;
          return e;
        });
      },

      editarEvento: function (id, entrada) {
        return transaccion(function (d) {
          var e = d.eventos.find(function (x) { return x.id === id; });
          if (!e) throw new Error('Peña no encontrada.');
          var nombre = String(entrada.nombre || '').trim();
          if (!nombre) throw new Error('La peña necesita un nombre.');
          if (!/^\d{4}-\d{2}-\d{2}$/.test(String(entrada.fecha || ''))) throw new Error('Elegí la fecha de la peña.');
          e.nombre = nombre;
          e.fecha = entrada.fecha;
          return e;
        });
      },

      // Peñas ordenadas de la más vieja a la más nueva
      eventosOrdenados: function () {
        return vista.eventos.slice().sort(function (a, b) {
          return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.apertura < b.apertura ? -1 : 1);
        });
      },

      eventoAnterior: function (id) {
        var lista = api.eventosOrdenados();
        var i = lista.findIndex(function (e) { return e.id === id; });
        return i > 0 ? lista[i - 1] : null;
      },

      resumenEvento: function (id) {
        return resumirFacturas(vista.facturas.filter(function (f) { return f.eventoId === id; }));
      },

      /*
       * Borra una peña y sus ventas (por ejemplo, una de prueba).
       * Lo vendido vuelve al stock. Las reservas no se tocan.
       */
      eliminarEvento: function (id) {
        return transaccion(function (d) {
          var e = d.eventos.find(function (x) { return x.id === id; });
          if (!e) throw new Error('Peña no encontrada.');
          var borradas = borrarVentas(d, function (f) { return f.eventoId === id; });
          d.eventos = d.eventos.filter(function (x) { return x.id !== id; });
          return borradas;
        });
      },

      /*
       * Volver a cero (para limpiar pruebas). NUNCA toca las peñas cerradas: quedan guardadas
       * con sus ventas y sus reservas. Borra:
       *   - las ventas que no son de una peña cerrada (sueltas o de la peña abierta)
       *   - la peña abierta
       *   - las reservas que no son de la fecha de una peña cerrada
       * Productos, precios y stock se mantienen; lo vendido en lo borrado vuelve al stock.
       * La numeración sigue desde la última factura que quedó (o desde 1 si no quedó ninguna).
       */
      volverACero: function () {
        return transaccion(function (d) {
          var cerradas = {}, fechasCerradas = {};
          d.eventos.forEach(function (e) {
            if (!e.abierto) { cerradas[e.id] = true; fechasCerradas[e.fecha] = true; }
          });
          var ventas = borrarVentas(d, function (f) { return !cerradas[f.eventoId]; });
          var penas = d.eventos.filter(function (e) { return e.abierto; }).length;
          d.eventos = d.eventos.filter(function (e) { return !e.abierto; });
          var reservasAntes = d.reservas.length;
          d.reservas = d.reservas.filter(function (r) { return fechasCerradas[r.fecha]; });
          return { ventas: ventas, penas: penas, reservas: reservasAntes - d.reservas.length, penasGuardadas: d.eventos.length };
        });
      },

      // Qué borraría Volver a cero, para mostrarlo antes de confirmar
      previaVolverACero: function () {
        var cerradas = {}, fechasCerradas = {};
        vista.eventos.forEach(function (e) {
          if (!e.abierto) { cerradas[e.id] = true; fechasCerradas[e.fecha] = true; }
        });
        return {
          ventas: vista.facturas.filter(function (f) { return !cerradas[f.eventoId]; }).length,
          penas: vista.eventos.filter(function (e) { return e.abierto; }).length,
          reservas: vista.reservas.filter(function (r) { return !fechasCerradas[r.fecha]; }).length,
          penasGuardadas: Object.keys(cerradas).length
        };
      },

      // ---------- Reservas de entradas ----------
      /*
       * entrada: { nombre, personas, fecha 'AAAA-MM-DD', monto, pagada (bool), telefono, nota }
       * pagada = true  -> ya pagó por transferencia (verde)
       * pagada = false -> paga en efectivo en la puerta (naranja)
       */
      reservas: function () { return vista.reservas; },

      crearReserva: function (entrada) {
        return transaccion(function (d) {
          var r = Object.assign({ id: nuevoId(), creada: new Date().toISOString() }, validarReserva(entrada));
          r.estado = entrada.pagada ? 'pagada' : 'pendiente';
          r.medioPago = entrada.pagada ? 'Transferencia' : null;
          d.reservas.push(r);
          return r;
        });
      },

      editarReserva: function (id, entrada) {
        return transaccion(function (d) {
          var r = buscarReserva(d, id);
          Object.assign(r, validarReserva(entrada));
          if (entrada.pagada === true && r.estado !== 'pagada') { r.estado = 'pagada'; r.medioPago = 'Transferencia'; }
          if (entrada.pagada === false) { r.estado = 'pendiente'; r.medioPago = null; }
          return r;
        });
      },

      // Cuando llegan y pagan en la puerta
      cobrarReserva: function (id, medioPago) {
        return transaccion(function (d) {
          var r = buscarReserva(d, id);
          if (r.estado === 'pagada') throw new Error('Esa reserva ya está paga.');
          r.estado = 'pagada';
          r.medioPago = medioPago || 'Efectivo';
          r.pagadaEn = new Date().toISOString();
          return r;
        });
      },

      eliminarReserva: function (id) {
        return transaccion(function (d) {
          buscarReserva(d, id);
          d.reservas = d.reservas.filter(function (r) { return r.id !== id; });
        });
      },

      resumenReservas: function (fecha) {
        var r = { lista: [], cantidad: 0, personas: 0, total: 0, cobrado: 0, porPago: {}, pendiente: 0 };
        vista.reservas.forEach(function (x) {
          if (x.fecha !== fecha) return;
          r.lista.push(x);
          r.cantidad++;
          r.personas += x.personas;
          r.total = redondear(r.total + x.monto);
          if (x.estado === 'pagada') {
            r.cobrado = redondear(r.cobrado + x.monto);
            r.porPago[x.medioPago] = redondear((r.porPago[x.medioPago] || 0) + x.monto);
          } else {
            r.pendiente = redondear(r.pendiente + x.monto);
          }
        });
        return r;
      },

      guardarPrecioEntrada: function (valor) {
        return transaccion(function (d) {
          var n = aNumero(valor, 'Precio de la entrada');
          if (n < 0) throw new Error('El precio de la entrada no puede ser negativo.');
          d.config.precioEntrada = redondear(n);
          return d.config.precioEntrada;
        });
      },

      // ---------- Precios ----------
      // Vuelve todos los precios a 0 (los productos quedan sin precio hasta cargarlos de nuevo)
      reiniciarPrecios: function () {
        return transaccion(function (d) {
          var n = 0;
          d.productos.forEach(function (p) {
            if (p.activo !== false && p.precio !== 0) { p.precio = 0; n++; }
          });
          return n;
        });
      },

      guardarConfig: function (entrada) {
        return transaccion(function (d) {
          var nombre = String(entrada.nombreNegocio || '').trim();
          if (!nombre) throw new Error('El negocio necesita un nombre.');
          var pv = aEntero(entrada.puntoVenta, 'Punto de venta');
          if (pv < 1) throw new Error('El punto de venta tiene que ser 1 o mayor.');
          d.config.nombreNegocio = nombre;
          d.config.cuit = String(entrada.cuit || '').trim();
          d.config.direccion = String(entrada.direccion || '').trim();
          d.config.telefono = String(entrada.telefono || '').trim();
          d.config.puntoVenta = pv;
          return d.config;
        });
      },

      exportar: function () {
        return JSON.stringify(datos, null, 2);
      },

      importar: function (texto) {
        var parseado;
        try { parseado = JSON.parse(texto); } catch (e) { throw new Error('El archivo no es un respaldo válido.'); }
        if (!parseado || !Array.isArray(parseado.productos) || !Array.isArray(parseado.facturas)) {
          throw new Error('El archivo no es un respaldo de esta app.');
        }
        return transaccion(function (d) {
          var nuevo = normalizar(parseado);
          Object.keys(nuevo).forEach(function (k) { d[k] = nuevo[k]; });
        });
      },

      borrarTodo: function () {
        return transaccion(function (d) {
          var limpio = estadoInicial();
          Object.keys(limpio).forEach(function (k) { d[k] = limpio[k]; });
        });
      },

      // ---------- Sincronización (la usa nube.js) ----------
      // Registros cambiados en esta compu que todavía no se subieron
      pendientes: function () {
        var lista = [];
        Object.keys(pendientes).forEach(function (clave) {
          var i = clave.indexOf(':');
          var c = clave.slice(0, i), id = clave.slice(i + 1);
          var e = c === 'config' ? datos.config : (datos[c] || []).find(function (x) { return x.id === id; });
          if (!e) { delete pendientes[clave]; return; }
          lista.push({ coleccion: c, id: id, datos: e, actualizado: e.actualizado || 0 });
        });
        return lista;
      },

      // Se subieron: se sacan de pendientes, salvo que hayan cambiado mientras se subían
      confirmarEnviados: function (lista) {
        lista.forEach(function (r) {
          var e = r.coleccion === 'config' ? datos.config : (datos[r.coleccion] || []).find(function (x) { return x.id === r.id; });
          if (!e || (e.actualizado || 0) === r.actualizado) delete pendientes[r.coleccion + ':' + r.id];
        });
        guardarPendientes();
      },

      /*
       * Junta lo que llegó de la nube: por cada registro gana el más nuevo.
       * registros: [{ coleccion, id, datos, actualizado }]. Devuelve cuántos cambiaron.
       */
      aplicarRemotos: function (registros) {
        var nuevo = copiar(datos);
        var indices = {};
        COLECCIONES.forEach(function (c) {
          indices[c] = {};
          nuevo[c].forEach(function (e, i) { indices[c][e.id] = i; });
        });
        var cambios = 0;
        registros.forEach(function (r) {
          if (r.actualizado > ultimoReloj) ultimoReloj = r.actualizado;
          var remoto = Object.assign({}, r.datos, { actualizado: r.actualizado });
          if (r.coleccion === 'config') {
            if (r.actualizado > (nuevo.config.actualizado || 0)) {
              nuevo.config = Object.assign(estadoInicial().config, remoto);
              delete pendientes['config:config'];
              cambios++;
            }
            return;
          }
          if (COLECCIONES.indexOf(r.coleccion) === -1) return;
          remoto.id = r.id;
          var i = indices[r.coleccion][r.id];
          if (i === undefined) {
            indices[r.coleccion][r.id] = nuevo[r.coleccion].length;
            nuevo[r.coleccion].push(remoto);
            cambios++;
          } else if (r.actualizado > (nuevo[r.coleccion][i].actualizado || 0)) {
            nuevo[r.coleccion][i] = remoto;
            delete pendientes[r.coleccion + ':' + r.id];
            cambios++;
          }
        });
        if (!cambios) return 0;
        recalcularStock(nuevo);
        nuevo.version = VERSION;
        guardar(nuevo);
        return cambios;
      },

      // Para la primera conexión: ¿esta compu tiene datos cargados por alguien?
      tieneDatosPropios: function () {
        return vista.facturas.length > 0 || vista.eventos.length > 0 || vista.reservas.length > 0 ||
          vista.productos.some(function (p) { return p.precio > 0 || p.stock > 0; });
      },

      // Para subir todo lo de esta compu la primera vez
      marcarTodoPendiente: function () {
        marcar('config', 'config');
        COLECCIONES.forEach(function (c) { datos[c].forEach(function (e) { marcar(c, e.id); }); });
        guardarPendientes();
      },

      // Para usar solo lo de la nube: esta compu queda vacía hasta que baje todo
      reiniciarLocal: function () {
        pendientes = {};
        guardar(estadoInicial());
      },

      cantidadPendientes: function () { return Object.keys(pendientes).length; }
    };

    return api;
  }

  global.crearStore = crearStore;
  global.STORE_KEY = STORAGE_KEY;
})(typeof window !== 'undefined' ? window : globalThis);
