'use client';

import React, { useState, useEffect, useRef } from 'react';
import { SongProject } from '@/types/song';
import { createDefaultSong } from '@/lib/defaultSong';
import {
  getSavedSongs,
  saveSong,
  deleteSong,
  duplicateSong,
  exportAllSongsJSON,
  importSongsJSON,
} from '@/lib/storage';
import { useLanguage } from '@/context/LanguageContext';

interface SongLibraryModalProps {
  isOpen: boolean;
  currentSong: SongProject;
  onSelectSong: (song: SongProject) => void;
  onClose: () => void;
}

export const SongLibraryModal: React.FC<SongLibraryModalProps> = ({
  isOpen,
  currentSong,
  onSelectSong,
  onClose,
}) => {
  const { lang } = useLanguage();
  const [songs, setSongs] = useState<SongProject[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // โหลดรายการเพลงจาก storage เมื่อเปิด modal
  useEffect(() => {
    if (isOpen) {
      setSongs(getSavedSongs());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const showFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const handleCreateNew = () => {
    const title = prompt(
      lang === 'th' ? 'ตั้งชื่อเพลงใหม่:' : 'Enter new song title:',
      lang === 'th' ? 'เพลงใหม่ของฉัน' : 'My New Song'
    );
    if (!title) return;
    const newSong = createDefaultSong();
    newSong.id = `song-${Date.now()}`;
    newSong.title = title.trim();
    saveSong(newSong);
    setSongs(getSavedSongs());
    onSelectSong(newSong);
    onClose();
  };

  const handleSelect = (song: SongProject) => {
    onSelectSong(song);
    onClose();
  };

  const handleDuplicate = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const copy = duplicateSong(id);
    if (copy) {
      setSongs(getSavedSongs());
      showFeedback(lang === 'th' ? `ทำสำเนาเป็น "${copy.title}" เรียบร้อยแล้ว` : `Duplicated as "${copy.title}"`);
    }
  };

  const handleDelete = (id: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (songs.length <= 1) {
      alert(
        lang === 'th'
          ? 'ไม่สามารถลบได้ เนื่องจากต้องมีเพลงในระบบอย่างน้อย 1 เพลงครับ'
          : 'Cannot delete. You must have at least 1 song in your library.'
      );
      return;
    }
    if (confirm(lang === 'th' ? `คุณต้องการลบเพลง "${title}" ใช่หรือไม่?` : `Are you sure you want to delete "${title}"?`)) {
      const ok = deleteSong(id);
      if (ok) {
        const remaining = getSavedSongs();
        setSongs(remaining);
        if (currentSong.id === id && remaining.length > 0) {
          onSelectSong(remaining[0]);
        }
        showFeedback(lang === 'th' ? `ลบเพลง "${title}" เรียบร้อย` : `Deleted "${title}" successfully`);
      }
    }
  };

  const startRename = (id: string, current: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(id);
    setEditTitle(current);
  };

  const submitRename = (id: string, e?: React.FormEvent) => {
    e?.preventDefault();
    if (!editTitle.trim()) return;
    const target = songs.find((s) => s.id === id);
    if (target) {
      const updated = { ...target, title: editTitle.trim() };
      saveSong(updated);
      setSongs(getSavedSongs());
      if (currentSong.id === id) {
        onSelectSong(updated);
      }
      showFeedback(`เปลี่ยนชื่อเป็น "${editTitle.trim()}" เรียบร้อย`);
    }
    setEditingId(null);
  };

  const handleExportBackup = () => {
    const jsonStr = exportAllSongsJSON();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `demo-maker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showFeedback(lang === 'th' ? 'ดาวน์โหลดไฟล์สำรองข้อมูลเพลงเรียบร้อย' : 'Backup downloaded successfully');
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        const imported = importSongsJSON(content);
        if (imported) {
          setSongs(imported);
          onSelectSong(imported[0]);
          showFeedback(lang === 'th' ? `นำเข้าเพลงสำเร็จ ${imported.length} เพลง` : `Imported ${imported.length} songs`);
        } else {
          alert(lang === 'th' ? 'ไฟล์ไม่ถูกต้อง หรือโครงสร้างเพลงไม่สมบูรณ์ครับ' : 'Invalid backup file or corrupt data.');
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
          <div>
            <h3 className="font-black text-lg text-slate-900 flex items-center gap-2">
              {lang === 'th' ? '📂 สมุดเพลงในเครื่อง (My Songs)' : '📂 My Songs Library'}
            </h3>
            <p className="text-xs text-slate-500">
              {lang === 'th' ? 'บันทึกเพลงของคุณในเครื่อง สลับแต่งหรือทำสำเนาได้หลายเพลง' : 'Stored in browser. Switch, rename, or duplicate your songs.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Feedback alert toast */}
        {feedbackMsg && (
          <div className="px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold shrink-0 animate-in fade-in">
            ✓ {feedbackMsg}
          </div>
        )}

        {/* Song List */}
        <div className="space-y-2.5 overflow-y-auto flex-1 pr-1">
          {songs.map((s) => {
            const isActive = s.id === currentSong.id;
            const barsCount = (s.sections || []).reduce((acc, sec) => acc + (sec.bars?.length || 0), 0);
            const dateStr = s.updatedAt ? new Date(s.updatedAt).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US') : '';

            return (
              <div
                key={s.id}
                onClick={() => handleSelect(s)}
                className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-3 ${
                  isActive
                    ? 'bg-blue-50/70 border-[#1A73E8] shadow-xs'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                }`}
              >
                <div className="flex-1 min-w-0">
                  {editingId === s.id ? (
                    <form onSubmit={(e) => submitRename(s.id, e)} className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        autoFocus
                        className="text-sm font-black text-slate-900 px-2 py-0.5 border border-[#1A73E8] rounded-lg bg-white w-full focus:outline-hidden"
                      />
                      <button
                        type="submit"
                        className="px-2.5 py-1 bg-[#1A73E8] text-white text-xs font-bold rounded-lg whitespace-nowrap cursor-pointer"
                      >
                        {lang === 'th' ? 'บันทึก' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-2 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg cursor-pointer"
                      >
                        {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
                      </button>
                    </form>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm text-slate-900 truncate">
                          {s.title || (lang === 'th' ? 'ไม่มีชื่อเพลง' : 'Untitled Demo')}
                        </span>
                        {isActive && (
                          <span className="px-2 py-0.5 rounded-md bg-[#1A73E8] text-white text-[10px] font-black shrink-0">
                            {lang === 'th' ? 'เปิดอยู่' : 'Active'}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5 flex-wrap">
                        <span>Key {s.baseKey || 'C'}</span>
                        <span>•</span>
                        <span>{s.bpm || 74} BPM</span>
                        <span>•</span>
                        <span>{s.timeSignature || '4/4'}</span>
                        <span>•</span>
                        <span>{barsCount} {lang === 'th' ? 'ห้อง' : 'bars'}</span>
                        {dateStr && (
                          <>
                            <span>•</span>
                            <span className="text-[11px] text-slate-400">{dateStr}</span>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    title={lang === 'th' ? 'เปลี่ยนชื่อเพลง' : 'Rename song'}
                    onClick={(e) => startRename(s.id, s.title, e)}
                    className="p-1.5 rounded-lg hover:bg-slate-200/80 text-slate-600 text-xs font-bold transition cursor-pointer"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    title={lang === 'th' ? 'ทำสำเนาเพลง' : 'Duplicate song'}
                    onClick={(e) => handleDuplicate(s.id, e)}
                    className="p-1.5 rounded-lg hover:bg-slate-200/80 text-slate-600 text-xs font-bold transition cursor-pointer"
                  >
                    📑
                  </button>
                  {songs.length > 1 && (
                    <button
                      type="button"
                      title={lang === 'th' ? 'ลบเพลงนี้' : 'Delete song'}
                      onClick={(e) => handleDelete(s.id, s.title, e)}
                      className="p-1.5 rounded-lg hover:bg-red-100 text-red-600 text-xs font-bold transition cursor-pointer"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-slate-100 space-y-2 shrink-0">
          <button
            onClick={handleCreateNew}
            className="w-full py-2.5 rounded-2xl bg-[#1A73E8] hover:bg-blue-700 text-white font-black text-sm shadow-sm transition cursor-pointer flex items-center justify-center gap-2"
          >
            <span>+</span> {lang === 'th' ? 'สร้างเพลงใหม่ (New Demo)' : 'Create New Demo'}
          </button>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 py-1.5 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs transition cursor-pointer text-center"
            >
              {lang === 'th' ? '📥 นำเข้าไฟล์ (.JSON)' : '📥 Import Backup (.JSON)'}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImportFile}
              accept=".json,application/json"
              className="hidden"
            />
            <button
              onClick={handleExportBackup}
              className="flex-1 py-1.5 px-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs transition cursor-pointer text-center"
            >
              {lang === 'th' ? '💾 สำรองข้อมูลทุกเพลง' : '💾 Export Backup (.JSON)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
