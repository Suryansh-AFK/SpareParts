import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MongoClient } from 'mongodb';

const DEFAULT_STATE = {
  settings: {
    shopName: 'GEARHOUSE', phone: '', email: '', address: '', taxRate: 0,
    currency: 'INR', lowStockDefault: 5,
    receiptNote: 'Thank you for choosing our shop. Please keep this receipt for your records.',
    demoSeeded: false,
  },
  products: [], sales: [], movements: [], customers: [], orders: [],
};
let mongoClientPromise;

function normalizeState(value) {
  return {
    ...structuredClone(DEFAULT_STATE),
    ...value,
    settings: { ...DEFAULT_STATE.settings, ...(value?.settings || {}) },
    products: Array.isArray(value?.products) ? value.products : [],
    sales: Array.isArray(value?.sales) ? value.sales : [],
    movements: Array.isArray(value?.movements) ? value.movements : [],
    customers: Array.isArray(value?.customers) ? value.customers : [],
    orders: Array.isArray(value?.orders) ? value.orders : [],
  };
}

async function mongoCollection() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    if (process.env.VERCEL) throw new Error('MONGODB_URI is required for the hosted deployment.');
    return null;
  }
  if (!mongoClientPromise) {
    const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 8000 });
    mongoClientPromise = client.connect().then(() => client);
    mongoClientPromise.catch(() => { mongoClientPromise = undefined; });
  }
  const client = await mongoClientPromise;
  return client.db(process.env.MONGODB_DB || 'gearhouse').collection('shop_state');
}

function localFilePath() {
  return path.resolve(process.env.DATA_FILE || './data/gearhouse.json');
}

export async function getStoreMode() {
  return (await mongoCollection()) ? 'mongodb' : 'local-folder';
}

export async function loadState() {
  const collection = await mongoCollection();
  if (collection) {
    const record = await collection.findOne({ _id: 'main-shop' });
    return normalizeState(record?.state || DEFAULT_STATE);
  }
  const filename = localFilePath();
  try {
    return normalizeState(JSON.parse(await readFile(filename, 'utf8')));
  } catch (error) {
    if (error.code === 'ENOENT') return normalizeState(DEFAULT_STATE);
    throw error;
  }
}

export async function saveState(value) {
  const state = normalizeState(value);
  const collection = await mongoCollection();
  if (collection) {
    await collection.updateOne(
      { _id: 'main-shop' },
      { $set: { state, updatedAt: new Date() } },
      { upsert: true },
    );
    return;
  }
  const filename = localFilePath();
  await mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await rename(temporary, filename);
}

export function checkState(value) {
  if (!value || typeof value !== 'object') return 'Invalid workspace data.';
  for (const key of ['products', 'sales', 'movements', 'customers', 'orders']) {
    if (!Array.isArray(value[key])) return `The ${key} list must be an array.`;
    if (value[key].length > 100000) return `The ${key} list is too large.`;
  }
  const skuSet = new Set();
  for (const product of value.products) {
    if (!product?.id || typeof product.name !== 'string' || !Number.isFinite(Number(product.price)) || Number(product.quantity) < 0) return 'A part record is missing its name, price, or valid stock quantity.';
    const sku = String(product.sku || '').trim().toLowerCase();
    if (sku && skuSet.has(sku)) return `SKU ${product.sku} is used more than once.`;
    if (sku) skuSet.add(sku);
  }
  for (const sale of value.sales) {
    if (!sale?.id || !Array.isArray(sale.items) || !Number.isFinite(Number(sale.total))) return 'A receipt record is incomplete.';
  }
  for (const order of value.orders) {
    if (!order?.id || typeof order.orderNo !== 'string' || !['new', 'contacted', 'ready', 'completed', 'cancelled'].includes(order.status) || !order.customer?.name || !order.customer?.phone || !Array.isArray(order.items) || !Number.isFinite(Number(order.total))) return 'A customer order is incomplete.';
  }
  return null;
}
