import React, { useEffect, useState } from "react";
import { Edit2, Trash2, Plus } from "lucide-react";
import api from "../../../utils/api";
import { useToast } from "../../../context/ToastContext";

interface Category {
  id: string;
  name: string;
}

interface CategoryTabProps {
  onCategoryUpdated?: () => void;
}

const CategoryTab: React.FC<CategoryTabProps> = ({ onCategoryUpdated }) => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      const res = await api.get("/category/list");
      setCategories(res.data.categories || []);
    } catch (err) {
      console.error("Lỗi tải danh sách thể loại:", err);
      showToast("❌ Lỗi tải danh sách thể loại", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newCategory.trim()) {
      showToast("⚠️ Vui lòng nhập tên thể loại", "error");
      return;
    }
    
    setActionLoading(true);
    try {
      await api.post("/category/create", { name: newCategory.trim() });
      showToast("✅ Thêm thể loại thành công", "success");
      setNewCategory("");
      await fetchCategories();
      onCategoryUpdated?.();
    } catch (err: any) {
      const msg = err.response?.data?.error || "Lỗi thêm thể loại";
      showToast(`❌ ${msg}`, "error");
      console.error("Lỗi thêm thể loại:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEdit = (cat: Category) => {
    setEditId(cat.id);
    setEditName(cat.name);
  };

  const handleEditSave = async () => {
    if (!editName.trim()) {
      showToast("⚠️ Vui lòng nhập tên thể loại", "error");
      return;
    }

    if (editId === editName.trim()) {
      setEditId(null);
      return;
    }

    setActionLoading(true);
    try {
      await api.post(`/category/update`, { id: editId, name: editName.trim() });
      showToast("✅ Cập nhật thể loại thành công", "success");
      setEditId(null);
      setEditName("");
      await fetchCategories();
      onCategoryUpdated?.();
    } catch (err: any) {
      const msg = err.response?.data?.error || "Lỗi cập nhật thể loại";
      showToast(`❌ ${msg}`, "error");
      console.error("Lỗi cập nhật thể loại:", err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Xác nhận xoá thể loại này? Các game sẽ được đặt về 'Chưa phân loại'")) return;
    
    setActionLoading(true);
    try {
      await api.post(`/category/delete`, { id });
      showToast("✅ Xoá thể loại thành công", "success");
      await fetchCategories();
      onCategoryUpdated?.();
    } catch (err: any) {
      const msg = err.response?.data?.error || "Lỗi xoá thể loại";
      showToast(`❌ ${msg}`, "error");
      console.error("Lỗi xoá thể loại:", err);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="col-span-12 flex items-center justify-center py-12">
        <div className="text-slate-500 font-semibold">Đang tải danh sách thể loại...</div>
      </div>
    );
  }

  return (
    <div className="col-span-12 space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
        <h3 className="font-black text-slate-800 text-lg mb-4 flex items-center gap-2">
          <div className="w-2 h-2 bg-indigo-600 rounded-sm"></div>
          QUẢN LÝ THỂ LOẠI
        </h3>

        {/* Add new category */}
        <div className="flex gap-3 mb-6">
          <input
            type="text"
            placeholder="Tên thể loại mới..."
            value={newCategory}
            onChange={e => setNewCategory(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
            disabled={actionLoading}
          />
          <button
            onClick={handleAdd}
            disabled={actionLoading || !newCategory.trim()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" />
            Thêm
          </button>
        </div>

        {/* Categories table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-3 text-left font-bold text-slate-700">STT</th>
                <th className="px-4 py-3 text-left font-bold text-slate-700">Tên thể loại</th>
                <th className="px-4 py-3 text-right font-bold text-slate-700">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {categories.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                    Chưa có thể loại nào
                  </td>
                </tr>
              ) : (
                categories.map((cat, idx) => (
                  <tr key={cat.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-700 font-mono">{idx + 1}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {editId === cat.id ? (
                        <input
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onKeyDown={e => e.key === "Enter" && handleEditSave()}
                          className="w-full px-2 py-1 border border-slate-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
                          autoFocus
                          disabled={actionLoading}
                        />
                      ) : (
                        cat.name
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {editId === cat.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={handleEditSave}
                            disabled={actionLoading}
                            className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 text-white rounded text-xs font-bold transition-all"
                          >
                            Lưu
                          </button>
                          <button
                            onClick={() => setEditId(null)}
                            disabled={actionLoading}
                            className="px-3 py-1 bg-slate-300 hover:bg-slate-400 text-white rounded text-xs font-bold transition-all"
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(cat)}
                            disabled={actionLoading}
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded transition-colors disabled:opacity-50"
                            title="Chỉnh sửa"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(cat.id)}
                            disabled={actionLoading}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                            title="Xoá"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CategoryTab;
