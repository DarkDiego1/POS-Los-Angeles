const $ = s => document.querySelector(s);
const m = n => '$' + Number(n).toFixed(2);
const e = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Mock Local
let DB = [
    { id: 1, code: '75010001', name: 'Leche Entera 1L', price: 27.50, stock: 15 },
    { id: 2, code: '75010002', name: 'Pan de Caja Blanco', price: 38.00, stock: 10 },
    { id: 3, code: '75010003', name: 'Refresco Cola 600ml', price: 18.00, stock: 24 },
    { id: 4, code: '75010004', name: 'Papas Fritas Sal 45g', price: 17.50, stock: 8 }
];

const api = {
    async search(q) {
        try {
        const r = await fetch('/api/search?q=' + encodeURIComponent(q));
        if (r.ok) return await r.json();
        } catch (err) {}
        return DB.filter(x => x.name.toLowerCase().includes(q.toLowerCase()) || x.code.includes(q));
    },
    async getByCode(c) {
        try {
        const r = await fetch('/api/product/' + encodeURIComponent(c));
        if (r.ok) return await r.json();
        } catch (err) {}
        return DB.find(x => x.code === c) || null;
    },
    async saveSale(data) {
        try {
        const r = await fetch('/api/sales', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (r.ok) return await r.json();
        } catch (err) {}
        const chg = data.paid - data.total;
        data.items.forEach(it => {
        const p = DB.find(x => x.id === it.id);
        if (p) p.stock -= it.qty;
        });
        return { id: Math.floor(Math.random() * 9000) + 1000, change: chg };
    }
};

let cart = [], last = null, sg = [], si = -1, tm = 0;
const inp = $('#in');

function msg(t, bad) {
    const x = $('#ts');
    x.textContent = t;
    x.className = 'toast on' + (bad ? ' bad' : '');
    clearTimeout(tm);
    tm = setTimeout(() => (x.className = 'toast'), 2500);
}

const total = () => cart.reduce((a, p) => a + p.price * p.qty, 0);

function draw() {
    $('#rows').innerHTML = cart.map((p, i) => `<tr>
        <td><b>${e(p.name)}</b><div class="mut">${e(p.code)}</div></td>
        <td class="num">${m(p.price)}</td>
        <td class="num">
        <button class="g" onclick="chg(${i},-1)">−</button>
        <b style="display:inline-block;min-width:28px;text-align:center">${p.qty}</b>
        <button class="g" onclick="chg(${i},1)">+</button>
        </td>
        <td class="num">${m(p.price * p.qty)}</td>
        <td class="num"><button class="g" onclick="del(${i})">✕</button></td>
    </tr>`).join('');
    
    $('#empty').style.display = cart.length ? 'none' : 'block';
    $('#tot').textContent = m(total());
    const n = cart.reduce((a, p) => a + p.qty, 0);
    $('#cnt').textContent = n + (n === 1 ? ' artículo' : ' artículos');
    $('#cob').disabled = !cart.length;
}

function add(p, n = 1) {
    const x = cart.find(c => c.id === p.id);
    const q = (x ? x.qty : 0) + n;
    if (q > p.stock) {
        msg('Solo hay ' + p.stock + ' en existencia de ' + p.name, 1);
        return;
    }
    if (x) x.qty = q;
    else cart.push({ ...p, qty: n });
    draw();
    inp.focus();
}

function chg(i, d) {
    const p = cart[i];
    const q = p.qty + d;
    if (q < 1) { del(i); return; }
    if (q > p.stock) {
        msg('Solo hay ' + p.stock + ' disponibles', 1);
        return;
    }
    p.qty = q;
    draw();
    inp.focus();
}

function del(i) {
    cart.splice(i, 1);
    draw();
    inp.focus();
}

function hide() {
    $('#sug').style.display = 'none';
    sg = [];
    si = -1;
}

function show(list, n) {
    sg = list.map(p => ({ p, n }));
    si = -1;
    $('#sug').innerHTML = list.map((p, i) => `
        <div data-i="${i}">
        <span>${e(p.name)} <span class="mut">${e(p.code)}</span></span>
        <b>${m(p.price)}</b>
        </div>`).join('');
    $('#sug').style.display = 'block';
}

$('#sug').addEventListener('mousedown', ev => {
    const d = ev.target.closest('[data-i]');
    if (!d) return;
    ev.preventDefault();
    const s = sg[+d.dataset.i];
    hide();
    inp.value = '';
    add(s.p, s.n);
});

function parse(v) {
    const t = v.match(/^(\d+)\*(.+)$/);
    return t ? { n: +t[1], v: t[2].trim() } : { n: 1, v };
}

let dt = 0;
inp.addEventListener('input', () => {
    clearTimeout(dt);
    const { v, n } = parse(inp.value.trim());
    if (v.length < 2) { hide(); return; }
    dt = setTimeout(async () => {
        const l = await api.search(v);
        if (inp.value.trim() && l.length) show(l, n);
        else hide();
    }, 200);
});

inp.addEventListener('keydown', async ev => {
    if (ev.key === 'ArrowDown' && sg.length) {
        ev.preventDefault();
        si = (si + 1) % sg.length;
        document.querySelectorAll('#sug div').forEach((d, i) => d.classList.toggle('sel', i === si));
        return;
    }
    if (ev.key === 'ArrowUp' && sg.length) {
        ev.preventDefault();
        si = (si - 1 + sg.length) % sg.length;
        document.querySelectorAll('#sug div').forEach((d, i) => d.classList.toggle('sel', i === si));
        return;
    }
    if (ev.key === 'Escape') { hide(); return; }
    if (ev.key !== 'Enter') return;

    clearTimeout(dt);
    if (si >= 0 && sg[si]) {
        const s = sg[si];
        hide();
        inp.value = '';
        add(s.p, s.n);
        return;
    }

    const { v, n } = parse(inp.value.trim());
    inp.value = '';
    hide();
    if (!v) return;

    const p = await api.getByCode(v);
    if (p) { add(p, n); return; }

    const l = await api.search(v);
    if (l.length === 1) add(l[0], n);
    else if (l.length > 1) show(l, n);
    else msg('Producto no encontrado: ' + v, 1);
});

inp.addEventListener('blur', () => setTimeout(hide, 150));

function cobrar() {
    if (!cart.length) return;
    $('#mt').textContent = m(total());
    $('#met').value = 'efectivo';
    $('#cash').style.display = 'block';
    $('#paid').value = '';
    calc();
    $('#mp').classList.add('on');
    $('#paid').focus();
}

function addMoney(amount) {
    const current = parseFloat($('#paid').value) || 0;
    $('#paid').value = (current + amount).toFixed(2);
    calc();
}

function exactMoney() {
    $('#paid').value = total().toFixed(2);
    calc();
}

function calc() {
    const met = $('#met').value;
    const t = total();
    if (met === 'tarjeta') {
        $('#go').disabled = false;
        $('#status-line').textContent = 'Cobro con terminal bancaria';
        $('#missing-warn').style.display = 'none';
        return;
    }
    const paidVal = parseFloat($('#paid').value) || 0;
    const diff = paidVal - t;

    if (paidVal < t) {
        const faltante = t - paidVal;
        $('#status-line').textContent = 'Faltan: ' + m(faltante);
        $('#status-line').style.color = 'var(--bad)';
        $('#missing-warn').style.display = 'block';
        $('#go').disabled = true;
    } else {
        $('#status-line').textContent = 'Cambio: ' + m(diff);
        $('#status-line').style.color = 'var(--ok)';
        $('#missing-warn').style.display = 'none';
        $('#go').disabled = false;
    }
}

$('#paid').addEventListener('input', calc);
$('#met').addEventListener('change', () => {
    const isCash = $('#met').value === 'efectivo';
    $('#cash').style.display = isCash ? 'block' : 'none';
    calc();
});

$('#no').onclick = () => { $('#mp').classList.remove('on'); inp.focus(); };
$('#cob').onclick = cobrar;
$('#clr').onclick = () => {
    if (cart.length && confirm('¿Vaciar la venta actual?')) {
        cart = [];
        draw();
    }
    inp.focus();
};

async function pay() {
    const met = $('#met').value;
    const t = total();
    const paid = met === 'efectivo' ? (parseFloat($('#paid').value) || 0) : t;
    if (paid < t) return;

    const res = await api.saveSale({
        items: cart.map(p => ({ id: p.id, qty: p.qty })),
        total: t,
        paid,
        method: met
    });

    last = { id: res.id, items: [...cart], total: t, paid, change: res.change, met, at: new Date() };
    $('#mp').classList.remove('on');
    $('#dc').textContent = m(res.change);
    $('#md').classList.add('on');
    $('#nw').focus();
    }

    $('#go').onclick = pay;
    $('#mp').addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && !$('#go').disabled) {
        ev.preventDefault();
        pay();
    }
    if (ev.key === 'Escape') $('#no').click();
});

function nueva() {
    cart = [];
    last = null;
    draw();
    $('#md').classList.remove('on');
    inp.focus();
}

$('#nw').onclick = nueva;
$('#pr').onclick = () => {
    if (!last) return;
    $('#tk').innerHTML = `
        <div style="text-align:center"><b>TIENDA</b><br>Ticket #${last.id}<br>${last.at.toLocaleString('es-MX')}</div>
        <hr>
        <table>${last.items.map(p => `<tr><td>${p.qty} x${e(p.name)}</td><td style="text-align:right">${m(p.price * p.qty)}</td></tr>`).join('')}</table>
        <hr>
        <div style="display:flex;justify-content:space-between"><b>TOTAL</b><b>${m(last.total)}</b></div>
        <div style="display:flex;justify-content:space-between"><span>Pago (${last.met})</span><span>${m(last.paid)}</span></div>
        <div style="display:flex;justify-content:space-between"><span>Cambio</span><span>${m(last.change)}</span></div>
        <p style="text-align:center">¡Gracias por su compra!</p>`;
    window.print();
};

document.addEventListener('keydown', ev => {
    if (ev.key === 'F2') { ev.preventDefault(); inp.focus(); }
    if (ev.key === 'F4') { ev.preventDefault(); $('#clr').click(); }
    if (ev.key === 'F9') { ev.preventDefault(); if (!$('#md').classList.contains('on')) cobrar(); }
    if (ev.key === 'Enter' && $('#md').classList.contains('on')) { ev.preventDefault(); nueva(); }
});

document.addEventListener('click', ev => {
    if (!ev.target.closest('.modal') && !ev.target.closest('button') && !ev.target.closest('input') && !ev.target.closest('select')) {
        inp.focus();
    }
});

draw();