import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeft, Bookmark, CalendarDays, ChevronRight, Download,
  Dumbbell, Filter, History, House, Plus, Search, Settings,
  Trash2, Upload, X, ChevronDown
} from "lucide-react";

type Tab = "today" | "library" | "record" | "history";

const exercises = [
  { name: "四分之三仰卧起坐", tags: "核心 · 自重", color: "bg-[#e9e9e3]", shape: "core" },
  { name: "哑铃侧平举", tags: "肩部 · 哑铃", color: "bg-[#dde0da]", shape: "lift" },
  { name: "杠铃卧推", tags: "胸部 · 杠铃", color: "bg-[#e7e4df]", shape: "bench" },
  { name: "自重深蹲", tags: "腿部 · 自重", color: "bg-[#e4e5dd]", shape: "squat" },
];

function ExerciseVisual({ variant = "core", className = "" }: { variant?: string; className?: string }) {
  const paths: Record<string, string> = {
    core: "M69 28c7 0 12 5 12 12s-5 12-12 12-12-5-12-12 5-12 12-12Zm-22 32 18-11 17 9 21 33-8 5-18-25-12 27-10-4 5-30-20-11-20 12-5-8 23-16Z",
    lift: "M64 29c7 0 12 5 12 12s-5 12-12 12-12-5-12-12 5-12 12-12Zm-17 31 20-11 16 9 17 33-9 4-16-25-5 27-11-1 4-28-17 14-7-7 11-15Zm-27-6h20v8H20zm-7-5h8v18h-8zm25 0h8v18h-8z",
    bench: "M62 29c7 0 12 5 12 12s-5 12-12 12-12-5-12-12 5-12 12-12ZM45 60l22-10 26 17-5 8-21-12-14 19-10-4 2-18ZM93 79l8 28m-40-7-6 14M27 82h68v7H27z",
    squat: "M63 25c7 0 12 5 12 12s-5 12-12 12-12-5-12-12 5-12 12-12Zm-17 31 19-10 17 9 12 17-9 5-10-13-12 8 16 25-10 5-21-26-10 25-11-4 12-34-20 5-2-9 19-5Z",
  };
  return <svg viewBox="0 0 120 120" className={`h-full w-full ${className}`} aria-hidden="true"><path d={paths[variant] ?? paths.core} fill="currentColor" /></svg>;
}

function IconButton({ children, label, onClick }: { children: ReactNode; label: string; onClick?: () => void }) {
  return <button onClick={onClick} aria-label={label} className="grid size-10 shrink-0 place-items-center rounded-full text-[#111] transition hover:bg-black/5 active:scale-95">{children}</button>;
}

function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="mb-3 flex items-end justify-between"><h2 className="text-[18px] font-bold leading-none tracking-[-0.01em]">{children}</h2>{action}</div>;
}

export default function App() {
  const [tab, setTab] = useState<Tab>("today");
  const [screen, setScreen] = useState<"main" | "detail" | "settings" | "history-detail">("main");
  const [favorite, setFavorite] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("全部");
  const [drawer, setDrawer] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [trained, setTrained] = useState(true);
  const [sets, setSets] = useState([{ weight: "40", reps: "10" }, { weight: "40", reps: "10" }, { weight: "35", reps: "12" }]);

  const filtered = useMemo(() => exercises.filter((item) => item.name.includes(search) || item.tags.includes(search)), [search]);
  const openTab = (next: Tab) => { setTab(next); setScreen("main"); };

  const content = () => {
    if (screen === "detail") return <ExerciseDetail onBack={() => setScreen("main")} favorite={favorite} setFavorite={setFavorite} onAdd={() => { setTab("record"); setScreen("main"); }} />;
    if (screen === "settings") return <SettingsPage onBack={() => setScreen("main")} confirm={confirmClear} setConfirm={setConfirmClear} />;
    if (screen === "history-detail") return <HistoryDetail onBack={() => setScreen("main")} />;
    if (tab === "today") return <Today trained={trained} setTrained={setTrained} start={() => openTab("record")} browse={() => openTab("library")} history={() => openTab("history")} settings={() => setScreen("settings")} />;
    if (tab === "library") return <Library search={search} setSearch={setSearch} filter={filter} setFilter={setFilter} exercises={filtered} favorite={favorite} setFavorite={setFavorite} openDetail={() => setScreen("detail")} />;
    if (tab === "record") return <Record sets={sets} setSets={setSets} onAdd={() => setDrawer(true)} />;
    return <HistoryPage openDetail={() => setScreen("history-detail")} />;
  };

  const hideNav = screen === "detail" || screen === "settings" || screen === "history-detail";
  return <main className="min-h-screen bg-[#e9e9e4] font-sans text-[#111] selection:bg-[#c6ff00]">
    <div className="relative mx-auto min-h-screen w-full max-w-[393px] overflow-hidden bg-[#f7f7f2] shadow-[0_0_0_1px_rgba(0,0,0,.06)]">
      <div className={`min-h-screen ${hideNav ? "" : "pb-[94px]"}`}>{content()}</div>
      {!hideNav && <BottomNav tab={tab} setTab={openTab} />}
      {drawer && <AddDrawer close={() => setDrawer(false)} />}
    </div>
  </main>;
}

function Today({ trained, setTrained, start, browse, history, settings }: any) {
  return <div className="px-5 pb-7 pt-5">
    <header className="flex items-center justify-between"><div><div className="font-[DM_Mono] text-[10px] font-medium uppercase tracking-[.18em] text-[#737373]">AMAX / LOCAL</div><h1 className="mt-1 text-[31px] font-extrabold leading-none tracking-[-.03em]">今日训练</h1></div><IconButton label="设置" onClick={settings}><Settings size={20} strokeWidth={1.8}/></IconButton></header>
    <div className="mt-6 overflow-hidden rounded-lg bg-[#181818] p-5 text-white">
      <div className="flex items-start justify-between"><div><div className="font-[DM_Mono] text-[11px] tracking-[.08em] text-white/45">2026.07.26 / SAT</div><h2 className="mt-3 text-[22px] font-bold tracking-[-.02em]">{trained ? "今天已完成训练" : "今天还没记录训练"}</h2></div><button onClick={() => setTrained(!trained)} className={`mt-0.5 flex h-7 items-center gap-1 rounded-full px-2 text-[10px] font-bold ${trained ? "bg-[#c6ff00] text-black" : "border border-white/25 text-white/70"}`}><span className="size-1.5 rounded-full bg-current" />{trained ? "已训练" : "空状态"}</button></div>
      {trained ? <><div className="mt-7 grid grid-cols-3 border-y border-white/15 py-4"><Metric value="4" label="动作"/><Metric value="12" label="组数"/><Metric value="2,680" label="kg" last/></div><button onClick={start} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#ff4d1c] text-[15px] font-bold transition active:scale-[.98]"><Plus size={18}/>继续记录</button></> : <><p className="mt-2 text-sm leading-6 text-white/60">从一组开始，今天的训练将保存在设备上。</p><button onClick={start} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#ff4d1c] text-[15px] font-bold"><Plus size={18}/>开始记录</button></>}
      <button onClick={browse} className="mt-3 w-full text-center text-[13px] font-medium text-white/65">浏览动作库 <span className="ml-1">→</span></button>
    </div>
    <div className="mt-7 grid grid-cols-3 gap-2"><Quick icon={<Search size={18}/>} label="搜动作" onClick={browse}/><Quick icon={<Plus size={18}/>} label="记训练" onClick={start}/><Quick icon={<History size={18}/>} label="看历史" onClick={history}/></div>
    <section className="mt-9"><SectionTitle action={<button onClick={history} className="text-[13px] font-semibold text-[#737373]">全部记录</button>}>最近训练</SectionTitle><button onClick={history} className="w-full border-y border-[#e3e3dc] py-4 text-left"><div className="flex items-start justify-between"><div><div className="text-[15px] font-bold">上肢力量</div><div className="mt-1 text-[12px] text-[#737373]">7月24日 · 胸部 / 肩部</div></div><ChevronRight size={18} className="text-[#9a9a95]"/></div><div className="mt-3 flex gap-4 font-[DM_Mono] text-[11px] text-[#555]"><span>5 动作</span><span>14 组</span><span>3,420 kg</span></div></button></section>
  </div>
}
function Metric({ value, label, last }: any) { return <div className={`px-2 ${!last ? "border-r border-white/15" : ""}`}><div className="font-[DM_Mono] text-[21px] font-medium leading-none">{value}</div><div className="mt-1 text-[11px] text-white/45">{label}</div></div> }
function Quick({ icon, label, onClick }: any) { return <button onClick={onClick} className="flex h-[74px] flex-col items-start justify-between rounded-lg border border-[#e3e3dc] bg-white p-3 text-left transition hover:border-[#a5a59e]"><span>{icon}</span><span className="text-[13px] font-bold">{label}</span></button> }

function Library({ search, setSearch, filter, setFilter, exercises, favorite, setFavorite, openDetail }: any) {
 const filters=["全部","胸部","背部","腿部","肩部","核心"];
 return <div className="px-5 pb-5 pt-5"><header className="flex items-start justify-between"><div><h1 className="text-[31px] font-extrabold leading-none tracking-[-.03em]">动作库</h1><p className="mt-2 text-[13px] text-[#737373]">1,324 个动作</p></div><IconButton label="筛选"><Filter size={20}/></IconButton></header>
 <div className="relative mt-5"><Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#737373]" size={18}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="搜索动作、部位或器械" className="h-12 w-full rounded-lg border border-[#deded7] bg-white pl-10 pr-10 text-[14px] outline-none transition placeholder:text-[#9a9a95] focus:border-[#ff4d1c] focus:ring-2 focus:ring-[#ff4d1c]/10"/>{search && <button onClick={()=>setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#737373]"><X size={17}/></button>}</div>
 <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">{filters.map((item)=><button key={item} onClick={()=>setFilter(item)} className={`h-8 shrink-0 rounded-full px-3 text-[12px] font-bold transition ${filter===item?"bg-[#ff4d1c] text-white":"border border-[#dfdfd8] bg-white text-[#555]"}`}>{item}</button>)}</div>
 <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-5">{exercises.map((item:any,i:number)=><button key={item.name} onClick={openDetail} className="group text-left"><div className={`relative aspect-square overflow-hidden rounded-lg ${item.color}`}><div className="absolute inset-0 grid place-items-center text-[#252525]"><ExerciseVisual variant={item.shape} className="h-[76%] w-[76%] transition duration-300 group-hover:scale-105"/></div><button aria-label="收藏动作" onClick={(e)=>{e.stopPropagation();setFavorite(!favorite)}} className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-white/90"><Bookmark size={15} fill={favorite && i===0 ? "#ff4d1c" : "none"} className={favorite && i===0 ? "text-[#ff4d1c]" : "text-[#333]"}/></button></div><h3 className="mt-2.5 min-h-10 text-[15px] font-bold leading-5 tracking-[-.01em]">{item.name}</h3><p className="mt-1 text-[12px] text-[#737373]">{item.tags}</p></button>)}</div>
 </div>
}

function ExerciseDetail({ onBack, favorite, setFavorite, onAdd }: any) { return <div className="px-5 pb-28 pt-4"><header className="flex items-center justify-between"><IconButton label="返回" onClick={onBack}><ArrowLeft size={21}/></IconButton><div className="text-center"><div className="text-[15px] font-bold">四分之三仰卧起坐</div><div className="mt-0.5 text-[11px] text-[#737373]">核心 · 自重</div></div><IconButton label="收藏" onClick={()=>setFavorite(!favorite)}><Bookmark size={20} fill={favorite?"#ff4d1c":"none"} className={favorite?"text-[#ff4d1c]":""}/></IconButton></header><div className="mt-6 aspect-square rounded-lg bg-[#e8e8e2] p-3"><div className="grid size-full place-items-center rounded-md bg-white text-[#202020]"><ExerciseVisual variant="core" className="h-[84%] w-[84%]"/></div></div><div className="mt-2 text-right font-[DM_Mono] text-[10px] text-[#9a9a95]">© Gym visual</div><section className="mt-6"><SectionTitle>动作信息</SectionTitle><div className="divide-y divide-[#e3e3dc] border-y border-[#e3e3dc] text-[14px]"><Info label="目标肌群" value="腹肌"/><Info label="协同肌群" value="腹斜肌、髋屈肌、下背"/><Info label="器械" value="自重"/><Info label="部位" value="核心"/></div></section><section className="mt-7"><SectionTitle>动作步骤</SectionTitle><ol className="space-y-4">{["仰卧屈膝，双脚平放地面，收紧核心。","上身抬起约四分之三行程，保持下背稳定。","缓慢回到起始位置，完成一次动作。"].map((text,i)=><li key={text} className="flex gap-3 text-[14px] leading-6"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#181818] font-[DM_Mono] text-[11px] text-white">0{i+1}</span><span>{text}</span></li>)}</ol></section><div className="fixed bottom-0 left-1/2 z-10 w-full max-w-[393px] -translate-x-1/2 border-t border-[#e3e3dc] bg-[#f7f7f2]/95 px-5 pb-7 pt-3 backdrop-blur"><button onClick={onAdd} className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#ff4d1c] text-[15px] font-bold text-white"><Plus size={18}/>加入今日训练</button></div></div> }
function Info({ label, value }: any) { return <div className="grid grid-cols-[88px_1fr] gap-4 py-3"><span className="text-[#737373]">{label}</span><span className="text-right font-semibold">{value}</span></div> }

function Record({ sets, setSets, onAdd }: any) {
  const update = (i: number, key: string, val: string) => setSets(sets.map((set: any, index: number) => index === i ? { ...set, [key]: val } : set));
  const addSet = () => setSets([...sets, { ...(sets[sets.length - 1] ?? { weight: "", reps: "" }) }]);
  return <div className="px-5 pb-4 pt-5">
    <header className="flex items-center justify-between"><IconButton label="返回"><ArrowLeft size={21}/></IconButton><h1 className="text-[18px] font-bold">记录训练</h1><button className="h-10 px-1 text-[14px] font-bold text-[#ff4d1c]">完成</button></header>
    <button className="mt-5 flex items-center gap-2 text-[13px] font-medium text-[#555]"><CalendarDays size={16}/>今天，7月26日 <ChevronDown size={15}/></button>
    <div className="mt-5 grid grid-cols-3 rounded-lg border border-[#dfdfd8] bg-white py-3"><Mini value="1" label="动作"/><Mini value={sets.length} label="组数"/><Mini value="1,680" label="kg"/></div>
    <section className="mt-6">
      <div className="flex items-start justify-between"><div className="flex gap-3"><div className="size-12 rounded-md bg-[#e9e9e3] p-1 text-[#202020]"><ExerciseVisual variant="bench"/></div><div><h2 className="text-[16px] font-bold">杠铃卧推</h2><p className="mt-0.5 text-[12px] text-[#737373]">胸部 · 杠铃</p></div></div><IconButton label="删除动作"><Trash2 size={18} className="text-[#737373]"/></IconButton></div>
      <div className="mt-5 rounded-lg border border-[#dfdfd8] bg-white p-2">
        <div className="grid grid-cols-[40px_1fr_1fr_34px] gap-2 px-2 pb-2 text-center font-[DM_Mono] text-[10px] uppercase tracking-[.06em] text-[#8a8a84]"><span>组</span><span>重量 / kg</span><span>次数</span><span/></div>
        <div className="space-y-2">{sets.map((row: any, i: number) => <div key={i} className={`grid grid-cols-[40px_1fr_1fr_34px] items-center gap-2 rounded-md px-2 py-2 ${i === sets.length - 1 ? "bg-[#f0f0ea]" : "bg-[#f7f7f3]"}`}>
          <span className={`grid size-8 place-items-center rounded-md font-[DM_Mono] text-[12px] font-medium ${i === sets.length - 1 ? "bg-[#181818] text-white" : "bg-white text-[#74746e]"}`}>{String(i + 1).padStart(2, "0")}</span>
          <label className="min-w-0 border-b border-[#d3d3cc] pb-1"><input aria-label={`第 ${i + 1} 组重量`} value={row.weight} onChange={e => update(i, "weight", e.target.value)} inputMode="decimal" className="w-full min-w-0 bg-transparent p-0 text-center font-[DM_Mono] text-[20px] font-medium leading-none outline-none placeholder:text-[#b2b2aa] focus:border-[#ff4d1c]"/><span className="sr-only">公斤</span></label>
          <label className="min-w-0 border-b border-[#d3d3cc] pb-1"><input aria-label={`第 ${i + 1} 组次数`} value={row.reps} onChange={e => update(i, "reps", e.target.value)} inputMode="numeric" className="w-full min-w-0 bg-transparent p-0 text-center font-[DM_Mono] text-[20px] font-medium leading-none outline-none placeholder:text-[#b2b2aa]"/><span className="sr-only">次</span></label>
          <button onClick={() => setSets(sets.filter((_: any, index: number) => index !== i))} aria-label={`删除第 ${i + 1} 组`} className="grid size-9 place-items-center rounded-full text-[#8a8a84] transition hover:bg-white hover:text-[#d92d20]"><X size={18}/></button>
        </div>)}</div>
        <button onClick={addSet} className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-md border border-dashed border-[#c8c8c0] bg-[#fafaf7] text-[13px] font-bold text-[#181818] transition hover:border-[#ff4d1c] hover:text-[#ff4d1c]"><Plus size={17}/>添加一组 <span className="font-normal text-[#898983]">· 沿用上一组</span></button>
      </div>
    </section>
    <button onClick={onAdd} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#181818] text-[15px] font-bold text-white"><Plus size={18}/>添加动作</button>
  </div>;
}
function Mini({value,label}:any){return <div className="border-r border-[#e3e3dc] px-4 last:border-0"><div className="font-[DM_Mono] text-[17px] font-medium">{value}</div><div className="mt-1 text-[11px] text-[#737373]">{label}</div></div>}

function HistoryPage({openDetail}:any){ const days=["一","二","三","四","五","六","日"]; return <div className="px-5 pb-5 pt-5"><header><h1 className="text-[31px] font-extrabold leading-none tracking-[-.03em]">训练历史</h1><p className="mt-2 text-[13px] text-[#737373]">本地记录</p></header><div className="mt-6 grid grid-cols-3 rounded-lg bg-[#181818] py-4 text-white"><MiniDark value="8" label="本月训练"/><MiniDark value="86" label="总组数"/><MiniDark value="18.4k" label="总训练量"/></div><section className="mt-7"><div className="flex items-center justify-between"><h2 className="text-[18px] font-bold">2026年 7月</h2><div className="flex gap-2"><ChevronDown size={17}/></div></div><div className="mt-4 grid grid-cols-7 text-center font-[DM_Mono] text-[10px] text-[#9a9a95]">{days.map(d=><span key={d}>{d}</span>)}</div><div className="mt-2 grid grid-cols-7 gap-y-2 text-center text-[13px]">{Array.from({length:31},(_,i)=>i+1).map(d=><div key={d} className="relative grid h-8 place-items-center">{d===26?<span className="grid size-8 place-items-center rounded-full border-2 border-[#181818] font-bold">{d}</span>:<span className={(d===4||d===8||d===14||d===19||d===24)?"grid size-7 place-items-center rounded-full bg-[#ff4d1c] text-white":""}>{d}</span>}</div>)}</div></section><section className="mt-8"><SectionTitle>训练记录</SectionTitle><div className="divide-y divide-[#e3e3dc] border-y border-[#e3e3dc]">{[["7月24日","上肢力量","5 动作 · 14 组 · 3,420 kg","胸部","肩部"],["7月19日","下肢训练","4 动作 · 12 组 · 4,160 kg","腿部","核心"]].map(row=><button key={row[0]} onClick={openDetail} className="w-full py-4 text-left"><div className="flex items-center justify-between"><div><div className="text-[15px] font-bold">{row[1]}</div><div className="mt-1 text-[12px] text-[#737373]">{row[0]} · {row[2]}</div></div><ChevronRight size={18} className="text-[#9a9a95]"/></div><div className="mt-3 flex gap-1.5"><span className="rounded-full bg-[#eeeee9] px-2 py-1 text-[10px] font-bold">{row[3]}</span><span className="rounded-full bg-[#eeeee9] px-2 py-1 text-[10px] font-bold">{row[4]}</span></div></button>)}</div></section></div> }
function MiniDark({value,label}:any){return <div className="border-r border-white/15 px-4 last:border-0"><div className="font-[DM_Mono] text-[17px] font-medium">{value}</div><div className="mt-1 text-[10px] text-white/45">{label}</div></div>}
function HistoryDetail({onBack}:any){return <div className="px-5 pt-4"><header className="flex items-center gap-2"><IconButton label="返回" onClick={onBack}><ArrowLeft size={21}/></IconButton><div><h1 className="text-[18px] font-bold">训练详情</h1><p className="text-[11px] text-[#737373]">2026年7月24日</p></div></header><div className="mt-6 grid grid-cols-3 rounded-lg bg-[#181818] py-4 text-white"><MiniDark value="5" label="动作"/><MiniDark value="14" label="组数"/><MiniDark value="3,420" label="kg"/></div><section className="mt-7"><SectionTitle>动作明细</SectionTitle><div className="border-t border-[#e3e3dc]"><DetailRow name="杠铃卧推" tag="胸部 · 杠铃" sets={["第 1 组，40 kg × 10 次","第 2 组，40 kg × 10 次","第 3 组，35 kg × 12 次"]}/><DetailRow name="哑铃侧平举" tag="肩部 · 哑铃" sets={["第 1 组，8 kg × 12 次","第 2 组，8 kg × 12 次"]}/></div></section></div>}
function DetailRow({name,tag,sets}:any){return <div className="border-b border-[#e3e3dc] py-4"><h3 className="text-[15px] font-bold">{name}</h3><p className="mt-1 text-[12px] text-[#737373]">{tag}</p><div className="mt-3 space-y-1 font-[DM_Mono] text-[11px] text-[#555]">{sets.map((s:string)=><p key={s}>{s}</p>)}</div></div>}

function SettingsPage({onBack,confirm,setConfirm}:any){return <div className="px-5 pt-4"><header className="flex items-center gap-2"><IconButton label="返回" onClick={onBack}><ArrowLeft size={21}/></IconButton><h1 className="text-[18px] font-bold">设置</h1></header><section className="mt-7"><SectionTitle>数据状态</SectionTitle><div className="rounded-lg border border-[#dfdfd8] bg-white p-4"><p className="text-[14px] font-semibold">训练记录保存在当前设备</p><div className="mt-4 grid grid-cols-2 border-t border-[#e9e9e3] pt-4"><div><div className="font-[DM_Mono] text-[20px]">18</div><div className="mt-1 text-[11px] text-[#737373]">训练记录</div></div><div><div className="text-[14px] font-bold">尚未导出</div><div className="mt-1 text-[11px] text-[#737373]">最近备份</div></div></div></div></section><section className="mt-7"><SectionTitle>数据操作</SectionTitle><div className="divide-y divide-[#e3e3dc] border-y border-[#e3e3dc]"><SettingButton icon={<Download size={18}/>} text="导出 JSON"/><SettingButton icon={<Upload size={18}/>} text="导入 JSON"/><SettingButton icon={<Trash2 size={18}/>} text="清空本地数据" danger onClick={()=>setConfirm(true)}/></div></section><section className="mt-7"><SectionTitle>关于动作素材</SectionTitle><div className="space-y-2 text-[13px]"><div className="flex justify-between"><span className="text-[#737373]">动作数据来源</span><span className="font-medium">ExerciseDB</span></div><div className="flex justify-between"><span className="text-[#737373]">媒体归属</span><span className="font-medium">© Gym visual</span></div></div></section>{confirm&&<div className="fixed inset-0 z-30 grid place-items-end bg-black/35 px-4 pb-5"><div className="w-full max-w-[361px] rounded-xl bg-white p-5"><div className="flex size-10 items-center justify-center rounded-full bg-[#fff0ef] text-[#d92d20]"><Trash2 size={19}/></div><h2 className="mt-4 text-[20px] font-bold">清空本地数据？</h2><p className="mt-2 text-[13px] leading-5 text-[#737373]">此操作会删除当前设备上的 18 条训练记录，且无法恢复。</p><button onClick={()=>setConfirm(false)} className="mt-5 h-11 w-full rounded-lg bg-[#d92d20] text-[14px] font-bold text-white">确认清空</button><button onClick={()=>setConfirm(false)} className="mt-2 h-10 w-full text-[14px] font-bold">取消</button></div></div>}</div>}
function SettingButton({icon,text,danger,onClick}:any){return <button onClick={onClick} className={`flex h-14 w-full items-center justify-between text-left ${danger?"text-[#d92d20]":""}`}><span className="flex items-center gap-3 text-[14px] font-semibold">{icon}{text}</span><ChevronRight size={18}/></button>}

function AddDrawer({close}:any){return <div className="fixed inset-0 z-20 mx-auto flex max-w-[393px] flex-col justify-end bg-black/30" onClick={close}><div onClick={e=>e.stopPropagation()} className="rounded-t-xl bg-[#f7f7f2] px-5 pb-7 pt-3 shadow-2xl"><div className="mx-auto h-1 w-10 rounded-full bg-[#c7c7c0]"/><div className="mt-5 flex items-center justify-between"><h2 className="text-[20px] font-bold">添加动作</h2><IconButton label="关闭" onClick={close}><X size={20}/></IconButton></div><div className="relative mt-3"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#737373]" size={17}/><input placeholder="搜索动作" className="h-11 w-full rounded-lg border border-[#dfdfd8] bg-white pl-9 text-[13px] outline-none focus:border-[#ff4d1c]"/></div><div className="mt-3 flex gap-2"><span className="rounded-full bg-[#ff4d1c] px-3 py-1.5 text-[11px] font-bold text-white">全部</span><span className="rounded-full border border-[#dfdfd8] bg-white px-3 py-1.5 text-[11px] font-bold">胸部</span><span className="rounded-full border border-[#dfdfd8] bg-white px-3 py-1.5 text-[11px] font-bold">核心</span></div><button onClick={close} className="mt-4 flex w-full items-center gap-3 border-t border-[#e3e3dc] py-3 text-left"><div className="size-12 rounded-md bg-[#e9e9e3] p-1"><ExerciseVisual variant="core"/></div><div><div className="text-[14px] font-bold">四分之三仰卧起坐</div><div className="mt-1 text-[11px] text-[#737373]">核心 · 自重</div></div><Plus className="ml-auto text-[#ff4d1c]" size={20}/></button></div></div>}

function BottomNav({tab,setTab}:any){const items:[Tab,string,any][]=[["today","今日",House],["library","动作库",Dumbbell],["record","记录",Plus],["history","历史",History]];return <nav className="fixed bottom-0 left-1/2 z-10 flex h-[78px] w-full max-w-[393px] -translate-x-1/2 border-t border-[#e3e3dc] bg-[#f7f7f2]/95 px-4 pb-4 pt-2 backdrop-blur">{items.map(([key,label,Icon])=><button key={key} onClick={()=>setTab(key)} className={`flex flex-1 flex-col items-center gap-1 text-[10px] font-bold ${tab===key?"text-[#ff4d1c]":"text-[#777770]"}`}><span className={`grid size-7 place-items-center rounded-full ${tab===key?"bg-[#ff4d1c]/10":""}`}><Icon size={19} strokeWidth={tab===key?2.4:1.8}/></span>{label}</button>)}</nav>}
