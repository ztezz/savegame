import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowDownAZ, Check, Edit2, FolderOpen, Gamepad2,
  Layers3, Plus, RefreshCw, Search, Sparkles, Tag, Trash2, X,
} from "lucide-react";
import api from "../../../utils/api";
import { useToast } from "../../../context/ToastContext";

interface Category {
  id: string;
  name: string;
  game_count?: number;
}

interface CategoryTabProps {
  onCategoryUpdated?: () => void;
}

type SortMode = "name-asc" | "name-desc" | "usage-desc";

const CATEGORY_COLORS = [
  "from-indigo-500 to-violet-500",
  "from-sky-500 to-cyan-500",
  "from-emerald-500 to-teal-500",
  "from-orange-500 to-amber-500",
  "from-rose-500 to-pink-500",
  "from-fuchsia-500 to-purple-500",
];

const colorForCategory = (name: string) => {
  const hash = Array.from(name).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return CATEGORY_COLORS[hash % CATEGORY_COLORS.length];
};

const CategoryTab: React.FC<CategoryTabProps> = ({ onCategoryUpdated }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("name-asc");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const { showToast } = useToast();

  const fetchCategories = async (showLoader = true) => {
    try {
      if (showLoader) setLoading(true);
      const res = await api.get("/category/list");
      setCategories(res.data.categories || []);
    } catch (err) {
      console.error("Lỗi tải danh sách thể loại:", err);
      showToast("Không thể tải danh sách thể loại", "error");
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const refreshAfterChange = async () => {
    await fetchCategories(false);
    onCategoryUpdated?.();
  };

  const normalizedNames = useMemo(
    () => new Set(categories.map((category) => category.name.trim().toLocaleLowerCase("vi"))),
    [categories],
  );

  const filteredCategories = useMemo(() => {
    const search = searchTerm.trim().toLocaleLowerCase("vi");
    const result = categories.filter((category) => category.name.toLocaleLowerCase("vi").includes(search));

    return result.sort((a, b) => {
      if (sortMode === "usage-desc") {
        return Number(b.game_count || 0) - Number(a.game_count || 0) || a.name.localeCompare(b.name, "vi");
      }
      return sortMode === "name-desc"
        ? b.name.localeCompare(a.name, "vi")
        : a.name.localeCompare(b.name, "vi");
    });
  }, [categories, searchTerm, sortMode]);

  const totalGames = categories.reduce((sum, category) => sum + Number(category.game_count || 0), 0);
  const usedCategories = categories.filter((category) => Number(category.game_count || 0) > 0).length;
  const emptyCategories = categories.length - usedCategories;
  const mostUsedCategory = [...categories].sort((a, b) => Number(b.game_count || 0) - Number(a.game_count || 0))[0];

  const handleAdd = async () => {
    const name = newCategory.trim();
    if (!name) {
      showToast("Vui lòng nhập tên thể loại", "error");
      return;
    }
    if (normalizedNames.has(name.toLocaleLowerCase("vi"))) {
      showToast("Thể loại này đã tồn tại", "error");
      return;
    }

    setActionLoading(true);
    try {
      await api.post("/category/create", { name });
      setNewCategory("");
      await refreshAfterChange();
      showToast("Đã thêm thể loại mới", "success");
    } catch (err: any) {
      showToast(err.response?.data?.error || "Không thể thêm thể loại", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const beginEdit = (category: Category) => {
    setEditId(category.id);
    setEditName(category.name);
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditName("");
  };

  const handleEditSave = async () => {
    const name = editName.trim();
    if (!editId || !name) {
      showToast("Vui lòng nhập tên thể loại", "error");
      return;
    }
    if (name === editId) {
      cancelEdit();
      return;
    }

    const duplicate = categories.some(
      (category) => category.id !== editId && category.name.toLocaleLowerCase("vi") === name.toLocaleLowerCase("vi"),
    );
    if (duplicate) {
      showToast("Tên thể loại này đã tồn tại", "error");
      return;
    }

    setActionLoading(true);
    try {
      await api.post("/category/update", { id: editId, name });
      cancelEdit();
      await refreshAfterChange();
      showToast("Đã cập nhật thể loại", "success");
    } catch (err: any) {
      showToast(err.response?.data?.error || "Không thể cập nhật thể loại", "error");
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionLoading(true);
    try {
      await api.post("/category/delete", { id: deleteTarget.id });
      setDeleteTarget(null);
      await refreshAfterChange();
      showToast("Đã xóa thể loại", "success");
    } catch (err: any) {
      showToast(err.response?.data?.error || "Không thể xóa thể loại", "error");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="col-span-12 flex min-h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <RefreshCw className="h-7 w-7 animate-spin text-indigo-600" />
          <p className="text-sm font-semibold">Đang tải danh sách thể loại...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="col-span-12 space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-6 text-white shadow-xl sm:p-8">
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-indigo-400/10 blur-3xl" />
        <div className="relative grid gap-7 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.7fr)] xl:items-end">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-100">
              <Sparkles className="h-3.5 w-3.5" /> Tổ chức thư viện
            </div>
            <h3 className="max-w-xl text-2xl font-black tracking-tight sm:text-3xl">Phân loại game theo cách của bạn</h3>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-6 text-indigo-100/75">
              Tạo nhóm dễ nhớ, đổi tên đồng bộ cho toàn bộ game và theo dõi nhanh thể loại nào đang được sử dụng nhiều nhất.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/10 p-2 backdrop-blur-xl">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Tag className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-200" />
                <input
                  value={newCategory}
                  onChange={(event) => setNewCategory(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && !actionLoading && handleAdd()}
                  placeholder="Ví dụ: Game nhập vai..."
                  maxLength={80}
                  disabled={actionLoading}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/35 py-3.5 pl-11 pr-4 text-sm font-bold text-white outline-none placeholder:text-indigo-200/50 focus:border-indigo-300/50 focus:ring-4 focus:ring-indigo-300/10"
                />
              </div>
              <button
                onClick={handleAdd}
                disabled={actionLoading || !newCategory.trim()}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-5 py-3.5 text-xs font-black uppercase tracking-wider text-indigo-700 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> Thêm thể loại
              </button>
            </div>
            <p className="px-2 pt-2 text-[10px] font-semibold text-indigo-200/60">Nhấn Enter để thêm nhanh. Tên thể loại không được trùng nhau.</p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Tổng thể loại", value: categories.length, detail: "nhóm trong thư viện", icon: Layers3, style: "bg-indigo-50 text-indigo-600" },
          { label: "Đang sử dụng", value: usedCategories, detail: `${totalGames} game đã phân loại`, icon: Gamepad2, style: "bg-emerald-50 text-emerald-600" },
          { label: "Chưa sử dụng", value: emptyCategories, detail: "có thể dọn dẹp", icon: FolderOpen, style: "bg-amber-50 text-amber-600" },
          { label: "Nổi bật nhất", value: mostUsedCategory?.name || "Chưa có", detail: `${Number(mostUsedCategory?.game_count || 0)} game`, icon: Sparkles, style: "bg-violet-50 text-violet-600" },
        ].map(({ label, value, detail, icon: Icon, style }) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                <p className="mt-2 truncate text-xl font-black text-slate-900 dark:text-white sm:text-2xl">{value}</p>
                <p className="mt-1 truncate text-[11px] font-semibold text-slate-400">{detail}</p>
              </div>
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style}`}><Icon className="h-5 w-5" /></div>
            </div>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-900 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h4 className="text-sm font-black uppercase tracking-widest text-slate-800 dark:text-white">Danh sách thể loại</h4>
              <p className="mt-1 text-xs font-semibold text-slate-500">Chỉnh sửa tên hoặc xóa các nhóm không còn cần thiết.</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(15rem,1fr)_12rem_auto]">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Tìm thể loại..."
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>
              <select
                value={sortMode}
                onChange={(event) => setSortMode(event.target.value as SortMode)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="name-asc">Tên A → Z</option>
                <option value="name-desc">Tên Z → A</option>
                <option value="usage-desc">Nhiều game nhất</option>
              </select>
              <button
                onClick={() => fetchCategories()}
                disabled={loading || actionLoading}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <RefreshCw className="h-4 w-4" /> Làm mới
              </button>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {filteredCategories.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center dark:border-slate-700 dark:bg-slate-800/40">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500"><Tag className="h-6 w-6" /></div>
              <p className="mt-4 text-sm font-black text-slate-700 dark:text-slate-200">{categories.length ? "Không tìm thấy thể loại phù hợp" : "Chưa có thể loại nào"}</p>
              <p className="mt-1 max-w-sm text-xs font-semibold text-slate-400">{categories.length ? "Thử thay đổi từ khóa tìm kiếm hoặc cách sắp xếp." : "Tạo thể loại đầu tiên bằng khung phía trên để bắt đầu tổ chức thư viện."}</p>
              {searchTerm && <button onClick={() => setSearchTerm("")} className="mt-4 text-xs font-black text-indigo-600 hover:underline">Xóa từ khóa tìm kiếm</button>}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {filteredCategories.map((category, index) => {
                const isEditing = editId === category.id;
                const count = Number(category.game_count || 0);
                const gradient = colorForCategory(category.name);

                return (
                  <article key={category.id} className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-100/40 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-indigo-700 dark:hover:shadow-none">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${gradient} text-white shadow-md`}>
                        <Tag className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <input
                            value={editName}
                            onChange={(event) => setEditName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") handleEditSave();
                              if (event.key === "Escape") cancelEdit();
                            }}
                            maxLength={80}
                            autoFocus
                            disabled={actionLoading}
                            className="w-full rounded-xl border border-indigo-300 bg-white px-3 py-2 text-sm font-black text-slate-800 outline-none ring-4 ring-indigo-50 dark:border-indigo-600 dark:bg-slate-900 dark:text-white dark:ring-indigo-950"
                          />
                        ) : (
                          <p className="truncate text-sm font-black text-slate-900 dark:text-white" title={category.name}>{category.name}</p>
                        )}
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${count > 0 ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300"}`}>
                            {count} game
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">#{String(index + 1).padStart(2, "0")}</span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1">
                        {isEditing ? (
                          <>
                            <button onClick={handleEditSave} disabled={actionLoading || !editName.trim()} className="rounded-xl bg-emerald-50 p-2 text-emerald-600 transition hover:bg-emerald-100 disabled:opacity-40 dark:bg-emerald-950 dark:text-emerald-300" title="Lưu"><Check className="h-4 w-4" /></button>
                            <button onClick={cancelEdit} disabled={actionLoading} className="rounded-xl bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300" title="Hủy"><X className="h-4 w-4" /></button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => beginEdit(category)} disabled={actionLoading} className="rounded-xl p-2 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-40 dark:hover:bg-indigo-950" title="Đổi tên"><Edit2 className="h-4 w-4" /></button>
                            <button onClick={() => setDeleteTarget(category)} disabled={actionLoading} className="rounded-xl p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40 dark:hover:bg-red-950" title="Xóa"><Trash2 className="h-4 w-4" /></button>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {filteredCategories.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 text-xs font-semibold text-slate-400 dark:border-slate-800">
              <span>Hiển thị {filteredCategories.length} / {categories.length} thể loại</span>
              <span className="inline-flex items-center gap-1.5"><ArrowDownAZ className="h-3.5 w-3.5" /> {sortMode === "usage-desc" ? "Theo mức sử dụng" : sortMode === "name-desc" ? "Tên giảm dần" : "Tên tăng dần"}</span>
            </div>
          )}
        </div>
      </section>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-white shadow-2xl dark:bg-slate-900">
            <div className="p-6 sm:p-7">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300"><Trash2 className="h-5 w-5" /></div>
              <h4 className="mt-5 text-xl font-black text-slate-900 dark:text-white">Xóa “{deleteTarget.name}”?</h4>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                {Number(deleteTarget.game_count || 0) > 0
                  ? `${deleteTarget.game_count} game trong thể loại này sẽ được chuyển về “Chưa phân loại”.`
                  : "Thể loại này chưa có game nào và sẽ bị xóa khỏi danh sách."}
              </p>
            </div>
            <div className="flex gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
              <button onClick={() => setDeleteTarget(null)} disabled={actionLoading} className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">Hủy</button>
              <button onClick={handleDelete} disabled={actionLoading} className="flex-1 rounded-xl bg-red-600 px-4 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:bg-red-700 disabled:opacity-50">{actionLoading ? "Đang xóa..." : "Xóa thể loại"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoryTab;
