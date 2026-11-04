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
  function mismoDia(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
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
        '<button type="button" class="btn btn-primario" data-carga-rapida>Cargar precios</button></div>'
      : '';

    // Caja de la noche por medio de pago
    var porPago = { Efectivo: 0, Transferencia: 0 };
    deHoy.forEach(function (f) { porPago[f.medioPago] = (porPago[f.medioPago] || 0) + f.total; });
    $('#caja-noche').innerHTML = '<ul class="lista">' + Object.keys(porPago).map(function (m) {
        return '<li><span>' + esc(m) + '</span><strong>' + plata(porPago[m]) + '</strong></li>';
      }).join('') + '<li class="fila-total"><span>Total</span><strong>' + plata(suma(deHoy)) + '</strong></li></ul>';

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
      '<div class="acciones-modal"><span class="espacio"></span>' +
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

  // ---------- Cierre de la noche ----------
  function aFechaInput(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // fechaTexto: 'AAAA-MM-DD' del día en que empezó la noche. La noche va de las 6 am a las 6 am siguientes.
  function htmlCierre(fechaTexto) {
    var desde = new Date(fechaTexto + 'T00:00:00');
    desde.setHours(HORA_CORTE);
    var hasta = new Date(desde.getTime());
    hasta.setDate(hasta.getDate() + 1);
    var r = store.resumen(desde, hasta);
    var otros = Object.keys(r.porPago).filter(function (m) { return m !== 'Efectivo' && m !== 'Transferencia'; });
    var nombres = Object.keys(r.productos).sort(function (a, b) { return r.productos[b].cantidad - r.productos[a].cantidad; });
    var tituloFecha = desde.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    var conStock = store.productos().filter(function (p) { return p.precio > 0 || p.stock > 0; });

    return '<div class="cierre">' +
      '<div class="comp-cabecera"><div class="comp-negocio"><img class="comp-logo" src="img/logo.jpg" alt="">' +
      '<div><h2>Cierre de la noche</h2><p>' + esc(tituloFecha) + '</p></div></div>' +
      '<div class="comp-numero"><p>' + r.cantidadVentas + (r.cantidadVentas === 1 ? ' venta' : ' ventas') + '</p>' +
      (r.anuladas ? '<p class="tenue">' + r.anuladas + (r.anuladas === 1 ? ' anulada' : ' anuladas') + ' (no suman)</p>' : '') + '</div></div>' +
      '<div class="cierre-cajas">' +
      '<div class="cierre-caja"><span>Efectivo</span><strong>' + plata(r.porPago.Efectivo || 0) + '</strong></div>' +
      '<div class="cierre-caja"><span>Transferencia</span><strong>' + plata(r.porPago.Transferencia || 0) + '</strong></div>' +
      otros.map(function (m) { return '<div class="cierre-caja"><span>' + esc(m) + '</span><strong>' + plata(r.porPago[m]) + '</strong></div>'; }).join('') +
      '<div class="cierre-caja total"><span>Total</span><strong>' + plata(r.total) + '</strong></div></div>' +
      '<h3>Lo que se vendió</h3>' +
      (nombres.length
        ? '<table class="tabla comp-tabla"><thead><tr><th>Producto</th><th class="num">Cantidad</th><th class="num">Monto</th></tr></thead><tbody>' +
          nombres.map(function (n) {
            var x = r.productos[n];
            return '<tr><td>' + esc(n) + '</td><td class="num">' + cantidadCon(x.cantidad, x.unidad) + '</td><td class="num">' + plata(x.monto) + '</td></tr>';
          }).join('') + '</tbody></table>'
        : vacio('No hubo ventas esa noche.')) +
      '<h3>Stock que queda ahora</h3>' +
      (conStock.length
        ? '<table class="tabla comp-tabla"><tbody>' + conStock.map(function (p) {
            return '<tr><td>' + esc(p.nombre) + '</td><td class="num">' + cantidadCon(p.stock, p.unidad) +
              (p.unidad === 'vaso' && p.rinde > 0 ? ' <span class="tenue">(≈ ' + (Math.round(p.stock / p.rinde * 10) / 10) + ' bot.)</span>' : '') + '</td></tr>';
          }).join('') + '</tbody></table>'
        : vacio('Sin productos cargados.')) +
      '</div>';
  }

  function verCierre(fechaTexto) {
    fechaTexto = fechaTexto || aFechaInput(jornada(new Date()));
    abrirModal(
      '<label class="cierre-fecha">Noche del <input type="date" class="input" id="cierre-fecha" value="' + fechaTexto + '"></label>' +
      htmlCierre(fechaTexto) +
      '<div class="acciones-modal"><span class="espacio"></span>' +
      '<button type="button" class="btn" data-cerrar>Cerrar</button>' +
      '<button type="button" class="btn btn-primario" id="btn-imprimir-cierre">Imprimir</button></div>'
    );
    $('#cierre-fecha').addEventListener('change', function (e) { if (e.target.value) verCierre(e.target.value); });
    $('#btn-imprimir-cierre').addEventListener('click', function () {
      $('#impresion').innerHTML = htmlCierre(fechaTexto);
      window.print();
    });
  }

  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-ver-cierre]')) verCierre();
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
