/* Interfaz de la app. Toda la lógica de datos está en store.js. */
(function () {
  'use strict';

  var primeraVez = window.localStorage.getItem(window.STORE_KEY) === null;
  var store = window.crearStore(window.localStorage);
  var carrito = []; // [{ productoId, cantidad }]
  var categoriaPOS = ''; // '' = todas
  var medioPago = 'Efectivo';

  // Carta del bar. Arranca sin precio ni stock: se cargan desde Productos y Stock.
  var CARTA = [
    { nombre: 'Choripán', categoria: 'Comidas', unidad: 'unidad' },
    { nombre: 'Guiso de lentejas', categoria: 'Comidas', unidad: 'porción' },
    { nombre: 'Humita', categoria: 'Comidas', unidad: 'porción' },
    { nombre: 'Empanada', categoria: 'Comidas', unidad: 'unidad' },
    { nombre: 'Pastelito', categoria: 'Comidas', unidad: 'unidad' },
    { nombre: 'Arroz con leche', categoria: 'Postres', unidad: 'porción' },
    { nombre: 'Vino', categoria: 'Bebidas', unidad: 'botella' },
    { nombre: 'Cerveza', categoria: 'Bebidas', unidad: 'vaso' },
    { nombre: 'Fernet', categoria: 'Bebidas', unidad: 'vaso' },
    { nombre: 'Gancia', categoria: 'Bebidas', unidad: 'vaso' },
    { nombre: 'Gaseosa', categoria: 'Bebidas', unidad: 'vaso' },
    { nombre: 'Agua', categoria: 'Bebidas', unidad: 'vaso' },
    { nombre: 'Limonada', categoria: 'Bebidas', unidad: 'vaso' }
  ];

  // Agrega los productos de la carta que no estén cargados. Devuelve cuántos agregó.
  function cargarCarta() {
    var existentes = store.productos().map(function (p) { return p.nombre.toLowerCase(); });
    var nuevos = 0;
    CARTA.forEach(function (item) {
      if (existentes.indexOf(item.nombre.toLowerCase()) !== -1) return;
      store.crearProducto({ nombre: item.nombre, categoria: item.categoria, unidad: item.unidad, precio: 0, stock: 0, stockMinimo: 0 });
      nuevos++;
    });
    return nuevos;
  }

  // Productos de la carta creados antes de que existieran las unidades: asignarles la suya.
  function completarUnidades() {
    store.productos().forEach(function (p) {
      if (p.unidad) return;
      var item = CARTA.find(function (c) { return c.nombre.toLowerCase() === p.nombre.toLowerCase(); });
      store.editarProducto(p.id, Object.assign({}, p, { unidad: item ? item.unidad : 'unidad' }));
    });
  }

  if (primeraVez) cargarCarta();
  completarUnidades();

  var PLURALES = { unidad: '', 'porción': 'porciones', vaso: 'vasos', botella: 'botellas' };
  // "3 vasos", "1 botella", "5" (para unidades sueltas no hace falta aclarar)
  function cantidadCon(n, unidad) {
    if (!unidad || unidad === 'unidad') return String(n);
    return n + ' ' + (n === 1 ? unidad : PLURALES[unidad]);
  }
  function etiquetaUnidad(unidad) {
    return unidad === 'vaso' ? 'por vaso' : (unidad === 'botella' ? 'por botella' : (unidad === 'porción' ? 'por porción' : ''));
  }

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

  function vacio(texto) { return '<p class="vacio">' + esc(texto) + '</p>'; }

  // ---------- Modal ----------
  var modal = $('#modal');
  function abrirModal(html, ancho) {
    modal.classList.toggle('modal-ancho', !!ancho);
    $('#modal-contenido').innerHTML = html;
    modal.showModal();
  }
  function cerrarModal() { modal.close(); }
  modal.addEventListener('click', function (e) {
    if (e.target === modal || e.target.closest('[data-cerrar]')) cerrarModal();
  });

  // ---------- Navegación ----------
  var vistas = ['inicio', 'vender', 'penas', 'reservas', 'productos', 'stock', 'facturas', 'config'];
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
    var delMes = emitidas.filter(function (f) {
      var d = jornada(new Date(f.fecha));
      return d.getFullYear() === hoy.getFullYear() && d.getMonth() === hoy.getMonth();
    });
    var suma = function (lista) { return lista.reduce(function (s, f) { return s + f.total; }, 0); };
    var productos = store.productos();
    var valorStock = productos.reduce(function (s, p) { return s + p.stock * (p.costo || p.precio); }, 0);
    var bajos = store.productosBajoStock();
    var pena = store.eventoAbierto();

    // Si hay peña abierta, todo se muestra de la peña; si no, de la noche (6 am a 6 am)
    var rango = rangoJornada(aFechaInput(hoy));
    var r = pena ? store.resumenEvento(pena.id) : store.resumen(rango.desde, rango.hasta);

    $('#res-titulo-hoy').textContent = pena ? 'Peña en curso' : 'Ventas de la noche';
    $('#res-ventas-hoy').textContent = plata(r.total);
    $('#res-cant-hoy').textContent = pena ? pena.nombre : r.cantidadVentas + (r.cantidadVentas === 1 ? ' venta' : ' ventas');
    $('#res-ventas-mes').textContent = plata(suma(delMes));
    $('#res-cant-mes').textContent = delMes.length + (delMes.length === 1 ? ' venta' : ' ventas');
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
        '<button type="button" class="btn btn-primario" data-carga-rapida>Cargar precios</button></div>'
      : '';

    // Botón de la cabecera: abrir o cerrar peña
    var botonPena = pena
      ? '<button type="button" class="btn" data-cerrar-pena>Cerrar peña</button>'
      : '<button type="button" class="btn" data-abrir-pena>Abrir peña</button>';
    $('#accion-pena').innerHTML = botonPena;
    $('#accion-pena-2').innerHTML = pena
      ? '<button type="button" class="btn btn-primario" data-cerrar-pena>Cerrar ' + esc(pena.nombre) + '</button>'
      : '<button type="button" class="btn btn-primario" data-abrir-pena>Abrir peña</button>';

    // Caja: efectivo y transferencia siempre visibles
    $('#caja-titulo').textContent = pena ? 'Caja · ' + pena.nombre : 'Caja de la noche';
    $('#caja-ayuda').textContent = pena
      ? 'Se actualiza con cada venta. Al terminar, tocá "Cerrar peña" y queda guardada.'
      : 'No hay ninguna peña abierta. Abrí una para que las ventas queden guardadas y se puedan comparar.';
    var porPago = Object.assign({ Efectivo: 0, Transferencia: 0 }, r.porPago);
    $('#caja-noche').innerHTML = '<ul class="lista">' + Object.keys(porPago).map(function (m) {
        return '<li><span>' + esc(m) + '</span><strong>' + plata(porPago[m]) + '</strong></li>';
      }).join('') + '<li class="fila-total"><span>Total</span><strong>' + plata(r.total) + '</strong></li></ul>';
    var fechaCaja = pena ? pena.fecha : aFechaInput(hoy);
    var entradas = store.resumenReservas(fechaCaja);
    if (entradas.cantidad) {
      $('#caja-noche').innerHTML += '<p class="caja-entradas">Entradas: <strong>' + plata(entradas.cobrado) + '</strong> cobrado' +
        (entradas.pendiente ? ' · <span class="texto-naranja">' + plata(entradas.pendiente) + ' a cobrar en efectivo</span>' : '') +
        ' · ' + entradas.personas + (entradas.personas === 1 ? ' persona' : ' personas') + '</p>';
    }
    $('#caja-acciones').innerHTML = pena
      ? '<button type="button" class="btn" data-ver-pena="' + pena.id + '">Ver detalle</button>' +
        '<button type="button" class="btn btn-primario" data-cerrar-pena>Cerrar peña</button>'
      : '<button type="button" class="btn btn-primario" data-abrir-pena>Abrir peña</button>';

    // Lo más vendido
    $('#mas-vendido-titulo').textContent = pena ? 'Lo que más salió en la peña' : 'Lo que más salió esta noche';
    var ranking = Object.keys(r.productos).sort(function (a, b) { return r.productos[b].cantidad - r.productos[a].cantidad; }).slice(0, 8);
    $('#mas-vendido').innerHTML = ranking.length
      ? '<ul class="lista">' + ranking.map(function (n) {
          return '<li><span><strong>' + cantidadCon(r.productos[n].cantidad, r.productos[n].unidad) + '</strong> · ' + esc(n) + '</span>' +
            '<span class="tenue">' + plata(r.productos[n].monto) + '</span></li>';
        }).join('') + '</ul>'
      : vacio('Sin ventas todavía.');

    $('#lista-bajo-stock').innerHTML = bajos.length
      ? '<ul class="lista">' + bajos.map(function (p) {
          return '<li><span>' + esc(p.nombre) + '</span><span class="etiqueta ' + (p.stock === 0 ? 'roja' : 'amarilla') + '">' +
            (p.stock === 0 ? 'Sin stock' : 'Quedan ' + cantidadCon(p.stock, p.unidad)) + '</span></li>';
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
    var pena = store.eventoAbierto();
    $('#pos-pena').innerHTML = pena
      ? '<div class="pena-activa">Vendiendo en <strong>' + esc(pena.nombre) + '</strong></div>'
      : '<div class="banner"><div><strong>No hay ninguna peña abierta</strong>' +
        '<p>Las ventas se cobran igual, pero no van a quedar guardadas en ninguna peña para comparar.</p></div>' +
        '<button type="button" class="btn btn-primario" data-abrir-pena>Abrir peña</button></div>';
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
          var estado = sinPrecio ? 'Sin precio' : (disponible <= 0 ? 'Sin stock' : 'Quedan ' + cantidadCon(disponible, p.unidad));
          return '<button type="button" class="pos-item" data-agregar="' + p.id + '"' + (bloqueado ? ' disabled' : '') + '>' +
            '<span class="pos-item-nombre">' + esc(p.nombre) + '</span>' +
            (etiquetaUnidad(p.unidad) ? '<span class="pos-item-unidad">' + etiquetaUnidad(p.unidad) + '</span>' : '') +
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
          var porUnidad = p.unidad && p.unidad !== 'unidad' ? ' el ' + p.unidad : ' c/u';
          if (p.unidad === 'porción') porUnidad = ' la porción';
          if (p.unidad === 'botella') porUnidad = ' la botella';
          return '<li><div class="carrito-nombre">' + esc(p.nombre) + '<span class="tenue">' + plata(p.precio) + porUnidad + '</span></div>' +
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
    document.querySelectorAll('[data-pago]').forEach(function (b) {
      var activo = b.dataset.pago === medioPago;
      b.classList.toggle('activo', activo);
      b.setAttribute('aria-pressed', activo);
    });
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
    if (b.dataset.pago) { medioPago = b.dataset.pago; renderVender(); return; }
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
        medioPago: medioPago,
        descuento: $('#pos-descuento').value
      });
    });
    if (!factura) return;
    carrito = [];
    $('#pos-cliente').value = '';
    $('#pos-documento').value = '';
    $('#pos-descuento').value = '0';
    $('#pos-datos-cliente').open = false;
    medioPago = 'Efectivo';
    renderVender();
    aviso('Venta ' + store.numeroFormateado(factura) + ' cobrada en ' + factura.medioPago.toLowerCase() + '. Stock actualizado.');
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
            '<td class="num"><span class="etiqueta ' + clase + '">' + cantidadCon(p.stock, p.unidad) + '</span></td>' +
            '<td class="acciones"><button class="btn btn-chico" data-editar="' + p.id + '">Editar</button>' +
            '<button class="btn btn-chico" data-mover="' + p.id + '">Stock</button></td></tr>';
        }).join('')
      : '<tr><td colspan="6">' + vacio(store.productos().length ? 'No hay coincidencias.' : 'Todavía no cargaste productos.') + '</td></tr>';
  }

  function formularioProducto(p) {
    var nuevo = !p;
    p = p || { codigo: '', nombre: '', categoria: '', precio: '', costo: '', stockMinimo: 0, unidad: 'unidad', rinde: '' };
    var opcionesUnidad = ['unidad', 'porción', 'vaso', 'botella'].map(function (u) {
      return '<option value="' + u + '"' + ((p.unidad || 'unidad') === u ? ' selected' : '') + '>' + u.charAt(0).toUpperCase() + u.slice(1) + '</option>';
    }).join('');
    var categorias = Array.from(new Set(store.productos().map(function (x) { return x.categoria; }).filter(Boolean)));
    abrirModal(
      '<form id="form-producto" class="form">' +
      '<h2>' + (nuevo ? 'Nuevo producto' : 'Editar producto') + '</h2>' +
      '<div class="grilla-form">' +
      '<label>Nombre *<input class="input" name="nombre" required value="' + esc(p.nombre) + '"></label>' +
      '<label>Código<input class="input" name="codigo" value="' + esc(p.codigo) + '" placeholder="SKU o código de barras"></label>' +
      '<label>Categoría<input class="input" name="categoria" list="lista-categorias" value="' + esc(p.categoria) + '"></label>' +
      '<datalist id="lista-categorias">' + categorias.map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>' +
      '<label>Se vende por<select class="input" name="unidad">' + opcionesUnidad + '</select></label>' +
      '<label class="campo-rinde">Vasos por botella<input class="input" name="rinde" type="number" min="0" step="1" value="' + esc(p.rinde || '') + '" placeholder="Ej: 8"></label>' +
      '<label>Precio de venta *<input class="input" name="precio" type="number" min="0" step="0.01" required value="' + esc(p.precio) + '"></label>' +
      '<label>Costo<input class="input" name="costo" type="number" min="0" step="0.01" value="' + esc(p.costo) + '"></label>' +
      '<label>Stock mínimo<input class="input" name="stockMinimo" type="number" min="0" step="1" value="' + esc(p.stockMinimo) + '"></label>' +
      (nuevo ? '<label>Stock inicial<input class="input" name="stock" type="number" min="0" step="1" value="0"></label>' : '') +
      '</div>' +
      (nuevo ? '' : '<p class="ayuda">Stock actual: <strong>' + cantidadCon(p.stock, p.unidad) + '</strong>. Para cambiarlo usá Cargar precios y stock o la sección Stock.</p>') +
      '<div class="acciones-modal">' +
      (nuevo ? '' : '<button type="button" class="btn btn-peligro" id="btn-eliminar-producto">Eliminar</button>') +
      '<span class="espacio"></span>' +
      '<button type="button" class="btn" data-cerrar>Cancelar</button>' +
      '<button type="submit" class="btn btn-primario">Guardar</button></div></form>'
    );

    var formProd = $('#form-producto');
    var mostrarRinde = function () {
      formProd.querySelector('.campo-rinde').hidden = formProd.elements.unidad.value !== 'vaso';
    };
    formProd.elements.unidad.addEventListener('change', mostrarRinde);
    mostrarRinde();

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

  // Carga rápida: todos los productos en una lista para poner precio y stock de corrido.
  function cargaRapida() {
    var ordenCat = categorias();
    var lista = store.productos().slice().sort(function (a, b) {
      return (ordenCat.indexOf(a.categoria) - ordenCat.indexOf(b.categoria)) || a.nombre.localeCompare(b.nombre);
    });
    if (!lista.length) { aviso('Primero cargá productos.', 'error'); return; }
    var categoriaAnterior = null;
    var filas = lista.map(function (p) {
      var titulo = '';
      if (p.categoria !== categoriaAnterior) {
        categoriaAnterior = p.categoria;
        titulo = '<tr class="fila-categoria"><td colspan="5">' + esc(p.categoria || 'Sin categoría') + '</td></tr>';
      }
      var porVaso = p.unidad === 'vaso';
      return titulo + '<tr data-id="' + p.id + '"' + (porVaso ? ' data-vaso' : '') + '>' +
        '<td>' + esc(p.nombre) + (etiquetaUnidad(p.unidad) ? '<span class="sub-unidad">' + etiquetaUnidad(p.unidad) + '</span>' : '') + '</td>' +
        '<td><input class="input input-tabla" name="precio" type="number" min="0" step="0.01" inputmode="decimal"' +
        ' value="' + (p.precio > 0 ? p.precio : '') + '" placeholder="$" aria-label="Precio de ' + esc(p.nombre) + '"></td>' +
        '<td>' + (porVaso
          ? '<input class="input input-tabla" name="rinde" type="number" min="0" step="1" inputmode="numeric" value="' + (p.rinde > 0 ? p.rinde : '') +
            '" placeholder="ej: 8" aria-label="Vasos por botella de ' + esc(p.nombre) + '">'
          : '<span class="tenue">—</span>') + '</td>' +
        '<td class="num tenue sin-corte">' + cantidadCon(p.stock, p.unidad) + '</td>' +
        '<td><input class="input input-tabla" name="entra" type="number" min="0" step="1" inputmode="numeric"' +
        ' placeholder="' + (porVaso ? (p.rinde > 0 ? 'botellas' : 'vasos') : (p.unidad === 'botella' ? 'botellas' : '0')) + '"' +
        ' aria-label="Cuánto entra de ' + esc(p.nombre) + '"></td></tr>';
    }).join('');

    abrirModal(
      '<form id="form-carga-rapida" class="form">' +
      '<h2>Cargar precios y stock</h2>' +
      '<p class="ayuda">Escribí el precio de cada producto y cuánto stock entra. Lo que dejes vacío no se cambia. ' +
      'Con Enter pasás al siguiente casillero.</p>' +
      '<p class="ayuda"><strong>Bebidas por vaso:</strong> poné cuántos vasos salen de una botella (o de una jarra, en la limonada) ' +
      'y cargá el stock en botellas: la app lo pasa sola a vasos.</p>' +
      '<div class="tabla-scroll alto-fijo"><table class="tabla tabla-carga">' +
      '<thead><tr><th>Producto</th><th>Precio</th><th>Vasos x bot.</th><th class="num">Hay</th><th>Entra</th></tr></thead>' +
      '<tbody>' + filas + '</tbody></table></div>' +
      '<div class="acciones-modal">' +
      '<button type="button" class="btn btn-peligro" data-reiniciar-precios>Poner precios en 0</button>' +
      '<span class="espacio"></span>' +
      '<button type="button" class="btn" data-cerrar>Cancelar</button>' +
      '<button type="submit" class="btn btn-primario">Guardar todo</button></div></form>',
      true
    );

    var form = $('#form-carga-rapida');
    var inputs = Array.from(form.querySelectorAll('input'));
    inputs.forEach(function (input, i) {
      input.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        if (inputs[i + 1]) inputs[i + 1].focus(); else form.querySelector('[type=submit]').focus();
      });
    });
    inputs[0].focus();

    // En bebidas por vaso: si hay rinde, lo que entra se carga en botellas; si no, en vasos.
    form.querySelectorAll('[name=rinde]').forEach(function (input) {
      input.addEventListener('input', function () {
        var entra = input.closest('tr').querySelector('[name=entra]');
        entra.placeholder = parseInt(input.value, 10) > 0 ? 'botellas' : 'vasos';
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var datos = Array.from(form.querySelectorAll('tr[data-id]')).map(function (tr) {
        var entra = tr.querySelector('[name=entra]').value.trim();
        var rindeInput = tr.querySelector('[name=rinde]');
        var rinde = rindeInput ? rindeInput.value.trim() : '';
        var enBotellas = tr.hasAttribute('data-vaso') && parseInt(rinde, 10) > 0;
        return {
          productoId: tr.dataset.id,
          precio: tr.querySelector('[name=precio]').value.trim(),
          rinde: rinde,
          envases: enBotellas ? entra : '',
          ingreso: enBotellas ? '' : entra
        };
      });
      var cambios = intentar(function () { return store.cargaRapida(datos); });
      if (cambios === null) return;
      cerrarModal();
      aviso(cambios ? 'Listo: ' + cambios + (cambios === 1 ? ' cambio guardado.' : ' cambios guardados.') : 'No había nada para cambiar.');
    });
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-carga-rapida]')) cargaRapida();
  });
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
    $('#stock-actual').textContent = p
      ? 'Stock actual de ' + p.nombre + ': ' + cantidadCon(p.stock, p.unidad) +
        (p.unidad === 'vaso' ? '. Acá la cantidad va en vasos (en botellas, usá Cargar precios y stock).' : '')
      : '';
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
        return '<tr><td>' + cantidadCon(i.cantidad, i.unidad) + '</td><td>' + esc(i.nombre) + '</td><td class="num">' + plata(i.precioUnitario) + '</td><td class="num">' + plata(i.subtotal) + '</td></tr>';
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

  // ---------- Peñas ----------
  function aFechaInput(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  // 'AAAA-MM-DD' -> Date local (sin corrimiento por zona horaria)
  function deFechaInput(texto) { return new Date(texto + 'T00:00:00'); }
  function fechaLarga(texto) {
    return deFechaInput(texto).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  function fechaCorta(texto) {
    return deFechaInput(texto).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function nombreSugerido(texto) {
    var d = deFechaInput(texto);
    return 'Peña del ' + d.toLocaleDateString('es-AR', { weekday: 'long' }) + ' ' + d.getDate();
  }
  // La noche de una fecha va de las 6 am de ese día a las 6 am del siguiente
  function rangoJornada(texto) {
    var desde = deFechaInput(texto);
    desde.setHours(HORA_CORTE);
    var hasta = new Date(desde.getTime());
    hasta.setDate(hasta.getDate() + 1);
    return { desde: desde, hasta: hasta };
  }

  // Diferencia contra la peña anterior: "+$ 12.000 (+15%)"
  function comparacion(actual, anterior) {
    if (anterior === null) return '<span class="tenue">Primera peña</span>';
    var dif = actual - anterior;
    var pct = anterior > 0 ? Math.round(dif / anterior * 100) : null;
    var clase = dif > 0 ? 'sube' : (dif < 0 ? 'baja' : 'igual');
    var signo = dif > 0 ? '+' : (dif < 0 ? '−' : '');
    return '<span class="comparacion ' + clase + '">' + (dif > 0 ? '▲ ' : dif < 0 ? '▼ ' : '= ') + signo + plata(Math.abs(dif)) +
      (pct !== null && dif !== 0 ? ' (' + signo + Math.abs(pct) + '%)' : '') + '</span>';
  }

  function htmlPena(e) {
    var r = store.resumenEvento(e.id);
    var ant = store.eventoAnterior(e.id);
    var ra = ant ? store.resumenEvento(ant.id) : null;
    var otros = Object.keys(r.porPago).filter(function (m) { return m !== 'Efectivo' && m !== 'Transferencia'; });
    var nombres = Object.keys(r.productos);
    if (ra) Object.keys(ra.productos).forEach(function (n) { if (nombres.indexOf(n) === -1) nombres.push(n); });
    nombres.sort(function (a, b) { return ((r.productos[b] || {}).cantidad || 0) - ((r.productos[a] || {}).cantidad || 0); });

    return '<div class="cierre">' +
      '<div class="comp-cabecera"><div class="comp-negocio"><img class="comp-logo" src="img/logo.jpg" alt="">' +
      '<div><h2>' + esc(e.nombre) + '</h2><p>' + esc(fechaLarga(e.fecha)) + '</p>' +
      '<p class="tenue">' + (e.abierto ? 'En curso' : 'Cerrada') + '</p></div></div>' +
      '<div class="comp-numero"><p>' + r.cantidadVentas + (r.cantidadVentas === 1 ? ' venta' : ' ventas') + '</p>' +
      (r.anuladas ? '<p class="tenue">' + r.anuladas + (r.anuladas === 1 ? ' anulada' : ' anuladas') + ' (no suman)</p>' : '') + '</div></div>' +
      '<div class="cierre-cajas">' +
      '<div class="cierre-caja"><span>Efectivo</span><strong>' + plata(r.porPago.Efectivo || 0) + '</strong></div>' +
      '<div class="cierre-caja"><span>Transferencia</span><strong>' + plata(r.porPago.Transferencia || 0) + '</strong></div>' +
      otros.map(function (m) { return '<div class="cierre-caja"><span>' + esc(m) + '</span><strong>' + plata(r.porPago[m]) + '</strong></div>'; }).join('') +
      '<div class="cierre-caja total"><span>Total del bar</span><strong>' + plata(r.total) + '</strong></div></div>' +
      (ant
        ? '<div class="cierre-comparacion"><span>Contra <strong>' + esc(ant.nombre) + '</strong> (' + plata(ra.total) + '):</span> ' +
          comparacion(r.total, ra.total) + '</div>'
        : '<p class="ayuda">Es la primera peña registrada: la próxima se va a comparar con esta.</p>') +
      htmlEntradasPena(e, r) +
      '<h3>Lo que se vendió</h3>' +
      (nombres.length
        ? '<table class="tabla comp-tabla"><thead><tr><th>Producto</th><th class="num">Cantidad</th><th class="num">Monto</th>' +
          (ant ? '<th class="num">Peña anterior</th>' : '') + '</tr></thead><tbody>' +
          nombres.map(function (n) {
            var x = r.productos[n] || { cantidad: 0, monto: 0, unidad: (ra.productos[n] || {}).unidad };
            var y = ra && ra.productos[n];
            return '<tr><td>' + esc(n) + '</td><td class="num">' + cantidadCon(x.cantidad, x.unidad) + '</td><td class="num">' + plata(x.monto) + '</td>' +
              (ant ? '<td class="num tenue">' + (y ? cantidadCon(y.cantidad, y.unidad) : '—') + '</td>' : '') + '</tr>';
          }).join('') + '</tbody></table>'
        : vacio('Todavía no hay ventas en esta peña.')) +
      htmlStockAlCerrar(e, ant) +
      '</div>';
  }

  function htmlEntradasPena(e, r) {
    var en = store.resumenReservas(e.fecha);
    if (!en.cantidad) return '';
    return '<h3>Entradas (' + en.cantidad + (en.cantidad === 1 ? ' reserva, ' : ' reservas, ') + en.personas + ' personas)</h3>' +
      '<div class="cierre-cajas">' +
      '<div class="cierre-caja"><span>Transferencia</span><strong>' + plata(en.porPago.Transferencia || 0) + '</strong></div>' +
      '<div class="cierre-caja"><span>Efectivo</span><strong>' + plata(en.porPago.Efectivo || 0) + '</strong></div>' +
      (en.pendiente ? '<div class="cierre-caja naranja"><span>Falta cobrar</span><strong>' + plata(en.pendiente) + '</strong></div>' : '') +
      '</div>' +
      '<div class="cierre-comparacion">Total de la peña (bar + entradas cobradas): <strong>' + plata(r.total + en.cobrado) + '</strong></div>';
  }

  // Stock que quedó al cerrar, al lado del que quedó en la peña anterior
  function htmlStockAlCerrar(e, ant) {
    if (!e.stockAlCerrar) return '';
    var previo = {};
    if (ant && ant.stockAlCerrar) ant.stockAlCerrar.forEach(function (x) { previo[x.nombre] = x; });
    var filas = e.stockAlCerrar.filter(function (x) { return x.stock > 0 || previo[x.nombre]; });
    if (!filas.length) return '';
    var hayPrevio = ant && ant.stockAlCerrar;
    return '<h3>Stock que quedó al cerrar</h3>' +
      '<table class="tabla comp-tabla"><thead><tr><th>Producto</th><th class="num">Quedó</th>' +
      (hayPrevio ? '<th class="num">Peña anterior</th>' : '') + '</tr></thead><tbody>' +
      filas.map(function (x) {
        var y = previo[x.nombre];
        return '<tr><td>' + esc(x.nombre) + '</td><td class="num">' + cantidadCon(x.stock, x.unidad) + '</td>' +
          (hayPrevio ? '<td class="num tenue">' + (y ? cantidadCon(y.stock, y.unidad) : '—') + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table>';
  }

  function verPena(id) {
    var e = store.eventos().find(function (x) { return x.id === id; });
    if (!e) return;
    var hayOtraAbierta = store.eventoAbierto() && store.eventoAbierto().id !== e.id;
    abrirModal(
      htmlPena(e) +
      '<div class="acciones-modal">' +
      '<button type="button" class="btn" id="btn-editar-pena">Cambiar nombre o fecha</button>' +
      '<button type="button" class="btn btn-peligro" id="btn-eliminar-pena">Eliminar</button>' +
      (!e.abierto && !hayOtraAbierta ? '<button type="button" class="btn" id="btn-reabrir-pena">Reabrir</button>' : '') +
      '<span class="espacio"></span>' +
      '<button type="button" class="btn" data-cerrar>Cerrar</button>' +
      '<button type="button" class="btn btn-primario" id="btn-imprimir-pena">Imprimir</button></div>',
      true
    );
    $('#btn-imprimir-pena').addEventListener('click', function () {
      $('#impresion').innerHTML = htmlPena(e);
      window.print();
    });
    $('#btn-editar-pena').addEventListener('click', function () { formularioPena(e); });
    $('#btn-eliminar-pena').addEventListener('click', function () {
      var r = store.resumenEvento(e.id);
      if (!confirm('¿Eliminar "' + e.nombre + '"?\n\nSe borran sus ' + (r.cantidadVentas + r.anuladas) + ' ventas (' + plata(r.total) +
        ') y lo vendido vuelve al stock. Las reservas no se tocan.\n\nNo se puede deshacer.')) return;
      if (intentar(function () { return store.eliminarEvento(e.id); }, 'Peña eliminada.') !== null) cerrarModal();
    });
    var reabrir = $('#btn-reabrir-pena');
    if (reabrir) {
      reabrir.addEventListener('click', function () {
        if (!confirm('¿Reabrir "' + e.nombre + '"? Las ventas nuevas se van a sumar a esta peña.')) return;
        if (intentar(function () { return store.reabrirEvento(e.id); }, 'Peña reabierta.')) verPena(e.id);
      });
    }
  }

  // Abrir una peña nueva (e = null) o cambiar nombre y fecha de una existente
  function formularioPena(e) {
    var nueva = !e;
    var fecha = e ? e.fecha : aFechaInput(jornada(new Date()));
    var nombre = e ? e.nombre : nombreSugerido(fecha);
    abrirModal(
      '<form id="form-pena" class="form">' +
      '<h2>' + (nueva ? 'Abrir peña' : 'Cambiar nombre o fecha') + '</h2>' +
      (nueva ? '<p class="ayuda">Todo lo que se venda desde ahora queda guardado en esta peña hasta que la cierres.</p>' : '') +
      '<label>Fecha<input class="input" type="date" name="fecha" required value="' + fecha + '"></label>' +
      '<label>Nombre<input class="input" name="nombre" required value="' + esc(nombre) + '"></label>' +
      '<div class="acciones-modal"><span class="espacio"></span>' +
      '<button type="button" class="btn" data-cerrar>Cancelar</button>' +
      '<button type="submit" class="btn btn-primario">' + (nueva ? 'Abrir peña' : 'Guardar') + '</button></div></form>'
    );
    var form = $('#form-pena');
    var nombreTocado = !nueva;
    form.elements.nombre.addEventListener('input', function () { nombreTocado = true; });
    form.elements.fecha.addEventListener('change', function () {
      if (!nombreTocado && form.elements.fecha.value) form.elements.nombre.value = nombreSugerido(form.elements.fecha.value);
    });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var datos = { nombre: form.elements.nombre.value, fecha: form.elements.fecha.value };
      var r = intentar(function () {
        return nueva ? store.abrirEvento(datos) : store.editarEvento(e.id, datos);
      }, nueva ? 'Peña abierta. ¡Buena noche!' : 'Peña actualizada.');
      if (!r) return;
      if (nueva) cerrarModal(); else verPena(e.id);
    });
  }

  function cerrarPena() {
    var pena = store.eventoAbierto();
    if (!pena) return;
    var r = store.resumenEvento(pena.id);
    if (!confirm('¿Cerrar "' + pena.nombre + '"?\n\nEfectivo: ' + plata(r.porPago.Efectivo || 0) +
      '\nTransferencia: ' + plata(r.porPago.Transferencia || 0) + '\nTotal: ' + plata(r.total))) return;
    if (intentar(function () { return store.cerrarEvento(pena.id); }, 'Peña cerrada y guardada.')) verPena(pena.id);
  }

  function renderPenas() {
    var lista = store.eventosOrdenados().reverse();
    $('#tabla-penas').innerHTML = lista.length
      ? lista.map(function (e) {
          var r = store.resumenEvento(e.id);
          var ant = store.eventoAnterior(e.id);
          return '<tr><td><strong>' + esc(e.nombre) + '</strong>' + (e.abierto ? ' <span class="etiqueta verde">En curso</span>' : '') + '</td>' +
            '<td class="tenue sin-corte">' + esc(fechaCorta(e.fecha)) + '</td>' +
            '<td class="num">' + r.cantidadVentas + '</td>' +
            '<td class="num">' + plata(r.porPago.Efectivo || 0) + '</td>' +
            '<td class="num">' + plata(r.porPago.Transferencia || 0) + '</td>' +
            '<td class="num"><strong>' + plata(r.total) + '</strong></td>' +
            '<td class="num">' + (function () { var en = store.resumenReservas(e.fecha); return en.cantidad ? plata(en.cobrado) + '<span class="sub-unidad">' + en.personas + ' pers.</span>' : '<span class="tenue">—</span>'; })() + '</td>' +
            '<td class="sin-corte">' + comparacion(r.total, ant ? store.resumenEvento(ant.id).total : null) + '</td>' +
            '<td class="acciones"><button class="btn btn-chico" data-ver-pena="' + e.id + '">Ver</button></td></tr>';
        }).join('')
      : '<tr><td colspan="9">' + vacio('Todavía no hay peñas. Abrí la primera cuando arranque el evento.') + '</td></tr>';
  }

  // ---------- Reservas ----------
  var fechaReservas = null;

  function fechaReservasActual() {
    if (!fechaReservas) {
      var pena = store.eventoAbierto();
      fechaReservas = pena ? pena.fecha : aFechaInput(jornada(new Date()));
    }
    return fechaReservas;
  }

  function renderReservas() {
    var fecha = fechaReservasActual();
    if (document.activeElement !== $('#rv-fecha')) $('#rv-fecha').value = fecha;
    if (document.activeElement !== $('#rv-precio')) $('#rv-precio').value = store.config().precioEntrada || '';

    // Fechas desde hoy que tienen reservas, para saltar rápido
    var hoyTexto = aFechaInput(jornada(new Date()));
    var conteo = {};
    store.reservas().forEach(function (r) { if (r.fecha >= hoyTexto) conteo[r.fecha] = (conteo[r.fecha] || 0) + 1; });
    var fechas = Object.keys(conteo).sort();
    $('#rv-fechas').innerHTML = fechas.map(function (f) {
      return '<button type="button" class="chip' + (f === fecha ? ' activo' : '') + '" data-rv-fecha="' + f + '">' +
        esc(fechaCorta(f)) + ' · ' + conteo[f] + '</button>';
    }).join('');

    var r = store.resumenReservas(fecha);
    $('#rv-cant').textContent = r.cantidad;
    $('#rv-personas').textContent = r.personas + (r.personas === 1 ? ' persona' : ' personas');
    $('#rv-cobrado').textContent = plata(r.cobrado);
    $('#rv-cobrado-sub').textContent = 'Transf. ' + plata(r.porPago.Transferencia || 0) + ' · Efvo. ' + plata(r.porPago.Efectivo || 0);
    $('#rv-pendiente').textContent = plata(r.pendiente);
    $('#rv-total').textContent = plata(r.total);
    $('#rv-total-sub').textContent = fechaLarga(fecha);

    var lista = r.lista.slice().sort(function (a, b) {
      return (a.estado === b.estado ? 0 : a.estado === 'pendiente' ? -1 : 1) || a.nombre.localeCompare(b.nombre);
    });
    $('#rv-lista').innerHTML = lista.length
      ? '<ul class="reservas">' + lista.map(function (x) {
          var paga = x.estado === 'pagada';
          return '<li class="reserva ' + (paga ? 'verde' : 'naranja') + '">' +
            '<div class="reserva-datos"><strong>' + esc(x.nombre) + '</strong>' +
            '<span class="tenue">' + x.personas + (x.personas === 1 ? ' persona' : ' personas') +
            (x.telefono ? ' · ' + esc(x.telefono) : '') + (x.nota ? ' · ' + esc(x.nota) : '') + '</span></div>' +
            '<div class="reserva-monto"><strong>' + plata(x.monto) + '</strong>' +
            '<span class="estado-reserva">' + (paga ? 'Pagó · ' + esc(x.medioPago || '') : 'Paga en efectivo') + '</span></div>' +
            '<div class="reserva-acciones">' +
            (paga ? '' : '<button type="button" class="btn btn-chico btn-cobrar" data-rv-cobrar="' + x.id + '">Cobrar en efectivo</button>') +
            '<button type="button" class="btn btn-chico" data-rv-editar="' + x.id + '">Editar</button></div></li>';
        }).join('') + '</ul>'
      : vacio('No hay reservas para esta peña. Tocá "Nueva reserva" para agregar una.');
  }

  function formularioReserva(x) {
    var nueva = !x;
    var precio = store.config().precioEntrada || 0;
    x = x || { nombre: '', personas: 1, fecha: fechaReservasActual(), monto: precio || '', telefono: '', nota: '', estado: 'pendiente' };
    var pagada = x.estado === 'pagada';
    abrirModal(
      '<form id="form-reserva" class="form">' +
      '<h2>' + (nueva ? 'Nueva reserva' : 'Editar reserva') + '</h2>' +
      '<div class="grilla-form">' +
      '<label>Nombre *<input class="input" name="nombre" required value="' + esc(x.nombre) + '" placeholder="Ej: Mateo y familia"></label>' +
      '<label>Personas *<input class="input" name="personas" type="number" min="1" step="1" required value="' + esc(x.personas) + '"></label>' +
      '<label>Peña del<input class="input" name="fecha" type="date" required value="' + esc(x.fecha) + '"></label>' +
      '<label>Monto de las entradas<input class="input" name="monto" type="number" min="0" step="1" value="' + esc(x.monto) + '"></label>' +
      '<label>Teléfono<input class="input" name="telefono" value="' + esc(x.telefono) + '"></label>' +
      '<label>Nota<input class="input" name="nota" value="' + esc(x.nota) + '" placeholder="Ej: mesa cerca del escenario"></label>' +
      '</div>' +
      (precio ? '<p class="ayuda" id="rv-calculo"></p>' : '<p class="ayuda">Tip: cargá el precio de la entrada en Reservas y el monto se calcula solo.</p>') +
      '<p class="etiqueta-campo">¿Ya pagó?</p>' +
      '<div class="pago">' +
      '<button type="button" class="pago-btn opcion-verde' + (pagada ? ' activo' : '') + '" data-rv-pagada="1">Ya pagó (transferencia)</button>' +
      '<button type="button" class="pago-btn opcion-naranja' + (!pagada ? ' activo' : '') + '" data-rv-pagada="0">Paga en efectivo</button>' +
      '</div>' +
      '<div class="acciones-modal">' +
      (nueva ? '' : '<button type="button" class="btn btn-peligro" id="btn-eliminar-reserva">Eliminar</button>') +
      '<span class="espacio"></span>' +
      '<button type="button" class="btn" data-cerrar>Cancelar</button>' +
      '<button type="submit" class="btn btn-primario">Guardar</button></div></form>'
    );
    var form = $('#form-reserva');
    var montoTocado = !nueva;
    var calcular = function () {
      var n = parseInt(form.elements.personas.value, 10) || 0;
      if (precio && $('#rv-calculo')) $('#rv-calculo').textContent = n + ' × ' + plata(precio) + ' = ' + plata(n * precio);
      if (precio && !montoTocado) form.elements.monto.value = n * precio;
    };
    form.elements.monto.addEventListener('input', function () { montoTocado = true; });
    form.elements.personas.addEventListener('input', calcular);
    calcular();
    form.querySelectorAll('[data-rv-pagada]').forEach(function (b) {
      b.addEventListener('click', function () {
        pagada = b.dataset.rvPagada === '1';
        form.querySelectorAll('[data-rv-pagada]').forEach(function (o) { o.classList.toggle('activo', o === b); });
      });
    });
    form.elements.nombre.focus();
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var datos = Object.fromEntries(new FormData(form).entries());
      datos.pagada = pagada;
      var ok = intentar(function () {
        return nueva ? store.crearReserva(datos) : store.editarReserva(x.id, datos);
      }, nueva ? 'Reserva guardada.' : 'Reserva actualizada.');
      if (!ok) return;
      fechaReservas = datos.fecha;
      cerrarModal();
      renderReservas();
    });
    var eliminar = $('#btn-eliminar-reserva');
    if (eliminar) {
      eliminar.addEventListener('click', function () {
        if (!confirm('¿Eliminar la reserva de "' + x.nombre + '"?')) return;
        if (intentar(function () { store.eliminarReserva(x.id); return true; }, 'Reserva eliminada.')) cerrarModal();
      });
    }
  }

  $('#rv-fecha').addEventListener('change', function (e) {
    if (e.target.value) { fechaReservas = e.target.value; renderReservas(); }
  });
  $('#rv-precio').addEventListener('change', function (e) {
    intentar(function () { return store.guardarPrecioEntrada(e.target.value || 0); }, 'Precio de la entrada guardado.');
  });

  document.addEventListener('click', function (e) {
    var t = e.target;
    var b;
    if (t.closest('[data-nueva-reserva]')) formularioReserva(null);
    else if ((b = t.closest('[data-rv-editar]'))) formularioReserva(store.reservas().find(function (x) { return x.id === b.dataset.rvEditar; }));
    else if ((b = t.closest('[data-rv-fecha]'))) { fechaReservas = b.dataset.rvFecha; renderReservas(); }
    else if ((b = t.closest('[data-rv-cobrar]'))) {
      var x = store.reservas().find(function (r) { return r.id === b.dataset.rvCobrar; });
      if (x && confirm('¿Cobrar ' + plata(x.monto) + ' en efectivo a "' + x.nombre + '"?')) {
        intentar(function () { return store.cobrarReserva(x.id, 'Efectivo'); }, 'Cobrado. ' + x.nombre + ' quedó en verde.');
      }
    }
  });

  function volverACero() {
    var ventas = store.facturas().length, penas = store.eventos().length, reservas = store.reservas().length;
    if (!ventas && !penas && !reservas) { aviso('Ya está todo en cero.'); return; }
    if (!confirm('¿Volver a cero?\n\nSe borran:\n• ' + ventas + (ventas === 1 ? ' venta' : ' ventas') +
      '\n• ' + penas + (penas === 1 ? ' peña' : ' peñas') + '\n• ' + reservas + (reservas === 1 ? ' reserva' : ' reservas') +
      '\n\nSe mantienen los productos, los precios y el stock (lo vendido vuelve al stock).')) return;
    if (!confirm('Última confirmación: esto no se puede deshacer. ¿Volver a cero?')) return;
    carrito = [];
    var r = intentar(function () { return store.volverACero(); });
    if (r) aviso('Listo, todo en cero. Ya podés abrir la peña.');
  }

  function reiniciarPrecios() {
    if (!confirm('¿Poner TODOS los precios en 0?\n\nLos productos quedan sin precio y no se pueden vender hasta cargarlos de nuevo. El stock no cambia.')) return;
    var n = intentar(function () { return store.reiniciarPrecios(); });
    if (n === null) return;
    aviso(n ? 'Listo: ' + n + (n === 1 ? ' precio quedó' : ' precios quedaron') + ' en 0.' : 'Los precios ya estaban en 0.');
    cargaRapida();
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest('[data-abrir-pena]')) formularioPena(null);
    else if (t.closest('[data-cerrar-pena]')) cerrarPena();
    else if (t.closest('[data-ver-pena]')) verPena(t.closest('[data-ver-pena]').dataset.verPena);
    else if (t.closest('[data-reiniciar-precios]')) reiniciarPrecios();
    else if (t.closest('[data-volver-a-cero]')) volverACero();
  });

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
    renderPenas();
    renderReservas();
  }

  store.suscribir(renderTodo);
  // Si la app está abierta en otra pestaña, mantener los datos sincronizados.
  window.addEventListener('storage', function (e) {
    if (e.key === window.STORE_KEY) store.recargar();
  });

  // Botón para instalar la app (Chrome / Edge). Solo aparece si el navegador lo permite.
  var pedidoInstalar = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    pedidoInstalar = e;
    $('#btn-instalar').hidden = false;
  });
  $('#btn-instalar').addEventListener('click', function () {
    if (!pedidoInstalar) return;
    pedidoInstalar.prompt();
    pedidoInstalar.userChoice.then(function () {
      pedidoInstalar = null;
      $('#btn-instalar').hidden = true;
    });
  });
  window.addEventListener('appinstalled', function () {
    $('#btn-instalar').hidden = true;
    aviso('App instalada. Ya la podés abrir desde el escritorio.');
  });

  renderTodo();
  mostrarVista();
})();
