
import React from 'react';
import { Gamepad2, Clock, Upload, Download, Trash2, Pencil } from 'lucide-react';
import { GameSave } from '../types';

interface LibraryTabProps {
  loading: boolean;
  games: GameSave[];
  filteredGames: GameSave[];
  handleOpenUpdate: (game: GameSave) => void;
  handleOpenHistory: (game: GameSave) => void;
  handleDownload: (id: number) => void;
  handleDelete: (id: number) => void;
  handleOpenRenameModal: (game: GameSave) => void;
  formatSize: (bytes: number) => string;
}

const LibraryTab: React.FC<LibraryTabProps> = ({
  loading, games, filteredGames, 
  handleOpenUpdate, handleOpenHistory, handleDownload, handleDelete, handleOpenRenameModal, formatSize
}) => {
  return (
    <div className="col-span-12 space-y-8">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white rounded-t-2xl">
          <h3 className="font-black text-slate-800 text-sm tracking-tight flex items-center gap-2">
             <div className="w-2 h-2 bg-indigo-600 rounded-sm"></div>
             THƯ VIỆN BẢN LƯU
          </h3>
          <span className="hidden sm:block text-[10px] text-slate-400 font-mono font-bold bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 uppercase">
            Truy vấn: SELECT * FROM saves
          </span>
        </div>
        
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 flex justify-center text-slate-300"><div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>
          ) : games.length === 0 ? (
            <div className="p-20 text-center text-slate-400 font-medium italic">Không tìm thấy bản lưu nào.</div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-widest">
                <tr className="border-b border-slate-100">
                  <th className="px-6 py-4 font-black">Tên Game</th>
                  <th className="px-6 py-4 font-black">Phiên bản</th>
                  <th className="px-6 py-4 font-black">Thời gian</th>
                  <th className="px-6 py-4 font-black">Dung lượng</th>
                  <th className="px-6 py-4 font-black text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-slate-600">
                {filteredGames.map((game) => (
                  <tr key={game.id} className="hover:bg-slate-50/70 transition-colors group">
                    <td className="px-6 py-4 cursor-pointer" onClick={() => handleOpenUpdate(game)}>
                       <div className="flex items-center gap-3 group/game">
                          <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-500 group-hover/game:bg-indigo-600 group-hover/game:text-white transition-all shadow-sm">
                             <Gamepad2 className="w-4 h-4" />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-800 tracking-tight group-hover/game:text-indigo-600 transition-colors">{game.gameName}</span>
                            <span className="text-[9px] text-indigo-500 uppercase font-black tracking-widest">{game.category}</span>
                          </div>
                       </div>
                    </td>
                    <td className="px-6 py-4">
                       <span className="font-mono text-xs font-bold text-indigo-500 bg-indigo-50/50 px-2 py-0.5 rounded border border-indigo-100">v{game.latestSave?.version || 1}.0</span>
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-slate-400">
                       {game.latestSave ? new Date(game.latestSave.createdAt).toLocaleDateString('vi-VN') : '--'}
                       <span className="block opacity-60 text-[10px] uppercase tracking-tighter mt-1">{game.latestSave ? new Date(game.latestSave.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-700">
                       {game.latestSave ? formatSize(game.latestSave.fileSize) : '0 B'}
                    </td>
                    <td className="px-6 py-4 text-right">
                       <div className="flex items-center justify-end gap-1.5 transition-all">
                         <button 
                           onClick={() => handleOpenHistory(game)}
                           className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all font-bold"
                           title="Lịch sử phiên bản"
                         >
                           <Clock className="w-4 h-4" />
                         </button>
                         <button 
                           onClick={() => handleOpenUpdate(game)}
                           className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all"
                           title="Cập nhật bản lưu (Upload new version)"
                         >
                           <Upload className="w-4 h-4" />
                         </button>
                         <button 
                           onClick={() => handleOpenRenameModal(game)}
                           className="p-2 text-slate-400 hover:text-amber-600 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all"
                           title="Chỉnh sửa tên game"
                         >
                           <Pencil className="w-4 h-4" />
                         </button>
                         <button 
                           onClick={() => game.latestSave && handleDownload(game.latestSave.id)}
                           className="p-2 text-indigo-600 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all font-bold"
                           title="Download"
                         >
                           <Download className="w-4 h-4" />
                         </button>
                         <button 
                           onClick={() => game.latestSave && handleDelete(game.latestSave.id)}
                           className="p-2 text-slate-400 hover:text-red-500 hover:bg-white rounded-lg border border-transparent hover:border-slate-200 transition-all"
                           title="Delete"
                         >
                           <Trash2 className="w-4 h-4" />
                         </button>
                       </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default LibraryTab;
