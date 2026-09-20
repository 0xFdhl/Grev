const PAGE_SIZE = 500;

export function maxStockNumber(prefix) {
  return Math.min(Number.MAX_SAFE_INTEGER, 10 ** (20 - prefix.length) - 1);
}

export async function nextStockNumber(db, prefix) {
  let highest = 0;
  // Include trash and page through all rows; the API's row cap must not hide
  // an existing high number. Stable ordering also makes retries deterministic.
  let offset = 0;
  while (true) {
    const { data, error } = await db.from('links').select('code')
      .like('code', `${prefix}%`).order('code', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data || []) {
      const suffix = row.code.slice(prefix.length);
      if (!/^[0-9]+$/.test(suffix)) continue;
      const number = Number(suffix);
      if (!Number.isSafeInteger(number) || number > maxStockNumber(prefix)) {
        throw new Error('Nomor stok melampaui batas. Gunakan prefix baru.');
      }
      highest = Math.max(highest, number);
    }
    if (!data?.length) return highest + 1;
    // Continue to an empty page, even when a server row cap is below PAGE_SIZE.
    offset += data.length;
  }
}

export async function createStockCodes(db, prefix, count) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const start = await nextStockNumber(db, prefix);
    if (!Number.isSafeInteger(start + count - 1) || start + count - 1 > maxStockNumber(prefix)) {
      return { error: { code: 'STOCK_LIMIT' } };
    }
    const rows = Array.from({ length: count }, (_, index) => ({
      code: `${prefix}${String(start + index).padStart(4, '0')}`, is_active: false,
    }));
    // A batch INSERT is atomic. The existing UNIQUE(code) constraint arbitrates
    // concurrent requests; only the loser recomputes and retries the whole batch.
    const result = await db.from('links').insert(rows).select();
    if (result.error?.code !== '23505') return result;
  }
  return { error: { code: 'STOCK_BUSY' } };
}
