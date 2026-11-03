/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FolderUp } from 'lucide-react';

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 antialiased selection:bg-indigo-500 selection:text-white">
      <div className="max-w-md w-full text-center space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-8 shadow-2xl backdrop-blur-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
          <FolderUp className="h-8 w-8 animate-pulse" />
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-white">
            Dự án đang để trống
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Hệ thống đã sẵn sàng. Bạn hãy tải lên các file mã nguồn hoặc mô tả tiếp dự án của bạn bất cứ lúc nào nhé.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-slate-800/80 px-3 py-1 text-xs font-medium text-slate-300 border border-slate-700/60">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
          Đang chờ tải dữ liệu...
        </div>
      </div>
    </div>
  );
}

