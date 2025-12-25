
import React, { useState, useRef, useEffect } from 'react';
import { AppStatus, ImageFile, EvaluationResult, HistoryItem } from './types';
import { evaluatePhotography } from './services/geminiService';

const App: React.FC = () => {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  
  // 仅保留 Base URL 状态，API Key 强制使用 process.env.API_KEY
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 初始化加载
  useEffect(() => {
    // 加载历史
    const savedHistory = localStorage.getItem('focuslens_history');
    if (savedHistory) {
      try { setHistory(JSON.parse(savedHistory)); } catch (e) {}
    }
    // 加载配置
    const savedBaseUrl = localStorage.getItem('focuslens_base_url');
    if (savedBaseUrl) setBaseUrl(savedBaseUrl);
  }, []);

  // 监听历史记录变化
  useEffect(() => {
    localStorage.setItem('focuslens_history', JSON.stringify(history.slice(0, 20)));
  }, [history]);

  const saveSettings = () => {
    localStorage.setItem('focuslens_base_url', baseUrl);
    setIsSettingsOpen(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newImages: Promise<ImageFile>[] = Array.from(files).map((file: File) => {
      return new Promise<ImageFile>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve({
            id: Math.random().toString(36).substr(2, 9),
            file,
            preview: URL.createObjectURL(file),
            base64: reader.result as string
          });
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(newImages).then(resolvedImages => {
      setImages(prev => [...prev, ...resolvedImages]);
      if (status === AppStatus.SUCCESS) {
        setResult(null);
        setStatus(AppStatus.IDLE);
      }
    });
  };

  const removeImage = (id: string) => {
    setImages(prev => {
      const filtered = prev.filter(img => img.id !== id);
      const removed = prev.find(img => img.id === id);
      if (removed && removed.file) URL.revokeObjectURL(removed.preview);
      return filtered;
    });
  };

  const startEvaluation = async () => {
    if (images.length === 0) return;

    setStatus(AppStatus.LOADING);
    setError(null);
    setResult(null);

    try {
      const base64List = images.map(img => img.base64);
      // 直接从环境变量获取 API KEY
      const apiKey = process.env.API_KEY || '';
      const markdown = await evaluatePhotography(base64List, apiKey, baseUrl);
      
      const newResult = {
        markdown,
        timestamp: Date.now()
      };
      
      setResult(newResult);
      setStatus(AppStatus.SUCCESS);

      const ratingMatch = markdown.match(/综合评分.*[:：]\s*[\[【\*]*\s*([SABCD])\s*[\]】\*]*/i);
      const rating = ratingMatch ? ratingMatch[1].toUpperCase() : '-';

      const newHistoryItem: HistoryItem = {
        id: Math.random().toString(36).substr(2, 9),
        images: [...images],
        result: newResult,
        mainRating: rating
      };
      setHistory(prev => [newHistoryItem, ...prev]);

      setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }, 100);
    } catch (err: any) {
      setError(err.message || '评审失败');
      setStatus(AppStatus.ERROR);
    }
  };

  const downloadReport = () => {
    if (!result) return;
    const blob = new Blob([result.markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FocusLens_评审报告_${new Date(result.timestamp).toLocaleDateString()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const loadHistoryItem = (item: HistoryItem) => {
    setImages(item.images);
    setResult(item.result);
    setStatus(AppStatus.SUCCESS);
    setIsHistoryOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteHistoryItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const resetApp = () => {
    images.forEach(img => { if(img.file) URL.revokeObjectURL(img.preview) });
    setImages([]);
    setStatus(AppStatus.IDLE);
    setResult(null);
    setError(null);
  };

  return (
    <div className="min-h-screen pb-20 bg-slate-50 relative overflow-x-hidden">
      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-md transition-all">
          <div className="bg-white rounded-[2rem] w-full max-w-md p-8 shadow-2xl border border-slate-100 animate-in zoom-in duration-200">
            <h2 className="text-2xl font-black text-slate-900 mb-2">服务设置</h2>
            <p className="text-sm text-slate-500 mb-6 font-medium">配置自定义接口地址。如果您使用代理，请在此输入。</p>
            
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">API Base URL (可选)</label>
                <input 
                  type="text" 
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="例如: https://proxy.yourdomain.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
                <div className="mt-3 bg-blue-50 p-3 rounded-lg border border-blue-100">
                   <p className="text-[10px] text-blue-700 leading-relaxed font-bold">
                    💡 注意：请勿输入带有 /v1 或 /v1beta 的路径。SDK 会自动补全版本后缀。例如输入：https://api.domain.com
                   </p>
                </div>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors"
                >
                  取消
                </button>
                <button 
                  onClick={saveSettings}
                  className="flex-1 py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all"
                >
                  保存配置
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-[70] mt-[73px] w-80 bg-white shadow-2xl transform transition-transform duration-500 ease-out border-r border-slate-100 ${isHistoryOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex flex-col h-full pb-[73px]">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-900">历史评审</h2>
            <button onClick={() => setIsHistoryOpen(false)} className="text-slate-400 hover:text-slate-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {history.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-slate-400 text-sm font-medium">暂无历史记录</p>
              </div>
            ) : (
              history.map(item => (
                <div 
                  key={item.id} 
                  onClick={() => loadHistoryItem(item)}
                  className="group relative bg-slate-50 rounded-2xl p-3 border border-transparent hover:border-blue-200 hover:bg-white hover:shadow-md transition-all cursor-pointer"
                >
                  <div className="flex gap-3">
                    <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-slate-200">
                      <img src={item.images[0]?.preview} alt="Thumb" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <span className={`text-xs font-black px-2 py-0.5 rounded-md ${
                          item.mainRating === 'S' ? 'bg-yellow-100 text-yellow-700' : 
                          item.mainRating === 'A' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                        }`}>
                          评分 {item.mainRating}
                        </span>
                        <button 
                          onClick={(e) => deleteHistoryItem(e, item.id)}
                          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-opacity"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold mt-2 truncate">
                        {new Date(item.result.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
          {history.length > 0 && (
            <div className="p-4 border-t border-slate-100">
              <button 
                onClick={() => { if(confirm('确定清空所有记录？')) setHistory([]) }}
                className="w-full py-3 text-xs font-bold text-slate-400 hover:text-red-500 transition-colors"
              >
                清空历史
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-[80] glass-header px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsHistoryOpen(!isHistoryOpen)}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-600 mr-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-500/10">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-900">FocusLens AI</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Expert Photography Curator</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className={`p-2 rounded-xl transition-all text-slate-400 hover:text-blue-600 hover:bg-slate-100`}
            title="接口设置"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button 
            onClick={resetApp}
            className="text-sm font-medium text-slate-500 hover:text-blue-600 transition-colors flex items-center gap-1.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            重置
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 pt-16">
        <section className="mb-16 text-center">
          <h2 className="text-5xl font-black mb-6 text-slate-900 tracking-tight">
            深度洞察摄影之美
          </h2>
          <p className="text-slate-500 text-lg max-w-2xl mx-auto font-medium">
            基于 20 年策展经验的 AI 导师。提供犀利、专业且具启发性的作品分析，助力每一位拍摄者的技术成长。
          </p>
        </section>

        {/* Upload Section */}
        <section className="mb-16">
          <div 
            onClick={() => fileInputRef.current?.click()}
            className={`tech-card rounded-3xl p-12 flex flex-col items-center justify-center cursor-pointer transition-all hover:shadow-2xl hover:border-blue-200 group ${
              images.length > 0 ? 'border-blue-100 bg-blue-50/30' : 'border-slate-200'
            }`}
          >
            <input 
              type="file" 
              multiple 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleFileChange}
            />
            <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110">
              <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
            <p className="text-xl font-bold text-slate-900">上传您的摄影作品</p>
            <p className="text-sm text-slate-400 mt-2 font-medium">支持多图上传 · AI 将根据整组氛围进行评审</p>
          </div>

          {images.length > 0 && (
            <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-6">
              {images.map(img => (
                <div key={img.id} className="relative group aspect-square rounded-2xl overflow-hidden shadow-sm border border-slate-100 bg-white">
                  <img src={img.preview} alt="Preview" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
                  <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button 
                      onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                      className="bg-white p-3 rounded-2xl text-red-600 shadow-xl hover:bg-red-50 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {images.length > 0 && status !== AppStatus.LOADING && (
            <div className="mt-12 flex justify-center">
              <button 
                onClick={startEvaluation}
                className="bg-slate-900 hover:bg-slate-800 text-white px-12 py-5 rounded-2xl font-bold text-lg shadow-xl shadow-slate-200 transition-all flex items-center gap-4 active:scale-95"
              >
                生成评审报告
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 1 1-7.6-11.7 1.2 1.2 0 1 1 0 2.4 6.1 6.1 0 1 0 5.4 8.3 1.2 1.2 0 1 1 2.2 1.1z"/><path d="m21 3-9 9"/><path d="M15 3h6v6"/></svg>
              </button>
            </div>
          )}
        </section>

        {/* Loading State */}
        {status === AppStatus.LOADING && (
          <div className="flex flex-col items-center py-24 text-center">
            <div className="relative w-16 h-16 mb-8">
              <div className="absolute inset-0 border-[3px] border-blue-100 rounded-full"></div>
              <div className="absolute inset-0 border-[3px] border-t-blue-600 rounded-full animate-spin"></div>
            </div>
            <h3 className="text-2xl font-black text-slate-900 mb-3">导师正在深度审阅</h3>
            <p className="text-slate-500 font-medium italic">“优秀的摄影不只是快门，更是对光影的理解...”</p>
          </div>
        )}

        {/* Error State */}
        {status === AppStatus.ERROR && (
          <div className="bg-red-50 border border-red-100 rounded-3xl p-8 text-center mb-16 shadow-sm">
            <p className="text-red-600 font-bold mb-4">{error}</p>
            <button 
              onClick={startEvaluation}
              className="text-sm font-bold text-red-700 bg-red-100 px-6 py-2 rounded-xl hover:bg-red-200 transition-colors"
            >
              重新尝试
            </button>
          </div>
        )}

        {/* Result Display */}
        {result && status === AppStatus.SUCCESS && (
          <div className="tech-card rounded-[2.5rem] p-10 md:p-16 shadow-2xl animate-in fade-in slide-in-from-bottom-12 duration-1000">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12 pb-8 border-b border-slate-100">
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-slate-50 shadow-sm">
                  <img src="https://picsum.photos/id/64/200/200" alt="Mentor" className="w-full h-full object-cover" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 leading-tight">专业视觉评审报告</h3>
                  <p className="text-sm text-slate-400 font-bold mt-1 uppercase tracking-widest">{new Date(result.timestamp).toLocaleDateString()}</p>
                </div>
              </div>
              <div className="flex gap-3">
                 <button 
                  onClick={downloadReport}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-900 px-6 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  下载报告
                </button>
              </div>
            </div>
            
            <div className="markdown-content" dangerouslySetInnerHTML={{ 
              __html: formatMarkdown(result.markdown) 
            }} />
            
            <div className="mt-16 pt-10 border-t border-slate-100 flex flex-col items-center">
              <div className="bg-slate-50 px-6 py-3 rounded-2xl flex items-center gap-3 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span className="text-slate-500 text-sm font-bold">FocusLens AI Curator Engine v3.0</span>
              </div>
              <p className="text-slate-400 text-xs italic">评审结果由系统预设 API 提供技术支持</p>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-32 py-16 px-6 text-center">
        <div className="max-w-4xl mx-auto flex flex-col items-center gap-4">
           <div className="bg-slate-200 h-[1px] w-12 mb-4"></div>
           <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">FocusLens AI</p>
           <p className="text-slate-400 text-xs">© 2026. Designed for visual excellence.</p>
        </div>
      </footer>
    </div>
  );
};

function formatMarkdown(md: string): string {
  let html = md;
  
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  const lines = html.split('\n');
  let inList = false;
  const newLines = lines.map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
      const content = trimmed.substring(2);
      let res = `<li>${content}</li>`;
      if (!inList) {
        res = `<ul>${res}`;
        inList = true;
      }
      return res;
    } else {
      let res = line;
      if (inList) {
        res = `</ul>${line}`;
        inList = false;
      }
      if (trimmed === '---') return '<hr />';
      if (trimmed && !trimmed.startsWith('<h') && !trimmed.startsWith('<u') && !trimmed.startsWith('<l')) {
          return `<p>${trimmed}</p>`;
      }
      return res;
    }
  });
  
  return newLines.join('');
}

export default App;
