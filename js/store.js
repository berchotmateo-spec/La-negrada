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
        proximoNumero: 1
      },
      productos: [],
      movimientos: [],
      facturas: []
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
        facturas: Array.isArray(d.facturas) ? d.facturas : []
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
      return {
        codigo: codigo,
        nombre: nombre,
        categoria: String(entrada.categoria || '').trim(),
        precio: redondear(precio),
        costo: redondear(costo),
        stockMinimo: stockMinimo
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

      numeroFormateado: function (factura) {
        var pv = String(factura.puntoVenta || 1).padStart(4, '0');
        var nro = String(factura.numero).padStart(8, '0');
        return pv + '-' + nro;
      },

      // ---------- Configuración y respaldo ----------
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
