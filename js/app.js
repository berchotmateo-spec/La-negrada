/* Interfaz de la app. Toda la lógica de datos está en store.js. */
(function () {
  'use strict';

  var primeraVez = window.localStorage.getItem(window.STORE_KEY) === null;
  var store = window.crearStore(window.localStorage);
  var carrito = []; // [{ productoId, cantidad }]
  var categoriaPOS = ''; // '' = todas

  // Carta del bar. Arranca sin precio ni stock: se cargan desde Productos y Stock.
  var CARTA = [
    { nombre: 'Choripán', categoria: 'Comidas' },
    { nombre: 'Guiso de lentejas', categoria: 'Comidas' },
    { nombre: 'Humita', categoria: 'Comidas' },
    { nombre: 'Empanada', categoria: 'Comidas' },
    { nombre: 'Pastelito', categoria: 'Comidas' },
    { nombre: 'Arroz con leche', categoria: 'Postres' },
    { nombre: 'Vino', categoria: 'Bebidas' },
    { nombre: 'Cerveza', categoria: 'Bebidas' },
    { nombre: 'Fernet', categoria: 'Bebidas' },
    { nombre: 'Gancia', categoria: 'Bebidas' },
    { nombre: 'Gaseosa', categoria: 'Bebidas' },
    { nombre: 'Agua', categoria: 'Bebidas' },
    { nombre: 'Limonada', categoria: 'Bebidas' }
  ];

  // Agrega los productos de la carta que no estén cargados. Devuelve cuántos agregó.
  function cargarCarta() {
    var existentes = store.productos().map(function (p) { return p.nombre.toLowerCase(); });
    var nuevos = 0;
    CARTA.forEach(function (item) {
      if (existentes.indexOf(item.nombre.toLowerCase()) !== -1) return;
      store.crearProducto({ nombre: item.nombre, categoria: item.categoria, precio: 0, stock: 0, stockMinimo: 0 });
      nuevos++;
    });
    return nuevos;
  }

  if (primeraVez) cargarCarta();

  // ---------- Utilidades ----------
  var $ = function (sel) { return document.querySelector(sel); };

  var formatoMoneda = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
  function plata(n) { return formatoMoneda.format(n || 0); }

  function fechaHora(iso) {
    return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  }

  function esc(texto) {
    return String(texto == null ? '' : texto)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function aviso(mensaje, tipo) {
    var el = document.createElement('div');
    el.className = 'aviso ' + (tipo || 'ok');
    el.textContent = mensaje;
    var contenedor = $('#avisos');
    while (contenedor.children.length >= 2) contenedor.firstChild.remove();
    contenedor.appendChild(el);
    setTimeout(function () { el.remove(); }, tipo === 'error' ? 6000 : 3000);
  }

  // Ejecuta una acción del store mostrando el error si falla.
  function intentar(fn, mensajeOk) {
    try {
      var r = fn();
      if (mensajeOk) aviso(mensajeOk);
      return r;
    } catch (e) {
      aviso(e.message, 'error');
      return null;
    }
  }

  // La jornada del bar corta a las 6 am: una venta a la 1 am cuenta para la noche anterior.
  var HORA_CORTE = 6;
  function jornada(fecha) {
    return new Date(fecha.getTime() - HORA_CORTE * 3600 * 1000);
  }
  function mismoDia(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function vacio(texto) { return '<p class="vacio">' + esc(texto) + '</p>'; }

  // ---------- Modal ----------
  var modal = $('#modal');
  function abrirModal(html) {
    $('#modal-contenido').innerHTML = html;
    modal.showModal();
  }
  function cerrarModal() { modal.close(); }
  modal.addEventListener('click', function (e) {
    if (e.target === modal || e.target.closest('[data-cerrar]')) cerrarModal();
  });

  // ---------- Navegación ----------
  var vistas = ['inicio', 'vender', 'productos', 'stock', 'facturas', 'config'];
  function mostrarVista() {
    var actual = location.hash.replace('#', '');
    if (vistas.indexOf(actual) === -1) actual = 'inicio';
    vistas.forEach(function (v) {
      $('#vista-' + v).classList.toggle('activa', v === actual);
    });
    document.querySelectorAll('.menu a').forEach(function (a) {
      a.classList.toggle('activo', a.dataset.vista === actual);
    });
    if (actual === 'vender') $('#pos-buscar').focus();
  }
  window.addEventListener('hashchange', mostrarVista);

  // ---------- Inicio ----------
  function renderInicio() {
    var hoy = jornada(new Date());
    var emitidas = store.facturas().filter(function (f) { return f.estado === 'emitida'; });
    var deHoy = emitidas.filter(function (f) { return mismoDia(jornada(new Date(f.fecha)), hoy); });
    var delMes = emitidas.filter(function (f) {
      var d = jornada(new Date(f.fecha));
      return d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth();
    });
    var suma = function (lista) { return lista.reduce(function (s, f) { return s + f.total; }, 0); };
    var productos = store.productos();
    var valorStock = productos.reduce(function (s, p) { return s + p.stock * (p.costo || p.precio); }, 0);
    var bajos = store.productosBajoStock();

    $('#res-ventas-hoy').textContent = plata(suma(deHoy));
    $('#res-cant-hoy').textContent = deHoy.length + (deHoy.length === 1 ? ' factura' : ' facturas');
    $('#res-ventas-mes').textContent = plata(suma(delMes));
    $('#res-cant-mes').textContent = delMes.length + (delMes.length === 1 ? ' factura' : ' facturas');
    $('#res-productos').textContent = productos.length;
    $('#res-valor-stock').textContent = 'Stock valorizado ' + plata(valorStock);
    $('#res-bajo').textContent = bajos.length;

    // Primeros pasos: productos que todavía no tienen precio
    var sinPrecio = productos.filter(function (p) { return !(p.precio > 0); });
    $('#primeros-pasos').innerHTML = sinPrecio.length
      ? '<div class="banner"><div><strong>Falta cargar el precio de ' + sinPrecio.length +
        (sinPrecio.length === 1 ? ' producto' : ' productos') + '</strong>' +
        '<p>' + esc(sinPrecio.slice(0, 5).map(function (p) { return p.nombre; }).join(', ')) +
        (sinPrecio.length > 5 ? ' y ' + (sinPrecio.length - 5) + ' más' : '') +
        '. Hasta que tengan precio y stock no se pueden vender.</p></div>' +
        '<a class="btn btn-primario" href="#productos">Cargar precios</a></div>'
      : '';

    // Caja de la noche por medio de pago
    var porPago = {};
    deHoy.forEach(function (f) { porPago[f.medioPago] = (porPago[f.medioPago] || 0) + f.total; });
    var medios = Object.keys(porPago).sort(function (a, b) { return porPago[b] - porPago[a]; });
    $('#caja-noche').innerHTML = medios.length
      ? '<ul class="lista">' + medios.map(function (m) {
          return '<li><span>' + esc(m) + '</span><strong>' + plata(porPago[m]) + '</strong></li>';
        }).join('') + '<li class="fila-total"><span>Total</span><strong>' + plata(suma(deHoy)) + '</strong></li></ul>'
      : vacio('Todavía no hubo ventas esta noche.');

    // Lo más vendido de la noche
    var vendidos = {};
    deHoy.forEach(function (f) {
      f.items.forEach(function (i) {
        if (!vendidos[i.nombre]) vendidos[i.nombre] = { cant: 0, monto: 0 };
        vendidos[i.nombre].cant += i.cantidad;
        vendidos[i.nombre].monto += i.subtotal;
      });
    });
    var ranking = Object.keys(vendidos).sort(function (a, b) { return vendidos[b].cant - vendidos[a].cant; }).slice(0, 8);
    $('#mas-vendido').innerHTML = ranking.length
      ? '<ul class="lista">' + ranking.map(function (n) {
          return '<li><span><strong>' + vendidos[n].cant + '×</strong> ' + esc(n) + '</span><span class="tenue">' + plata(vendidos[n].monto) + '</span></li>';
        }).join('') + '</ul>'
      : vacio('Sin ventas todavía.');

    $('#lista-bajo-stock').innerHTML = bajos.length
      ? '<ul class="lista">' + bajos.map(function (p) {
          return '<li><span>' + esc(p.nombre) + '</span><span class="etiqueta ' + (p.stock === 0 ? 'roja' : 'amarilla') + '">' +
            (p.stock === 0 ? 'Sin stock' : 'Quedan ' + p.stock) + '</span></li>';
        }).join('') + '</ul>'
      : vacio('Todo el stock está bien.');

    var ultimas = store.facturas().slice(-6).reverse();
    $('#lista-ultimas').innerHTML = ultimas.length
      ? '<ul class="lista">' + ultimas.map(function (f) {
          return '<li><button class="link" data-ver-factura="' + f.id + '">' + store.numeroFormateado(f) + '</button>' +
            '<span class="tenue">' + fechaHora(f.fecha) + '</span>' +
            '<span class="' + (f.estado === 'anulada' ? 'tachado' : '') + '">' + plata(f.total) + '</span></li>';
        }).join('') + '</ul>'
      : vacio('Todavía no hay ventas.');
  }

  // ---------- Vender (punto de venta) ----------
  function filtrarProductos(texto) {
    var t = texto.trim().toLowerCase();
    return store.productos().filter(function (p) {
      if (categoriaPOS && p.categoria !== categoriaPOS) return false;
      return !t || p.nombre.toLowerCase().indexOf(t) !== -1 ||
        (p.codigo && p.codigo.toLowerCase().indexOf(t) !== -1) ||
        (p.categoria && p.categoria.toLowerCase().indexOf(t) !== -1);
    });
  }

  function cantidadEnCarrito(id) {
    var item = carrito.find(function (i) { return i.productoId === id; });
    return item ? item.cantidad : 0;
  }

  function agregarAlCarrito(id) {
    var p = store.producto(id);
    if (!p) return;
    if (!(p.precio > 0)) {
      aviso(p.nombre + ' no tiene precio. Cargalo en Productos.', 'error');
      return;
    }
    var item = carrito.find(function (i) { return i.productoId === id; });
    var actual = item ? item.cantidad : 0;
    if (actual + 1 > p.stock) {
      aviso('No hay más stock de ' + p.nombre + ' (disponible: ' + p.stock + ').', 'error');
      return;
    }
    if (item) item.cantidad++; else carrito.push({ productoId: id, cantidad: 1 });
    renderVender();
  }

  function categorias() {
    var lista = [];
    store.productos().forEach(function (p) {
      if (p.categoria && lista.indexOf(p.categoria) === -1) lista.push(p.categoria);
    });
    return lista;
  }

  function renderVender() {
    var cats = categorias();
    if (categoriaPOS && cats.indexOf(categoriaPOS) === -1) categoriaPOS = '';
    $('#pos-categorias').innerHTML = cats.length > 1
      ? [''].concat(cats).map(function (c) {
          return '<button type="button" class="chip' + (c === categoriaPOS ? ' activo' : '') + '" data-categoria="' + esc(c) + '"' +
            ' aria-pressed="' + (c === categoriaPOS) + '">' + esc(c || 'Todo') + '</button>';
        }).join('')
      : '';

    var lista = filtrarProductos($('#pos-buscar').value);
    $('#pos-productos').innerHTML = lista.length
      ? lista.map(function (p) {
          var disponible = p.stock - cantidadEnCarrito(p.id);
          var sinPrecio = !(p.precio > 0);
          var bloqueado = sinPrecio || disponible <= 0;
          var estado = sinPrecio ? 'Sin precio' : (disponible <= 0 ? 'Sin stock' : 'Quedan ' + disponible);
          return '<button type="button" class="pos-item" data-agregar="' + p.id + '"' + (bloqueado ? ' disabled' : '') + '>' +
            '<span class="pos-item-nombre">' + esc(p.nombre) + '</span>' +
            '<span class="pos-item-precio">' + (sinPrecio ? '—' : plata(p.precio)) + '</span>' +
            '<span class="pos-item-stock ' + (bloqueado ? 'sin' : '') + '">' + estado + '</span></button>';
        }).join('')
      : vacio(store.productos().length ? 'No hay productos que coincidan.' : 'Cargá productos en la sección Productos.');

    // Sacar del carrito productos que ya no existen
    carrito = carrito.filter(function (i) { return store.producto(i.productoId) && store.producto(i.productoId).activo !== false; });

    var subtotal = 0;
    $('#pos-carrito').innerHTML = carrito.length
      ? '<ul class="carrito">' + carrito.map(function (i) {
          var p = store.producto(i.productoId);
          var sub = p.precio * i.cantidad;
          subtotal += sub;
          return '<li><div class="carrito-nombre">' + esc(p.nombre) + '<span class="tenue">' + plata(p.precio) + ' c/u</span></div>' +
            '<div class="carrito-cant"><button type="button" class="btn-cant" data-restar="' + p.id + '" aria-label="Restar">−</button>' +
            '<span>' + i.cantidad + '</span>' +
            '<button type="button" class="btn-cant" data-sumar="' + p.id + '" aria-label="Sumar">+</button></div>' +
            '<div class="carrito-sub">' + plata(sub) + '</div></li>';
        }).join('') + '</ul>'
      : vacio('Tocá un producto para agregarlo.');

    var desc = Math.min(100, Math.max(0, parseFloat($('#pos-descuento').value) || 0));
    $('#pos-subtotal').textContent = plata(subtotal);
    $('#pos-total').textContent = plata(subtotal - subtotal * desc / 100);
    $('#pos-facturar').disabled = carrito.length === 0;
  }

  $('#pos-buscar').addEventListener('input', renderVender);
  $('#pos-buscar').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    var texto = e.target.value.trim().toLowerCase();
    var porCodigo = store.productos().find(function (p) { return p.codigo && p.codigo.toLowerCase() === texto; });
    var lista = filtrarProductos(e.target.value);
    var elegido = porCodigo || (lista.length === 1 ? lista[0] : null);
    if (elegido) { agregarAlCarrito(elegido.id); e.target.value = ''; renderVender(); }
  });
  $('#pos-descuento').addEventListener('input', renderVender);

  $('#vista-vender').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.categoria !== undefined) { categoriaPOS = b.dataset.categoria; renderVender(); return; }
    if (b.dataset.agregar) agregarAlCarrito(b.dataset.agregar);
    if (b.dataset.sumar) agregarAlCarrito(b.dataset.sumar);
    if (b.dataset.restar) {
      var item = carrito.find(function (i) { return i.productoId === b.dataset.restar; });
      if (item) {
        item.cantidad--;
        if (item.cantidad <= 0) carrito.splice(carrito.indexOf(item), 1);
      }
      renderVender();
    }
  });

  $('#pos-vaciar').addEventListener('click', function () { carrito = []; renderVender(); });

  $('#pos-facturar').addEventListener('click', function () {
    var factura = intentar(function () {
      return store.facturar(carrito, {
        cliente: { nombre: $('#pos-cliente').value, documento: $('#pos-documento').value },
        medioPago: $('#pos-pago').value,
        descuento: $('#pos-descuento').value
      });
    });
    if (!factura) return;
    carrito = [];
    $('#pos-cliente').value = '';
    $('#pos-documento').value = '';
    $('#pos-descuento').value = '0';
    renderVender();
    aviso('Factura ' + store.numeroFormateado(factura) + ' emitida. Stock actualizado.');
    verFactura(factura.id);
  });

  // ---------- Productos ----------
  function renderProductos() {
    var t = $('#prod-buscar').value.trim().toLowerCase();
    var lista = store.productos().filter(function (p) {
      return !t || [p.nombre, p.codigo, p.categoria].join(' ').toLowerCase().indexOf(t) !== -1;
    });
    var ordenCat = categorias();
    lista.sort(function (a, b) {
      return (ordenCat.indexOf(a.categoria) - ordenCat.indexOf(b.categoria)) || a.nombre.localeCompare(b.nombre);
    });

    $('#tabla-productos').innerHTML = lista.length
      ? lista.map(function (p) {
          var clase = p.stock === 0 ? 'roja' : (p.stock <= p.stockMinimo ? 'amarilla' : 'verde');
          var precio = p.precio > 0 ? plata(p.precio) : '<span class="etiqueta amarilla">Sin precio</span>';
          return '<tr><td class="tenue">' + esc(p.codigo || '—') + '</td><td>' + esc(p.nombre) + '</td>' +
            '<td>' + esc(p.categoria || '—') + '</td><td class="num">' + precio + '</td>' +
            '<td class="num"><span class="etiqueta ' + clase + '">' + p.stock + '</span></td>' +
            '<td class="acciones"><button class="btn btn-chico" data-editar="' + p.id + '">Editar</button>' +
            '<button class="btn btn-chico" data-mover="' + p.id + '">Stock</button></td></tr>';
        }).join('')
      : '<tr><td colspan="6">' + vacio(store.productos().length ? 'No hay coincidencias.' : 'Todavía no cargaste productos.') + '</td></tr>';
  }

  function formularioProducto(p) {
    var nuevo = !p;
    p = p || { codigo: '', nombre: '', categoria: '', precio: '', costo: '', stockMinimo: 0 };
    var categorias = Array.from(new Set(store.productos().map(function (x) { return x.categoria; }).filter(Boolean)));
    abrirModal(
      '<form id="form-producto" class="form">' +
      '<h2>' + (nuevo ? 'Nuevo producto' : 'Editar producto') + '</h2>' +
      '<div class="grilla-form">' +
      '<label>Nombre *<input class="input" name="nombre" required value="' + esc(p.nombre) + '"></label>' +
      '<label>Código<input class="input" name="codigo" value="' + esc(p.codigo) + '" placeholder="SKU o código de barras"></label>' +
      '<label>Categoría<input class="input" name="categoria" list="lista-categorias" value="' + esc(p.categoria) + '"></label>' +
      '<datalist id="lista-categorias">' + categorias.map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>' +
      '<label>Precio de venta *<input class="input" name="precio" type="number" min="0" step="0.01" required value="' + esc(p.precio) + '"></label>' +
      '<label>Costo<input class="input" name="costo" type="number" min="0" step="0.01" value="' + esc(p.costo) + '"></label>' +
      '<label>Stock mínimo<input class="input" name="stockMinimo" type="number" min="0" step="1" value="' + esc(p.stockMinimo) + '"></label>' +
      (nuevo ? '<label>Stock inicial<input class="input" name="stock" type="number" min="0" step="1" value="0"></label>' : '') +
      '</div>' +
      (nuevo ? '' : '<p class="ayuda">Stock actual: <strong>' + p.stock + '</strong>. Para cambiarlo usá la sección Stock.</p>') +
      '<div class="acciones-modal">' +
      (nuevo ? '' : '<button type="button" class="btn btn-peligro" id="btn-eliminar-producto">Eliminar</button>') +
      '<span class="espacio"></span>' +
      '<button type="button" class="btn" data-cerrar>Cancelar</button>' +
      '<button type="submit" class="btn btn-primario">Guardar</button></div></form>'
    );

    $('#form-producto').addEventListener('submit', function (e) {
      e.preventDefault();
      var datos = Object.fromEntries(new FormData(e.target).entries());
      var ok = intentar(function () {
        return nuevo ? store.crearProducto(datos) : store.editarProducto(p.id, datos);
      }, nuevo ? 'Producto creado.' : 'Producto actualizado.');
      if (ok) cerrarModal();
    });

    var btnEliminar = $('#btn-eliminar-producto');
    if (btnEliminar) {
      btnEliminar.addEventListener('click', function () {
        if (!confirm('¿Eliminar "' + p.nombre + '"? Las facturas anteriores no se modifican.')) return;
        if (intentar(function () { store.eliminarProducto(p.id); return true; }, 'Producto eliminado.')) cerrarModal();
      });
    }
  }

  $('#btn-nuevo-producto').addEventListener('click', function () { formularioProducto(null); });
  $('#prod-buscar').addEventListener('input', renderProductos);
  $('#tabla-productos').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.editar) formularioProducto(store.producto(b.dataset.editar));
    if (b.dataset.mover) {
      location.hash = 'stock';
      $('#stock-producto').value = b.dataset.mover;
      actualizarAyudaStock();
      $('#stock-cantidad').focus();
    }
  });

  // ---------- Stock ----------
  var etiquetasMovimiento = { venta: 'Venta', ingreso: 'Ingreso', ajuste: 'Ajuste', anulacion: 'Anulación' };

  function renderStock() {
    var select = $('#stock-producto');
    var elegido = select.value;
    var productos = store.productos().slice().sort(function (a, b) { return a.nombre.localeCompare(b.nombre); });
    select.innerHTML = productos.length
      ? productos.map(function (p) { return '<option value="' + p.id + '">' + esc(p.nombre) + (p.codigo ? ' (' + esc(p.codigo) + ')' : '') + '</option>'; }).join('')
      : '<option value="">No hay productos</option>';
    if (elegido && store.producto(elegido)) select.value = elegido;
    actualizarAyudaStock();

    var movs = store.movimientos().slice(-200).reverse();
    $('#tabla-movimientos').innerHTML = movs.length
      ? movs.map(function (m) {
          return '<tr><td class="tenue">' + fechaHora(m.fecha) + '</td><td>' + esc(m.productoNombre) + '</td>' +
            '<td><span class="etiqueta tipo-' + m.tipo + '">' + etiquetasMovimiento[m.tipo] + '</span></td>' +
            '<td class="num ' + (m.cantidad < 0 ? 'negativo' : 'positivo') + '">' + (m.cantidad > 0 ? '+' : '') + m.cantidad + '</td>' +
            '<td class="num">' + m.stockResultante + '</td>' +
            '<td class="tenue">' + esc(m.referencia || m.nota || '') + '</td></tr>';
        }).join('')
      : '<tr><td colspan="6">' + vacio('Sin movimientos todavía.') + '</td></tr>';
  }

  function actualizarAyudaStock() {
    var p = store.producto($('#stock-producto').value);
    var tipo = $('#stock-tipo').value;
    $('#stock-cantidad-label').textContent = tipo === 'ingreso' ? 'Cantidad que ingresa' : 'Stock real contado';
    $('#stock-actual').textContent = p ? 'Stock actual de ' + p.nombre + ': ' + p.stock : '';
  }

  $('#stock-producto').addEventListener('change', actualizarAyudaStock);
  $('#stock-tipo').addEventListener('change', actualizarAyudaStock);
  $('#form-stock').addEventListener('submit', function (e) {
    e.preventDefault();
    var id = $('#stock-producto').value;
    var cant = $('#stock-cantidad').value;
    var nota = $('#stock-nota').value;
    var tipo = $('#stock-tipo').value;
    var ok = intentar(function () {
      return tipo === 'ingreso' ? store.ingresarStock(id, cant, nota) : store.ajustarStock(id, cant, nota);
    }, 'Stock actualizado.');
    if (ok) { $('#stock-cantidad').value = ''; $('#stock-nota').value = ''; }
  });

  // ---------- Facturas ----------
  function renderFacturas() {
    var t = $('#fac-buscar').value.trim().toLowerCase();
    var desde = $('#fac-desde').value ? new Date($('#fac-desde').value + 'T00:00:00') : null;
    var hasta = $('#fac-hasta').value ? new Date($('#fac-hasta').value + 'T23:59:59') : null;
    var lista = store.facturas().filter(function (f) {
      var fecha = new Date(f.fecha);
      if (desde && fecha < desde) return false;
      if (hasta && fecha > hasta) return false;
      return !t || store.numeroFormateado(f).indexOf(t) !== -1 || f.cliente.nombre.toLowerCase().indexOf(t) !== -1;
    }).reverse();

    $('#tabla-facturas').innerHTML = lista.length
      ? lista.map(function (f) {
          return '<tr><td>' + store.numeroFormateado(f) + '</td><td class="tenue">' + fechaHora(f.fecha) + '</td>' +
            '<td>' + esc(f.cliente.nombre) + '</td><td>' + esc(f.medioPago) + '</td>' +
            '<td class="num ' + (f.estado === 'anulada' ? 'tachado' : '') + '">' + plata(f.total) + '</td>' +
            '<td><span class="etiqueta ' + (f.estado === 'anulada' ? 'roja' : 'verde') + '">' + (f.estado === 'anulada' ? 'Anulada' : 'Emitida') + '</span></td>' +
            '<td class="acciones"><button class="btn btn-chico" data-ver-factura="' + f.id + '">Ver</button></td></tr>';
        }).join('')
      : '<tr><td colspan="7">' + vacio('No hay facturas.') + '</td></tr>';

    var emitidas = lista.filter(function (f) { return f.estado === 'emitida'; });
    var total = emitidas.reduce(function (s, f) { return s + f.total; }, 0);
    $('#fac-resumen').textContent = emitidas.length + ' facturas emitidas en la lista · Total ' + plata(total);
  }

  ['#fac-buscar', '#fac-desde', '#fac-hasta'].forEach(function (sel) {
    $(sel).addEventListener('input', renderFacturas);
  });

  function htmlComprobante(f) {
    var c = store.config();
    return '<div class="comprobante">' +
      '<div class="comp-cabecera"><div class="comp-negocio"><img class="comp-logo" src="img/logo.jpg" alt=""><div><h2>' + esc(c.nombreNegocio) + '</h2>' +
      (c.direccion ? '<p>' + esc(c.direccion) + '</p>' : '') +
      (c.telefono ? '<p>Tel: ' + esc(c.telefono) + '</p>' : '') +
      (c.cuit ? '<p>CUIT: ' + esc(c.cuit) + '</p>' : '') + '</div></div>' +
      '<div class="comp-numero"><strong>Comprobante</strong><p>N° ' + store.numeroFormateado(f) + '</p><p>' + fechaHora(f.fecha) + '</p></div></div>' +
      (f.estado === 'anulada' ? '<p class="sello-anulada">ANULADA' + (f.motivoAnulacion ? ' · ' + esc(f.motivoAnulacion) : '') + '</p>' : '') +
      '<p><strong>Cliente:</strong> ' + esc(f.cliente.nombre) + (f.cliente.documento ? ' · ' + esc(f.cliente.documento) : '') + '</p>' +
      '<table class="tabla comp-tabla"><thead><tr><th>Cant.</th><th>Producto</th><th class="num">P. unit.</th><th class="num">Subtotal</th></tr></thead><tbody>' +
      f.items.map(function (i) {
        return '<tr><td>' + i.cantidad + '</td><td>' + esc(i.nombre) + '</td><td class="num">' + plata(i.precioUnitario) + '</td><td class="num">' + plata(i.subtotal) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<div class="comp-totales">' +
      (f.descuento ? '<p>Subtotal: ' + plata(f.subtotal) + '</p><p>Descuento ' + f.descuentoPorcentaje + '%: −' + plata(f.descuento) + '</p>' : '') +
      '<p class="comp-total">Total: ' + plata(f.total) + '</p><p>Pago: ' + esc(f.medioPago) + '</p></div>' +
      '<p class="comp-pie">Comprobante no válido como factura fiscal.</p></div>';
  }

  function verFactura(id) {
    var f = store.facturas().find(function (x) { return x.id === id; });
    if (!f) return;
    abrirModal(htmlComprobante(f) +
      '<div class="acciones-modal">' +
      (f.estado === 'emitida' ? '<button type="button" class="btn btn-peligro" id="btn-anular">Anular</button>' : '') +
      '<span class="espacio"></span>' +
      '<button type="button" class="btn" data-cerrar>Cerrar</button>' +
      '<button type="button" class="btn btn-primario" id="btn-imprimir">Imprimir</button></div>');

    $('#btn-imprimir').addEventListener('click', function () {
      $('#impresion').innerHTML = htmlComprobante(f);
      window.print();
    });
    var anular = $('#btn-anular');
    if (anular) {
      anular.addEventListener('click', function () {
        var motivo = prompt('Motivo de la anulación (el stock se devuelve):', '');
        if (motivo === null) return;
        var ok = intentar(function () { return store.anularFactura(f.id, motivo); }, 'Factura anulada. El stock fue devuelto.');
        if (ok) verFactura(f.id);
      });
    }
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-ver-factura]');
    if (b) verFactura(b.dataset.verFactura);
  });

  // ---------- Ajustes ----------
  function renderConfig() {
    var c = store.config();
    var form = $('#form-config');
    ['nombreNegocio', 'cuit', 'direccion', 'telefono', 'puntoVenta'].forEach(function (k) {
      if (document.activeElement !== form.elements[k]) form.elements[k].value = c[k];
    });
    document.title = c.nombreNegocio + ' · Gestión';
  }

  $('#form-config').addEventListener('submit', function (e) {
    e.preventDefault();
    intentar(function () { return store.guardarConfig(Object.fromEntries(new FormData(e.target).entries())); }, 'Datos guardados.');
  });

  $('#btn-exportar').addEventListener('click', function () {
    var blob = new Blob([store.exportar()], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'respaldo-la-negrada-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('#input-importar').addEventListener('change', function (e) {
    var archivo = e.target.files[0];
    if (!archivo) return;
    if (!confirm('Restaurar reemplaza TODOS los datos actuales por los del respaldo. ¿Continuar?')) { e.target.value = ''; return; }
    archivo.text().then(function (texto) {
      intentar(function () { store.importar(texto); return true; }, 'Respaldo restaurado.');
      e.target.value = '';
    });
  });

  $('#btn-demo').addEventListener('click', function () {
    var nuevos = intentar(cargarCarta);
    if (nuevos === null) return;
    aviso(nuevos ? nuevos + ' productos de la carta agregados.' : 'La carta ya estaba completa.');
  });

  $('#btn-borrar').addEventListener('click', function () {
    if (!confirm('Se van a borrar TODOS los productos, facturas y movimientos. ¿Seguro?')) return;
    if (!confirm('Última confirmación: esto no se puede deshacer. ¿Borrar todo?')) return;
    carrito = [];
    intentar(function () { store.borrarTodo(); return true; }, 'Datos borrados.');
  });

  // ---------- Render general ----------
  function renderTodo() {
    renderConfig();
    renderInicio();
    renderVender();
    renderProductos();
    renderStock();
    renderFacturas();
  }

  store.suscribir(renderTodo);
  // Si la app está abierta en otra pestaña, mantener los datos sincronizados.
  window.addEventListener('storage', function (e) {
    if (e.key === window.STORE_KEY) store.recargar();
  });

  renderTodo();
  mostrarVista();
})();
