# Requiere: pip install fastapi uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import sqlite3
from typing import List, Optional

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    conn = sqlite3.connect("pos.db")
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            cost REAL NOT NULL DEFAULT 0.0,
            price REAL NOT NULL,
            stock INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS sales (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            total REAL NOT NULL,
            paid REAL NOT NULL,
            change REAL NOT NULL,
            method TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS sale_items (
            sale_id INTEGER,
            product_id INTEGER,
            qty INTEGER,
            price REAL NOT NULL,
            cost REAL NOT NULL DEFAULT 0.0,
            FOREIGN KEY (sale_id) REFERENCES sales(id)
        );
        """)
        # Datos iniciales si la tabla está nueva
        cnt = db.execute("SELECT COUNT(*) FROM products").fetchone()[0]
        if cnt == 0:
            db.executemany(
                "INSERT INTO products (code, name, cost, price, stock) VALUES (?, ?, ?, ?, ?)",
                [
                    ("75010001", "Leche Entera 1L", 21.00, 27.50, 20),
                    ("75010002", "Pan Blanco", 28.00, 38.00, 4),
                    ("75010003", "Refresco Cola 600ml", 12.50, 18.00, 30),
                    ("75010004", "Papas Fritas Sal", 13.00, 17.50, 3),
                ]
            )

init_db()

class ProductModel(BaseModel):
    id: Optional[int] = None
    code: str
    name: str
    cost: float = 0.0
    price: float
    stock: int

class SaleItem(BaseModel):
    id: int
    qty: int

class SaleModel(BaseModel):
    items: List[SaleItem]
    total: float
    paid: float
    method: str

@app.get("/")
@app.get("/cashier")
def serve_cashier():
    return FileResponse("cashier.html")

@app.get("/admin")
def serve_admin():
    return FileResponse("admin.html")

# CATALOGO Y BUSQUEDA
@app.get("/api/products")
def list_products():
    with get_db() as db:
        rows = db.execute("SELECT * FROM products ORDER BY id DESC").fetchall()
        return [dict(r) for r in rows]

@app.get("/api/product/{code}")
def get_product(code: str):
    with get_db() as db:
        row = db.execute("SELECT * FROM products WHERE code = ?", (code,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="No encontrado")
        return dict(row)

@app.get("/api/search")
def search_products(q: str):
    with get_db() as db:
        term = f"%{q}%"
        rows = db.execute(
            "SELECT * FROM products WHERE name LIKE ? OR code LIKE ? LIMIT 10",
            (term, term)
        ).fetchall()
        return [dict(r) for r in rows]

@app.post("/api/products")
def save_product(p: ProductModel):
    with get_db() as db:
        if p.id:
            db.execute(
                "UPDATE products SET code=?, name=?, cost=?, price=?, stock=? WHERE id=?",
                (p.code, p.name, p.cost, p.price, p.stock, p.id)
            )
            return p
        cur = db.execute(
            "INSERT INTO products (code, name, cost, price, stock) VALUES (?, ?, ?, ?, ?)",
            (p.code, p.name, p.cost, p.price, p.stock)
        )
        return {"id": cur.lastrowid, **p.dict(exclude={"id"})}

@app.delete("/api/products/{pid}")
def delete_product(pid: int):
    with get_db() as db:
        db.execute("DELETE FROM products WHERE id=?", (pid,))
        return {"ok": True}

# VENTAS
@app.post("/api/sales")
def create_sale(s: SaleModel):
    change = round(s.paid - s.total, 2)
    with get_db() as db:
        cur = db.execute(
            "INSERT INTO sales (total, paid, change, method) VALUES (?, ?, ?, ?)",
            (s.total, s.paid, change, s.method)
        )
        sale_id = cur.lastrowid
        for it in s.items:
            prod = db.execute("SELECT price, cost FROM products WHERE id = ?", (it.id,)).fetchone()
            price = prod["price"] if prod else 0.0
            cost = prod["cost"] if prod else 0.0
            db.execute("INSERT INTO sale_items VALUES (?, ?, ?, ?, ?)", (sale_id, it.id, it.qty, price, cost))
            db.execute("UPDATE products SET stock = stock - ? WHERE id = ?", (it.qty, it.id))
        return {"id": sale_id, "change": change}

# REPORTES Y METRICAS
@app.get("/api/metrics")
def get_metrics():
    with get_db() as db:
        # Ventas de hoy
        s_row = db.execute("""
            SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS count 
            FROM sales 
            WHERE date(created_at, 'localtime') = date('now', 'localtime')
        """).fetchone()

        # Ganancia neta de hoy (Suma de (precio - costo) * qty)
        p_row = db.execute("""
            SELECT COALESCE(SUM((si.price - si.cost) * si.qty), 0) AS profit
            FROM sale_items si
            JOIN sales s ON s.id = si.sale_id
            WHERE date(s.created_at, 'localtime') = date('now', 'localtime')
        """).fetchone()

        return {"total": s_row["total"], "count": s_row["count"], "profit": p_row["profit"]}

@app.get("/api/sales/history")
def sales_history(date: Optional[str] = None):
    with get_db() as db:
        query = "SELECT * FROM sales WHERE date(created_at, 'localtime') = ? ORDER BY id DESC" if date else "SELECT * FROM sales ORDER BY id DESC LIMIT 50"
        params = (date,) if date else ()
        sales_rows = db.execute(query, params).fetchall()

        results = []
        for s in sales_rows:
            sale_dict = dict(s)
            items = db.execute("""
                SELECT p.name, si.qty, si.price 
                FROM sale_items si 
                JOIN products p ON p.id = si.product_id 
                WHERE si.sale_id = ?
            """, (s["id"],)).fetchall()
            sale_dict["items"] = [dict(i) for i in items]
            results.append(sale_dict)
        return results

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)