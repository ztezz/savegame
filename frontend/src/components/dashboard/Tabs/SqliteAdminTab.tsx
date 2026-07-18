import React, { useEffect, useState } from 'react';
import { Activity, Database, Download, FolderSearch, Play, Plus, RefreshCw, Save, ShieldCheck, Trash2, Wrench, X } from 'lucide-react';
import api from '../../../utils/api';
import { useToast } from '../../../context/ToastContext';

type TableSummary = { name: string; sql: string; rowCount: number };
type ColumnInfo = { name: string; type: string; notnull: number; dflt_value: any; pk: number };
type TableData = { table: TableSummary; columns: ColumnInfo[]; primaryKey: string[]; rows: Record<string, any>[]; total: number; page: number; limit: number };
type DatabaseItem = { id: string; name: string; path: string; bytes: number; modifiedAt: string; tableCount: number; primary: boolean };
type ScanRoot = { id: string; name: string; path: string };

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toFixed(index ? 1 : 0)} ${units[index]}`;
};

const displayValue = (value: any) => {
  if (value === null) return <span className="italic text-slate-400">NULL</span>;
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return <span title={text}>{text.length > 100 ? `${text.slice(0, 100)}...` : text}</span>;
};

export default function SqliteAdminTab() {
  const { showToast } = useToast();
  const [overview, setOverview] = useState<any>(null);
  const [databases, setDatabases] = useState<DatabaseItem[]>([]);
  const [roots, setRoots] = useState<ScanRoot[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState('');
  const [createDialog, setCreateDialog] = useState(false);
  const [newDatabaseName, setNewDatabaseName] = useState('');
  const [newDatabaseRoot, setNewDatabaseRoot] = useState('');
  const [selectedTable, setSelectedTable] = useState('');
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [editor, setEditor] = useState<{ mode: 'add' | 'edit'; key?: Record<string, any>; text: string } | null>(null);
  const [sql, setSql] = useState('SELECT name, type, sql\nFROM sqlite_schema\nORDER BY type, name;');
  const [queryResult, setQueryResult] = useState<any>(null);
  const [activeView, setActiveView] = useState<'data' | 'sql'>('data');
  const [databaseLoading, setDatabaseLoading] = useState(true);
  const [databaseError, setDatabaseError] = useState('');

  const databaseParams = selectedDatabase ? { database: selectedDatabase } : {};

  const loadDatabases = async () => {
    setDatabaseLoading(true);
    setDatabaseError('');
    try {
      const response = await api.get('/admin/sqlite/databases', { timeout: 15000 });
      const nextDatabases = response.data.databases || [];
      setDatabases(nextDatabases);
      setRoots(response.data.roots || []);
      setNewDatabaseRoot((current) => current || response.data.roots?.[0]?.id || '');
      setSelectedDatabase((current) => current || nextDatabases[0]?.id || '');
      if (nextDatabases.length === 0) setDatabaseError('Server chưa tìm thấy file SQLite hợp lệ.');
      return nextDatabases;
    } catch (error: any) {
      const message = error.code === 'ECONNABORTED'
        ? 'Quét SQLite quá thời gian. Hãy kiểm tra thư mục SQLITE_SCAN_PATHS trên server.'
        : error.response?.data?.error || 'Không tải được danh sách SQLite từ server.';
      setDatabaseError(message);
      throw error;
    } finally {
      setDatabaseLoading(false);
    }
  };

  const loadOverview = async (databaseId = selectedDatabase) => {
    if (!databaseId) return;
    const response = await api.get('/admin/sqlite/overview', { params: { database: databaseId } });
    setOverview(response.data);
    if (!response.data.tables.some((table: TableSummary) => table.name === selectedTable)) setSelectedTable(response.data.tables[0]?.name || '');
  };

  const loadTable = async (name = selectedTable, nextPage = page) => {
    if (!name) return;
    setLoading(true);
    try {
      const response = await api.get(`/admin/sqlite/tables/${encodeURIComponent(name)}`, { params: { ...databaseParams, page: nextPage, limit: 50 } });
      setTableData(response.data);
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Không tải được dữ liệu bảng', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDatabases().catch((error) => showToast(error.response?.data?.error || 'Không quét được SQLite', 'error'));
  }, []);

  useEffect(() => {
    if (!selectedDatabase) return;
    setSelectedTable('');
    setTableData(null);
    setPage(1);
    loadOverview(selectedDatabase).catch((error) => showToast(error.response?.data?.error || 'Không tải được SQLite', 'error'));
  }, [selectedDatabase]);

  useEffect(() => {
    if (selectedDatabase && selectedTable) loadTable(selectedTable, page);
  }, [selectedDatabase, selectedTable, page]);

  const openAdd = () => {
    const initial = Object.fromEntries((tableData?.columns || []).filter((column) => column.dflt_value == null && !column.pk).map((column) => [column.name, null]));
    setEditor({ mode: 'add', text: JSON.stringify(initial, null, 2) });
  };

  const openEdit = (row: Record<string, any>) => {
    if (!tableData?.primaryKey.length) return;
    const key = Object.fromEntries(tableData.primaryKey.map((name) => [name, row[name]]));
    const values = Object.fromEntries(Object.entries(row).filter(([name]) => !tableData.primaryKey.includes(name)));
    setEditor({ mode: 'edit', key, text: JSON.stringify(values, null, 2) });
  };

  const saveRow = async () => {
    if (!editor || !selectedTable) return;
    try {
      const values = JSON.parse(editor.text);
      if (editor.mode === 'add') await api.post(`/admin/sqlite/tables/${encodeURIComponent(selectedTable)}/rows`, { databaseId: selectedDatabase, values });
      else await api.put(`/admin/sqlite/tables/${encodeURIComponent(selectedTable)}/rows`, { databaseId: selectedDatabase, key: editor.key, values });
      setEditor(null);
      await Promise.all([loadTable(), loadOverview()]);
      showToast(editor.mode === 'add' ? 'Đã thêm hàng' : 'Đã cập nhật hàng', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error || error.message || 'Dữ liệu JSON không hợp lệ', 'error');
    }
  };

  const deleteRow = async (row: Record<string, any>) => {
    if (!tableData?.primaryKey.length || !window.confirm(`Xóa hàng này khỏi bảng ${selectedTable}?`)) return;
    const key = Object.fromEntries(tableData.primaryKey.map((name) => [name, row[name]]));
    try {
      await api.delete(`/admin/sqlite/tables/${encodeURIComponent(selectedTable)}/rows`, { data: { databaseId: selectedDatabase, key } });
      await Promise.all([loadTable(), loadOverview()]);
      showToast('Đã xóa hàng', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Không thể xóa hàng', 'error');
    }
  };

  const executeSql = async () => {
    const readonly = /^\s*(SELECT|WITH|EXPLAIN|PRAGMA)\b/i.test(sql);
    if (!readonly && !window.confirm('Câu lệnh này có thể thay đổi dữ liệu trực tiếp. Tiếp tục chạy SQL?')) return;
    setLoading(true);
    try {
      const response = await api.post('/admin/sqlite/query', { databaseId: selectedDatabase, sql });
      setQueryResult(response.data);
      await loadOverview();
      showToast(`SQL hoàn tất trong ${response.data.durationMs}ms`, 'success');
    } catch (error: any) {
      setQueryResult({ error: error.response?.data?.error || error.message });
      showToast(error.response?.data?.error || 'SQL thất bại', 'error');
    } finally {
      setLoading(false);
    }
  };

  const maintenance = async (operation: string) => {
    try {
      const response = await api.post(`/admin/sqlite/maintenance/${operation}`, { databaseId: selectedDatabase });
      setQueryResult(response.data);
      await loadOverview();
      showToast('Tác vụ SQLite đã hoàn tất', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Tác vụ thất bại', 'error');
    }
  };

  const downloadBackup = async () => {
    try {
      const response = await api.get('/admin/sqlite/backup', { params: databaseParams, responseType: 'blob' });
      const disposition = String(response.headers['content-disposition'] || '');
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || 'savegame-backup.sqlite';
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      showToast('Đã tạo bản backup nhất quán', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Không tải được backup', 'error');
    }
  };

  const createDatabase = async () => {
    try {
      const response = await api.post('/admin/sqlite/databases', { directoryId: newDatabaseRoot, name: newDatabaseName });
      setCreateDialog(false);
      setNewDatabaseName('');
      await loadDatabases();
      setSelectedDatabase(response.data.database.id);
      showToast('Đã tạo SQLite mới', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Không tạo được SQLite', 'error');
    }
  };

  const rescan = async () => {
    try {
      await loadDatabases();
      showToast('Đã quét lại các file SQLite', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error || 'Không quét được SQLite', 'error');
    }
  };

  const resultColumns = queryResult?.rows?.length ? Object.keys(queryResult.rows[0]) : [];
  const totalPages = Math.max(1, Math.ceil((tableData?.total || 0) / (tableData?.limit || 50)));

  return <div className="admin-dark-surface col-span-12 space-y-5">
    <div className="flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm lg:flex-row lg:items-end">
      <label className="min-w-0 flex-1 text-[10px] font-black uppercase tracking-widest text-slate-500">Database trên server
        <select value={selectedDatabase} disabled={databaseLoading || databases.length === 0} onChange={(event) => setSelectedDatabase(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 font-mono text-xs font-bold normal-case tracking-normal text-slate-800 outline-none focus:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">
          {databaseLoading && <option value="">Đang quét database...</option>}
          {!databaseLoading && databases.length === 0 && <option value="">Không tìm thấy database</option>}
          {databases.map((item) => <option key={item.id} value={item.id}>{item.primary ? '[Chính] ' : ''}{item.name} · {item.tableCount} bảng · {formatBytes(item.bytes)}</option>)}
        </select>
        {databaseError && <span className="mt-2 block normal-case tracking-normal text-rose-500">{databaseError}</span>}
      </label>
      <button onClick={rescan} disabled={databaseLoading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-xs font-black text-slate-700 hover:border-emerald-300 disabled:opacity-50"><FolderSearch className={`h-4 w-4 text-emerald-600 ${databaseLoading ? 'animate-pulse' : ''}`} />Quét lại</button>
      <button onClick={() => setCreateDialog(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white"><Plus className="h-4 w-4" />Tạo SQLite mới</button>
    </div>

    <div className="overflow-hidden rounded-3xl bg-slate-950 p-6 text-white shadow-xl">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-300"><Database className="h-3.5 w-3.5" /> SQLite trực tiếp</div>
          <h3 className="mt-4 text-2xl font-black">Trung tâm dữ liệu server</h3>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">Duyệt và chỉnh sửa dữ liệu, chạy SQL, kiểm tra tính toàn vẹn và tạo backup nhất quán.</p>
          <p className="mt-3 break-all font-mono text-[11px] text-slate-500">{overview?.path || 'Đang đọc đường dẫn...'}</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3"><p className="text-[9px] font-black uppercase text-slate-500">Dung lượng</p><p className="mt-1 font-mono text-sm font-bold">{formatBytes(overview?.sqliteBytes || 0)}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3"><p className="text-[9px] font-black uppercase text-slate-500">Số bảng</p><p className="mt-1 font-mono text-sm font-bold">{overview?.tables?.length || 0}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3"><p className="text-[9px] font-black uppercase text-slate-500">Journal</p><p className="mt-1 font-mono text-sm font-bold uppercase">{overview?.journalMode || '-'}</p></div>
        </div>
      </div>
    </div>

    <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between px-2 py-2"><span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Bảng dữ liệu</span><button onClick={() => loadOverview()} className="text-slate-400 hover:text-indigo-600"><RefreshCw className="h-4 w-4" /></button></div>
        <div className="max-h-[560px] space-y-1 overflow-y-auto">
          {(overview?.tables || []).map((table: TableSummary) => <button key={table.name} onClick={() => { setSelectedTable(table.name); setPage(1); setActiveView('data'); }} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left ${selectedTable === table.name && activeView === 'data' ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-50'}`}><span className="truncate font-mono text-xs font-bold">{table.name}</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${selectedTable === table.name && activeView === 'data' ? 'bg-white/15' : 'bg-slate-100 text-slate-500'}`}>{table.rowCount}</span></button>)}
        </div>
        <button onClick={() => setActiveView('sql')} className={`mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-3 text-xs font-black ${activeView === 'sql' ? 'bg-emerald-600 text-white' : 'bg-slate-950 text-white'}`}><Play className="h-4 w-4" />SQL Console</button>
      </aside>

      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <button onClick={() => maintenance('integrity')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-emerald-300"><ShieldCheck className="h-4 w-4 text-emerald-600" />Integrity check</button>
          <button onClick={() => maintenance('optimize')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-indigo-300"><Wrench className="h-4 w-4 text-indigo-600" />Optimize</button>
          <button onClick={() => maintenance('checkpoint')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:border-amber-300"><Activity className="h-4 w-4 text-amber-600" />Checkpoint WAL</button>
          <button onClick={downloadBackup} className="ml-auto inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white"><Download className="h-4 w-4" />Tải backup</button>
        </div>

        {activeView === 'data' && <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h4 className="font-mono text-sm font-black text-slate-900">{selectedTable}</h4><p className="mt-1 text-[11px] text-slate-500">{tableData?.total || 0} hàng · PK: {tableData?.primaryKey.join(', ') || 'không có'}</p></div><button onClick={openAdd} className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white"><Plus className="h-4 w-4" />Thêm hàng</button></div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500"><tr>{tableData?.columns.map((column) => <th key={column.name} className="whitespace-nowrap px-4 py-3"><span>{column.name}</span>{column.pk > 0 && <span className="ml-1 text-indigo-600">PK</span>}<span className="ml-1 font-mono font-normal text-slate-400">{column.type}</span></th>)}<th className="sticky right-0 bg-slate-50 px-4 py-3">Thao tác</th></tr></thead><tbody className="divide-y divide-slate-100">{tableData?.rows.map((row, index) => <tr key={index} className="hover:bg-slate-50">{tableData.columns.map((column) => <td key={column.name} className="max-w-[260px] truncate whitespace-nowrap px-4 py-3 font-mono text-[11px] text-slate-700">{displayValue(row[column.name])}</td>)}<td className="sticky right-0 whitespace-nowrap bg-white px-4 py-2"><button disabled={!tableData.primaryKey.length} onClick={() => openEdit(row)} className="mr-1 rounded-lg px-2 py-1.5 font-bold text-indigo-600 hover:bg-indigo-50 disabled:text-slate-300">Sửa</button><button disabled={!tableData.primaryKey.length} onClick={() => deleteRow(row)} className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 disabled:text-slate-300"><Trash2 className="h-3.5 w-3.5" /></button></td></tr>)}</tbody></table>
            {!loading && !tableData?.rows.length && <div className="p-10 text-center text-sm text-slate-400">Bảng chưa có dữ liệu</div>}
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 p-4 text-xs"><button disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border px-3 py-1.5 font-bold disabled:opacity-40">Trang trước</button><span className="font-mono text-slate-500">{page} / {totalPages}</span><button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border px-3 py-1.5 font-bold disabled:opacity-40">Trang sau</button></div>
        </div>}

        {activeView === 'sql' && <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 shadow-xl">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><h4 className="font-mono text-sm font-black text-white">SQL Console</h4><p className="mt-1 text-[10px] text-amber-300">Lệnh thay đổi dữ liệu chạy trực tiếp và được ghi audit.</p></div><button disabled={loading} onClick={executeSql} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black text-slate-950 disabled:opacity-50"><Play className="h-4 w-4" />Chạy SQL</button></div>
          <textarea value={sql} onChange={(event) => setSql(event.target.value)} spellCheck={false} className="h-56 w-full resize-y bg-slate-950 p-5 font-mono text-sm leading-6 text-emerald-300 outline-none" />
          {queryResult && <div className="border-t border-white/10 bg-white p-4"><div className="mb-3 text-xs font-bold text-slate-500">{queryResult.error ? <span className="text-rose-600">{queryResult.error}</span> : `${queryResult.rowCount} kết quả · ${queryResult.durationMs ?? '-'}ms`}</div>{resultColumns.length > 0 && <div className="max-h-80 overflow-auto rounded-xl border"><table className="min-w-full text-left text-xs"><thead className="sticky top-0 bg-slate-100"><tr>{resultColumns.map((column) => <th key={column} className="px-3 py-2 font-mono font-black">{column}</th>)}</tr></thead><tbody className="divide-y">{queryResult.rows.map((row: any, index: number) => <tr key={index}>{resultColumns.map((column) => <td key={column} className="max-w-[300px] truncate px-3 py-2 font-mono text-[11px]">{displayValue(row[column])}</td>)}</tr>)}</tbody></table></div>}{queryResult.result && <pre className="overflow-auto rounded-xl bg-slate-100 p-3 text-xs">{JSON.stringify(queryResult.result, null, 2)}</pre>}</div>}
        </div>}
      </section>
    </div>

    {editor && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"><div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b p-5"><div><h4 className="font-black text-slate-900">{editor.mode === 'add' ? 'Thêm hàng' : 'Sửa hàng'}</h4>{editor.key && <p className="mt-1 font-mono text-[10px] text-slate-500">PK: {JSON.stringify(editor.key)}</p>}</div><button onClick={() => setEditor(null)} className="rounded-lg px-3 py-1 text-sm font-bold text-slate-500 hover:bg-slate-100">Đóng</button></div><textarea value={editor.text} onChange={(event) => setEditor({ ...editor, text: event.target.value })} spellCheck={false} className="h-96 w-full resize-y bg-slate-950 p-5 font-mono text-sm leading-6 text-emerald-300 outline-none" /><div className="flex justify-end gap-2 p-4"><button onClick={() => setEditor(null)} className="rounded-xl border px-4 py-2 text-xs font-bold">Hủy</button><button onClick={saveRow} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white"><Save className="h-4 w-4" />Lưu dữ liệu</button></div></div></div>}
    {createDialog && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"><div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h4 className="text-lg font-black text-slate-900">Tạo SQLite mới</h4><p className="mt-1 text-xs text-slate-500">File chỉ được tạo trong thư mục server đã cho phép.</p></div><button onClick={() => setCreateDialog(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div><label className="mt-5 block text-xs font-black text-slate-700">Tên database<input autoFocus value={newDatabaseName} onChange={(event) => setNewDatabaseName(event.target.value)} placeholder="analytics.sqlite" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-mono text-sm outline-none focus:border-emerald-400" /></label><label className="mt-4 block text-xs font-black text-slate-700">Thư mục<select value={newDatabaseRoot} onChange={(event) => setNewDatabaseRoot(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs outline-none focus:border-emerald-400">{roots.map((root) => <option key={root.id} value={root.id}>{root.path}</option>)}</select></label><p className="mt-3 text-[11px] text-slate-500">Nếu không nhập đuôi, hệ thống tự thêm <code>.sqlite</code>. Tạo bảng sau đó bằng SQL Console.</p><div className="mt-6 flex justify-end gap-2"><button onClick={() => setCreateDialog(false)} className="rounded-xl border px-4 py-2.5 text-xs font-bold">Hủy</button><button disabled={!newDatabaseName.trim() || !newDatabaseRoot} onClick={createDatabase} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40"><Database className="h-4 w-4" />Tạo database</button></div></div></div>}
  </div>;
}
