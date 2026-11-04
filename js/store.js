/*
 * Store: toda la lógica de datos de la app (productos, stock, facturas).
 * Guarda en localStorage del navegador. No depende del HTML, así se puede testear.
 *
 * Regla clave: facturar() valida el stock de TODOS los ítems antes de tocar nada.
 * Si alcanza, descuenta el stock, registra los movimientos y emite la factura
 * en un único guardado. Si no alcanza, no cambia nada.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'la-negrada:datos';
  var UNIDADES = ['unidad', 'porción', 'vaso', 'botella'];
  var VERSION = 1;

  function estadoInicial() {
    return {
      version: VERSION,
      config: {
        nombreNegocio: 'La Negrada',
        cuit: '',
        direccion: '',
        telefono: '',
        puntoVenta: 1,
        proximoNumero: 1,
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

  function crearStore(storage) {
    var datos = cargar();
    var oyentes = [];

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
        version: VERSION,
        config: Object.assign(base.config, d.config || {}),
        productos: Array.isArray(d.productos) ? d.productos : [],
        movimientos: Array.isArray(d.movimientos) ? d.movimientos : [],
        facturas: Array.isArray(d.facturas) ? d.facturas : [],
        eventos: Array.isArray(d.eventos) ? d.eventos : [],
        reservas: Array.isArray(d.reservas) ? d.reservas : []
      };
    }

    // Aplica un cambio sobre una copia y la guarda; si algo falla, el estado no cambia.
    function transaccion(fn) {
      var borrador = copiar(datos);
      var resultado = fn(borrador);
      storage.setItem(STORAGE_KEY, JSON.stringify(borrador));
      datos = borrador;
      avisar();
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
      obtener: function () { return datos; },
      config: function () { return datos.config; },
      productos: function () {
        return datos.productos.filter(function (p) { return p.activo !== false; });
      },
      producto: function (id) { return buscarProducto(datos, id); },
      facturas: function () { return datos.facturas; },
      movimientos: function () { return datos.movimientos; },
      productosBajoStock: function () {
        return api.productos().filter(function (p) { return p.stock <= p.stockMinimo; });
      },

      suscribir: function (fn) { oyentes.push(fn); },

      // Recargar si otra pestaña modificó los datos
      recargar: function () { datos = cargar(); avisar(); },

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
          var numero = d.config.proximoNumero;
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
          d.config.proximoNumero = numero + 1;
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
        return resumirFacturas(datos.facturas.filter(function (f) {
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
      eventos: function () { return datos.eventos; },
      eventoAbierto: function () {
        return datos.eventos.find(function (e) { return e.abierto; }) || null;
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
        return datos.eventos.slice().sort(function (a, b) {
          return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.apertura < b.apertura ? -1 : 1);
        });
      },

      eventoAnterior: function (id) {
        var lista = api.eventosOrdenados();
        var i = lista.findIndex(function (e) { return e.id === id; });
        return i > 0 ? lista[i - 1] : null;
      },

      resumenEvento: function (id) {
        return resumirFacturas(datos.facturas.filter(function (f) { return f.eventoId === id; }));
      },

      // ---------- Reservas de entradas ----------
      /*
       * entrada: { nombre, personas, fecha 'AAAA-MM-DD', monto, pagada (bool), telefono, nota }
       * pagada = true  -> ya pagó por transferencia (verde)
       * pagada = false -> paga en efectivo en la puerta (naranja)
       */
      reservas: function () { return datos.reservas; },

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
        datos.reservas.forEach(function (x) {
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
      }
    };

    return api;
  }

  global.crearStore = crearStore;
  global.STORE_KEY = STORAGE_KEY;
})(typeof window !== 'undefined' ? window : globalThis);
