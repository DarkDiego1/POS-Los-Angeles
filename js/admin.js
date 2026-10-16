const $ = s => document.querySelector(s);
const m = n => '$' + Number(n || 0).toFixed(2);
const e = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let DB = [
    { id: 1, code: '75010001', name: 'Leche Entera 1L', cost: 21.00, price: 27.50, stock: 15 },
    { id: 2, code: '75010002', name: 'Pan Blanco', cost: 28.00, price: 38.00, stock: 4 },
    { id: 3, code: '75010003', name: 'Refresco Cola 600ml', cost: 12.50, price: 18.00, stock: 24 },
    { id: 4, code: '75010004', name: 'Papas Fritas Sal', cost: 13.00, price: 17.50, stock: 2 }
];

let SALES_DATA = [
    {
    id: 101,
    total: 45.50,
    paid: 50.00,
    change: 4.50,
    method: 'efectivo',
    created_at: new Date().toISOString(),
    items: [
    { name: 'Leche Entera 1L', qty: 1, price: 27.50 },
    { name: 'Refresco Cola 600ml', qty: 1, price: 18.00 }
    ]
    }
];

const api = {
    async listProducts() {
    try {
        const r = await fetch('/api/products');
        if (r.ok) return await r.json();
    } catch (err) {}
    return DB;
    },
    async getMetrics() {
    try {
        const r = await fetch('/api/metrics');
        if (r.ok) return await r.json();
    } catch (err) {}
    const total = SALES_DATA.reduce((a, s) => a + s.total, 0);
    return { total, count: SALES_DATA.length, profit: total * 0.3 };
    },
    async listSales(d) {
    try {
        const r = await fetch('/api/sales/history' + (d ? '?date=' + d : ''));
        if (r.ok) return await r.json();
    } catch (err) {}
    return SALES_DATA;
    },
    async saveProduct(p) {
    try {
        const r = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p)
        });
        if (r.ok) return await r.json();
    } catch (err) {}
    if (p.id) {
        const i = DB.findIndex(x => x.id == p.id);
        if (i > -1) DB[i] = { ...DB[i], ...p };
    } else {
        p.id = Date.now();
        DB.push(p);
    }
    return p;
    },
    async deleteProduct(id) {
    try {
        await fetch('/api/products/' + id, { method: 'DELETE' });
    } catch (e) {}
    DB = DB.filter(x => x.id != id);
    }
};

let allProducts = [];
let allSales = [];

function tab(sec, evt) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    if (evt && evt.target) evt.target.classList.add('active');
    $('#sec-' + sec).classList.add('active');
    if (sec === 'hist') loadSalesHistory();
    if (sec === 'corte') loadCorte();
}

async function loadData() {
    allProducts = await api.listProducts();
    const mData = await api.getMetrics();

    $('#kpi-sales').textContent = m(mData.total);
    $('#kpi-tx').textContent = mData.count + ' ventas hoy';
    $('#kpi-profit').textContent = m(mData.profit);
    $('#kpi-ticket').textContent = m(mData.count > 0 ? mData.total / mData.count : 0);

    const lowCount = allProducts.filter(p => p.stock <= 5).length;
    $('#kpi-low').textContent = lowCount;

    filterInv();
    calcInventoryValuation();
}

function filterInv() {
    const q = $('#q-inv').value.toLowerCase();
    const onlyLow = $('#chk-low').checked;
    let list = allProducts.filter(p => p.name.toLowerCase().includes(q) || p.code.includes(q));
    if (onlyLow) list = list.filter(p => p.stock <= 5);
    renderInv(list);
}

$('#q-inv').addEventListener('input', filterInv);

function renderInv(list) {
    $('#tbl-inv').innerHTML = list.map(p => {
    const margin = p.price - p.cost;
    const marginPct = p.cost > 0 ? ((margin / p.cost) * 100).toFixed(0) : '100';
    const stockBadge = p.stock <= 2 ? 'b-bad' : (p.stock <= 5 ? 'b-warn' : 'b-ok');
    return `<tr>
        <td><b>${e(p.code)}</b></td>
        <td>${e(p.name)}</td>
        <td class="num">${m(p.cost)}</td>
        <td class="num">${m(p.price)}</td>
        <td class="num"><span class="mut">${m(margin)} (${marginPct}%)</span></td>
        <td class="num"><span class="badge ${stockBadge}">${p.stock} pzas</span></td>
        <td class="num">
            <button class="g" onclick="editProduct(${p.id})">Editar</button>
            <button class="r" onclick="deleteProduct(${p.id})">✕</button>
        </td>
        </tr>`;
    }).join('');
}

function calcInventoryValuation() {
    const costTotal = allProducts.reduce((a, p) => a + (p.cost * p.stock), 0);
    const priceTotal = allProducts.reduce((a, p) => a + (p.price * p.stock), 0);
    $('#val-cost').textContent = m(costTotal);
    $('#val-price').textContent = m(priceTotal);
    $('#val-margin').textContent = m(priceTotal - costTotal);
}

function openProductModal(p = null) {
    $('#m-prod-title').textContent = p ? 'Editar Producto' : 'Nuevo Producto';
    $('#p-id').value = p ? p.id : '';
    $('#p-code').value = p ? p.code : '';
    $('#p-name').value = p ? p.name : '';
    $('#p-cost').value = p ? p.cost : '';
    $('#p-price').value = p ? p.price : '';
    $('#p-stock').value = p ? p.stock : '';
    $('#m-prod').classList.add('on');
    $('#p-code').focus();
}

async function editProduct(id) {
    const p = allProducts.find(x => x.id == id);
    if (p) openProductModal(p);
}

async function deleteProduct(id) {
    if (confirm('¿Seguro que deseas eliminar este producto?')) {
        await api.deleteProduct(id);
        loadData();
    }
}

async function saveProduct(ev) {
    ev.preventDefault();
    const p = {
        id: $('#p-id').value || null,
        code: $('#p-code').value.trim(),
        name: $('#p-name').value.trim(),
        cost: parseFloat($('#p-cost').value) || 0,
        price: parseFloat($('#p-price').value) || 0,
        stock: parseInt($('#p-stock').value) || 0
    };
    await api.saveProduct(p);
    $('#m-prod').classList.remove('on');
    loadData();
}

async function loadSalesHistory() {
    const d = $('#hist-date').value;
    allSales = await api.listSales(d);
    $('#hist-count').textContent = allSales.length + ' ventas encontradas';
    $('#tbl-sales').innerHTML = allSales.map(s => {
        const date = new Date(s.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        const itemsCount = s.items ? s.items.reduce((a, x) => a + x.qty, 0) : 0;
        return `<tr>
        <td><b>#${s.id}</b></td>
        <td>${date}</td>
        <td><span class="badge ${s.method === 'efectivo' ? 'b-ok' : 'b-warn'}">${s.method.toUpperCase()}</span></td>
        <td>${itemsCount} artículos</td>
        <td class="num"><b>${m(s.total)}</b></td>
        <td class="num"><button class="g" onclick="showSaleDetail(${s.id})">Ver ticket</button></td>
        </tr>`;
    }).join('');
}

function showSaleDetail(id) {
    const s = allSales.find(x => x.id == id);
    if (!s) return;
    $('#sale-detail-title').textContent = 'Ticket #' + s.id + ' (' + s.method + ')';
    $('#sale-detail-body').innerHTML = `
        <p class="mut">Fecha: ${new Date(s.created_at).toLocaleString('es-MX')}</p>
        <table>
        <thead><tr><th>Producto</th><th class="num">Cant</th><th class="num">Importe</th></tr></thead>
        <tbody>
            ${(s.items || []).map(it => `<tr><td>${e(it.name)}</td><td class="num">${it.qty}</td><td class="num">${m(it.qty * it.price)}</td></tr>`).join('')}
        </tbody>
        </table>
        <div style="margin-top:12px;text-align:right">
        <div>Total: <b>${m(s.total)}</b></div>
        <div>Pagado: ${m(s.paid)}</div>
        <div>Cambio: <b>${m(s.change)}</b></div>
        </div>`;
    $('#m-sale').classList.add('on');
}

async function loadCorte() {
    const sales = await api.listSales('');
    let cash = 0, card = 0;
    const counter = {};

    sales.forEach(s => {
        if (s.method === 'efectivo') cash += s.total;
        else card += s.total;

        (s.items || []).forEach(it => {
        if (!counter[it.name]) counter[it.name] = { qty: 0, subtotal: 0 };
        counter[it.name].qty += it.qty;
        counter[it.name].subtotal += it.qty * it.price;
        });
    });

    $('#corte-cash').textContent = m(cash);
    $('#corte-card').textContent = m(card);
    $('#corte-total').textContent = m(cash + card);

    const top = Object.entries(counter).sort((a, b) => b[1].qty - a[1].qty).slice(0, 10);
    $('#tbl-top').innerHTML = top.length
        ? top.map(([name, data]) => `<tr>
            <td>${e(name)}</td>
            <td class="num"><b>${data.qty}</b></td>
            <td class="num">${m(data.subtotal)}</td>
        </tr>`).join('')
        : '<tr><td colspan="3" class="mut" style="text-align:center">No hay ventas registradas hoy</td></tr>';
}

$('#hist-date').value = new Date().toISOString().split('T')[0];
loadData();