
import React from 'react';
import { Clock, Download, Gamepad2 } from 'lucide-react';
import StatCards from '../StatCards';
import { GameSave } from '../types';

interface OverviewTabProps {
  games: GameSave[];
  setActiveTab: (tab: string) => void;
  handleOpenHistory: (game: GameSave) => void;
  handleDownload: (id: number) => void;
}

const OverviewTab: React.FC<OverviewTabProps> = ({ 
  games, setActiveTab, handleOpenHistory, handleDownload 
}) => {
  return (
    <div className="col-span-12 space-y-8">
      <StatCards games={games} />

      {games.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-dashed border-slate-200">
            <Gamepad2 className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-800">Chưa có bản lưu</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mt-2">
            Hãy tải lên bản lưu game của bạn từ mục "Đẩy bản lưu mới".
          </p>
        </div>
      ) : (
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-white rounded-t-2xl">
          <h3 className="font-black text-slate-800 text-sm tracking-tight flex items-center gap-2">
            <div className="w-2 h-2 bg-indigo-600 rounded-sm"></div>
            BẢN LƯU MỚI NHẤT
          </h3>
          <button onClick={() => setActiveTab('library')} className="text-[10px] text-indigo-600 font-bold hover:underline">Xem tất cả</button>
        </div>
        <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-slate-50 text-slate-600">
                {games.slice(0, 5).map((game) => (
                  <tr key={game.id} className="hover:bg-slate-50/70 transition-colors group">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-slate-800 text-xs">{game.gameName}</span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-[10px] text-slate-400 font-medium">
                      {game.latestSave ? new Date(game.latestSave.createdAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '--'}
                    </td>
                    <td className="px-6 py-3 text-right">
                       <div className="flex items-center justify-end gap-2">
                         <span className="text-[10px] font-mono font-bold text-indigo-500">v{game.versions}.0</span>
                         <button 
                           onClick={() => handleOpenHistory(game)}
                           className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-md transition-all"
                           title="Xem lịch sử"
                         >
                           <Clock className="w-3 h-3" />
                         </button>
                         {game.latestSave && (
                           <button 
                             onClick={() => game.latestSave && handleDownload(game.latestSave.id)}
                             className="p-1.5 text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-md transition-all shadow-sm"
                             title="Tải xuống nhanh"
                           >
                             <Download className="w-3 h-3" />
                           </button>
                         )}
                       </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
      </div>
      )}
    </div>
  );
};

export default OverviewTab;
