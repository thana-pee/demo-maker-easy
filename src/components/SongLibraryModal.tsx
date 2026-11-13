'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { SongProject, SongSnapshot, SongStatusTag } from '@/types/song';
import { createDefaultSong } from '@/lib/defaultSong';
import {
  getSavedSongs,
  saveSong,
  deleteSong,
  duplicateSong,
  exportAllSongsJSON,
  importSongsJSON,
  extractSongFolders,
  filterLibrarySongs,
  addSnapshotToSong,
  removeSnapshotFromSong,
  restoreSongFromSnapshot,
  updateSongLibraryMeta,
} from '@/lib/storage';
import { useLanguage } from '@/context/LanguageContext';

interface SongLibraryModalProps {
  isOpen: boolean;
  currentSong: SongProject;
  onSelectSong: (song: SongProject) => void;
  onClose: () => void;
}

const STATUS_TAG_META: Record<
  SongStatusTag,
  { labelTh: string; labelEn: string; className: string }
> = {
  draft: {
    labelTh: '📝 Draft',
    labelEn: '📝 Draft',
    className: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  arranged: {
    labelTh: '🎸 Arranged',
    labelEn: '🎸 Arranged',
    className: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  'vocal-recorded': {
    labelTh: '🎤 Vocal',
    labelEn: '🎤 Vocal',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
  },
  mastered: {
    labelTh: '⭐ Mastered',
    labelEn: '⭐ Mastered',
    className: 'bg-amber-50 text-amber-800 border-amber-300',
  },
};

/** รวม vocalAudio ของ currentSong หากแก้ไขเพลงที่กำลังเปิดอยู่ */
function mergeLiveVocalsIfActive(updated: SongProject, currentSong: SongProject): SongProject {
  if (updated.id !== currentSong.id) return updated;
  const vocals = new Map<string, string>();
  for (const sec of currentSong.sections) {
    for (const bar of sec.bars) {
      if (bar.vocalAudio) vocals.set(bar.id, bar.vocalAudio);
    }
  }
  if (vocals.size === 0) return updated;
  return {
    ...updated,
    sections: updated.sections.map((sec) => ({
      ...sec,
      bars: sec.bars.map((bar) =>
        vocals.has(bar.id) ? { ...bar, vocalAudio: vocals.get(bar.id) } : bar
      ),
    })),
  };
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

  // Phase 4C: Search, Folders, Status Tags, Snapshots
  const [searchQuery, setSearchQuery] = useState('');
  const [folderFilter, setFolderFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<SongStatusTag | 'ALL'>('ALL');
  const [customFolders, setCustomFolders] = useState<string[]>([]);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [editingFolderSongId, setEditingFolderSongId] = useState<string | null>(null);
  const [editFolderValue, setEditFolderValue] = useState('');
  const [expandedSnapshotsId, setExpandedSnapshotsId] = useState<string | null>(null);
  const [snapshotNote, setSnapshotNote] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // โหลดรายการเพลงจาก storage เมื่อเปิด modal (ผ่าน callback แบบ async เพื่อเลี่ยง cascading render)
  useEffect(() => {
    if (!isOpen) return;
    const rafId = requestAnimationFrame(() => {
      setSongs(getSavedSongs());
    });
    return () => cancelAnimationFrame(rafId);
  }, [isOpen]);

  const allFolders = useMemo(() => {
    const merged = new Set<string>([...extractSongFolders(songs), ...customFolders]);
    return Array.from(merged).sort((a, b) => a.localeCompare(b));
  }, [songs, customFolders]);

  const filteredSongs = useMemo(
    () => filterLibrarySongs(songs, searchQuery, folderFilter, statusFilter),
    [songs, searchQuery, folderFilter, statusFilter]
  );

  if (!isOpen) return null;

  const showFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 3000);
  };

  const syncAfterUpdate = (updatedSong: SongProject) => {
    setSongs(getSavedSongs());
    if (updatedSong.id === currentSong.id) {
      onSelectSong(mergeLiveVocalsIfActive(updatedSong, currentSong));
    }
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
    if (folderFilter !== 'ALL' && folderFilter !== '__UNFILED__') {
      newSong.folder = folderFilter;
    }
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
      const base = id === currentSong.id ? currentSong : target;
      const updated = { ...base, title: editTitle.trim() };
      saveSong(updated, { setActive: id === currentSong.id });
      syncAfterUpdate(updated);
      showFeedback(lang === 'th' ? `เปลี่ยนชื่อเป็น "${editTitle.trim()}" เรียบร้อย` : `Renamed to "${editTitle.trim()}"`);
    }
    setEditingId(null);
  };

  const handleStatusChange = (song: SongProject, nextStatus: SongStatusTag) => {
    const base = song.id === currentSong.id ? currentSong : song;
    const updated = updateSongLibraryMeta(base, { statusTag: nextStatus });
    syncAfterUpdate(updated);
    const meta = STATUS_TAG_META[nextStatus];
    showFeedback(lang === 'th' ? `อัปเดตสถานะเป็น ${meta.labelTh}` : `Status set to ${meta.labelEn}`);
  };

  const startEditFolder = (song: SongProject, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingFolderSongId(song.id);
    setEditFolderValue(song.folder || '');
  };

  const submitFolderEdit = (song: SongProject, folderValue: string) => {
    const cleaned = folderValue.trim();
    if (cleaned && !allFolders.includes(cleaned)) {
      setCustomFolders((prev) => [...prev, cleaned]);
    }
    const base = song.id === currentSong.id ? currentSong : song;
    const updated = updateSongLibraryMeta(base, { folder: cleaned });
    syncAfterUpdate(updated);
    setEditingFolderSongId(null);
    showFeedback(
      cleaned
        ? lang === 'th' ? `จัดเก็บเข้าโฟลเดอร์ "${cleaned}"` : `Moved to folder "${cleaned}"`
        : lang === 'th' ? 'นำออกจากโฟลเดอร์แล้ว' : 'Removed folder tag'
    );
  };

  const handleCreateCustomFolder = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newFolderName.trim();
    if (!cleaned) return;
    if (!customFolders.includes(cleaned)) {
      setCustomFolders((prev) => [...prev, cleaned]);
    }
    setFolderFilter(cleaned);
    setNewFolderName('');
    setShowNewFolderInput(false);
    showFeedback(lang === 'th' ? `สร้างโฟลเดอร์ "${cleaned}" แล้ว` : `Created folder "${cleaned}"`);
  };

  const handleSaveSnapshot = (song: SongProject, customName?: string) => {
    const base = song.id === currentSong.id ? currentSong : song;
    const { song: updated, snapshot } = addSnapshotToSong(base, customName);
    syncAfterUpdate(updated);
    setSnapshotNote('');
    setExpandedSnapshotsId(song.id);
    showFeedback(
      lang === 'th' ? `บันทึกเวอร์ชัน "${snapshot.name}" แล้ว` : `Saved snapshot "${snapshot.name}"`
    );
  };

  const handleRestoreSnapshot = (song: SongProject, snapshot: SongSnapshot) => {
    const base = song.id === currentSong.id ? currentSong : song;
    const restored = restoreSongFromSnapshot(base, snapshot);
    if (!restored) return;
    saveSong(restored);
    setSongs(getSavedSongs());
    onSelectSong(restored);
    showFeedback(
      lang === 'th' ? `กู้คืนเวอร์ชัน "${snapshot.name}" เรียบร้อย` : `Restored "${snapshot.name}"`
    );
  };

  const handleDeleteSnapshot = (song: SongProject, snapshotId: string) => {
    const base = song.id === currentSong.id ? currentSong : song;
    const updated = removeSnapshotFromSong(base, snapshotId);
    syncAfterUpdate(updated);
    showFeedback(lang === 'th' ? 'ลบเวอร์ชันที่บันทึกแล้ว' : 'Snapshot deleted');
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
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full p-5 sm:p-6 space-y-3.5 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
          <div>
            <h3 className="font-black text-lg text-slate-900 flex items-center gap-2">
              {lang === 'th' ? '📂 สมุดเพลงในเครื่อง (My Songs)' : '📂 My Songs Library'}
            </h3>
            <p className="text-xs text-slate-500">
              {lang === 'th'
                ? 'ค้นหาชื่อเพลงหรือเนื้อร้อง จัดกลุ่มด้วยโฟลเดอร์ สถานะ และบันทึกเวอร์ชัน (Snapshots)'
                : 'Search titles or lyrics, organize folders & status tags, and save version snapshots.'}
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

        {/* Phase 4C: Search & Folder Filters */}
        <div className="space-y-2 shrink-0">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                lang === 'th'
                  ? 'ค้นหาจากชื่อเพลง หรือท่อนเนื้อร้อง...'
                  : 'Search by song title or lyrics...'
              }
              className="w-full pl-8 pr-8 py-2 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white text-xs sm:text-sm focus:outline-none focus:border-[#1A73E8] focus:ring-2 focus:ring-blue-100"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setFolderFilter('ALL')}
              className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition cursor-pointer border ${
                folderFilter === 'ALL'
                  ? 'bg-[#1A73E8] text-white border-[#1A73E8]'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              {lang === 'th' ? `ทั้งหมด (${songs.length})` : `All (${songs.length})`}
            </button>

            {allFolders.map((folder) => {
              const count = songs.filter((s) => s.folder?.trim() === folder).length;
              return (
                <button
                  key={folder}
                  type="button"
                  onClick={() => setFolderFilter(folder)}
                  className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition cursor-pointer border ${
                    folderFilter === folder
                      ? 'bg-[#1A73E8] text-white border-[#1A73E8]'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  📁 {folder} ({count})
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setShowNewFolderInput((v) => !v)}
              className="px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap bg-blue-50 hover:bg-blue-100 text-[#1A73E8] border border-blue-200 transition cursor-pointer"
            >
              + {lang === 'th' ? 'โฟลเดอร์' : 'Folder'}
            </button>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap transition cursor-pointer border ${
                statusFilter === 'ALL'
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {lang === 'th' ? 'ทุกสถานะ' : 'All Status'}
            </button>
            {(Object.keys(STATUS_TAG_META) as SongStatusTag[]).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap transition cursor-pointer border ${
                  statusFilter === st
                    ? 'bg-slate-800 text-white border-slate-800'
                    : `${STATUS_TAG_META[st].className} opacity-80 hover:opacity-100`
                }`}
              >
                {lang === 'th' ? STATUS_TAG_META[st].labelTh : STATUS_TAG_META[st].labelEn}
              </button>
            ))}
          </div>

          {showNewFolderInput && (
            <form onSubmit={handleCreateCustomFolder} className="flex gap-1.5 animate-in fade-in">
              <input
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder={lang === 'th' ? 'ชื่อโฟลเดอร์ / อัลบั้มใหม่...' : 'New folder / album name...'}
                autoFocus
                className="flex-1 px-3 py-1.5 rounded-xl border border-blue-300 text-xs focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-xl bg-[#1A73E8] text-white text-xs font-bold cursor-pointer"
              >
                {lang === 'th' ? 'สร้าง' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => setShowNewFolderInput(false)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </form>
          )}
        </div>

        {/* Song List */}
        <div className="space-y-2.5 overflow-y-auto flex-1 pr-1">
          {filteredSongs.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400 font-medium border border-dashed border-slate-200 rounded-2xl">
              {lang === 'th' ? 'ไม่พบเพลงที่ตรงกับคำค้นหาหรือโฟลเดอร์นี้' : 'No songs match your search or folder filter.'}
            </div>
          ) : (
            filteredSongs.map((s) => {
              const isActive = s.id === currentSong.id;
              const displaySong = isActive ? currentSong : s;
              const barsCount = (displaySong.sections || []).reduce((acc, sec) => acc + (sec.bars?.length || 0), 0);
              const dateStr = displaySong.updatedAt
                ? new Date(displaySong.updatedAt).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US')
                : '';
              const statusTag: SongStatusTag = displaySong.statusTag || 'draft';
              const statusMeta = STATUS_TAG_META[statusTag];
              const snapshots = displaySong.snapshots || [];
              const isSnapsExpanded = expandedSnapshotsId === displaySong.id;

              return (
                <div
                  key={displaySong.id}
                  onClick={() => handleSelect(displaySong)}
                  className={`p-3.5 rounded-2xl border transition cursor-pointer space-y-2.5 ${
                    isActive
                      ? 'bg-blue-50/70 border-[#1A73E8] shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex-1 min-w-0">
                      {editingId === displaySong.id ? (
                        <form
                          onSubmit={(e) => submitRename(displaySong.id, e)}
                          className="flex items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
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
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-sm text-slate-900 truncate">
                              {displaySong.title || (lang === 'th' ? 'ไม่มีชื่อเพลง' : 'Untitled Demo')}
                            </span>
                            {isActive && (
                              <span className="px-2 py-0.5 rounded-md bg-[#1A73E8] text-white text-[10px] font-black shrink-0">
                                {lang === 'th' ? 'เปิดอยู่' : 'Active'}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span>Key {displaySong.baseKey || 'C'}</span>
                            <span>•</span>
                            <span>{displaySong.bpm || 74} BPM</span>
                            <span>•</span>
                            <span>{displaySong.timeSignature || '4/4'}</span>
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
                        onClick={(e) => startRename(displaySong.id, displaySong.title, e)}
                        className="p-1.5 rounded-lg hover:bg-slate-200/80 text-slate-600 text-xs font-bold transition cursor-pointer"
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        title={lang === 'th' ? 'ทำสำเนาเพลง' : 'Duplicate song'}
                        onClick={(e) => handleDuplicate(displaySong.id, e)}
                        className="p-1.5 rounded-lg hover:bg-slate-200/80 text-slate-600 text-xs font-bold transition cursor-pointer"
                      >
                        📑
                      </button>
                      {songs.length > 1 && (
                        <button
                          type="button"
                          title={lang === 'th' ? 'ลบเพลงนี้' : 'Delete song'}
                          onClick={(e) => handleDelete(displaySong.id, displaySong.title, e)}
                          className="p-1.5 rounded-lg hover:bg-red-100 text-red-600 text-xs font-bold transition cursor-pointer"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Metadata Row: Status Tag Pill, Editable Folder Badge & Snapshot Triggers */}
                  <div
                    className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-slate-100/80"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {/* Status Tag Selector Pill */}
                      <select
                        aria-label={lang === 'th' ? 'สถานะเพลง' : 'Song Status'}
                        value={statusTag}
                        onChange={(e) => handleStatusChange(displaySong, e.target.value as SongStatusTag)}
                        className={`text-[11px] font-bold px-2 py-1 rounded-full border cursor-pointer focus:outline-none ${statusMeta.className}`}
                      >
                        {(Object.keys(STATUS_TAG_META) as SongStatusTag[]).map((key) => (
                          <option key={key} value={key} className="bg-white text-slate-900">
                            {lang === 'th' ? STATUS_TAG_META[key].labelTh : STATUS_TAG_META[key].labelEn}
                          </option>
                        ))}
                      </select>

                      {/* Editable Folder Tag */}
                      {editingFolderSongId === displaySong.id ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            submitFolderEdit(displaySong, editFolderValue);
                          }}
                          className="flex items-center gap-1"
                        >
                          <input
                            type="text"
                            list={`folders-${displaySong.id}`}
                            value={editFolderValue}
                            onChange={(e) => setEditFolderValue(e.target.value)}
                            placeholder={lang === 'th' ? 'ชื่อโฟลเดอร์...' : 'Folder name...'}
                            autoFocus
                            className="w-28 px-2 py-0.5 rounded-lg border border-blue-300 text-[11px] bg-white focus:outline-none"
                          />
                          <datalist id={`folders-${displaySong.id}`}>
                            {allFolders.map((f) => (
                              <option key={f} value={f} />
                            ))}
                          </datalist>
                          <button
                            type="submit"
                            className="px-2 py-0.5 rounded-md bg-[#1A73E8] text-white text-[10px] font-bold cursor-pointer"
                          >
                            OK
                          </button>
                          <button
                            type="button"
                            onClick={() => submitFolderEdit(displaySong, '')}
                            title={lang === 'th' ? 'ล้างโฟลเดอร์' : 'Clear folder'}
                            className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold cursor-pointer"
                          >
                            ✕
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => startEditFolder(displaySong, e)}
                          className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border transition cursor-pointer ${
                            displaySong.folder
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : 'bg-slate-50 text-slate-500 border-dashed border-slate-300 hover:border-blue-300 hover:text-blue-600'
                          }`}
                        >
                          {displaySong.folder
                            ? `📁 ${displaySong.folder}`
                            : lang === 'th'
                            ? '+ โฟลเดอร์'
                            : '+ Folder'}
                        </button>
                      )}
                    </div>

                    {/* Snapshots Triggers (Save on Active song, Expand list when available) */}
                    <div className="flex items-center gap-1.5">
                      {isActive && (
                        <button
                          type="button"
                          onClick={() => handleSaveSnapshot(displaySong, snapshotNote)}
                          className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition cursor-pointer"
                        >
                          📸 Save Snapshot
                        </button>
                      )}
                      {(isActive || snapshots.length > 0) && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedSnapshotsId((prev) =>
                              prev === displaySong.id ? null : displaySong.id
                            )
                          }
                          className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                        >
                          🕒 {lang === 'th' ? 'เวอร์ชัน' : 'Versions'} ({snapshots.length}) {isSnapsExpanded ? '▲' : '▼'}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Collapsible Version Snapshots Panel */}
                  {isSnapsExpanded && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="pt-2 border-t border-slate-200/70 space-y-2 animate-in fade-in"
                    >
                      {isActive && (
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={snapshotNote}
                            onChange={(e) => setSnapshotNote(e.target.value)}
                            placeholder={
                              lang === 'th'
                                ? 'ชื่อเวอร์ชัน (เช่น ก่อนปรับท่อนฮุก)...'
                                : 'Version label (optional)...'
                            }
                            className="flex-1 px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] bg-white focus:outline-none focus:border-[#1A73E8]"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveSnapshot(displaySong, snapshotNote)}
                            className="px-2.5 py-1 rounded-lg bg-[#1A73E8] text-white text-[11px] font-bold cursor-pointer whitespace-nowrap"
                          >
                            📸 {lang === 'th' ? 'บันทึก' : 'Save'}
                          </button>
                        </div>
                      )}

                      {snapshots.length === 0 ? (
                        <p className="text-[11px] text-slate-400 text-center py-1">
                          {lang === 'th'
                            ? 'ยังไม่มีเวอร์ชันที่บันทึกไว้ กด 📸 Save Snapshot เพื่อเก็บจุดย้อนกลับ'
                            : 'No snapshots yet. Tap Save Snapshot to bookmark this version.'}
                        </p>
                      ) : (
                        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
                          {snapshots.map((snap) => {
                            const snapDate = new Date(snap.createdAt).toLocaleString(
                              lang === 'th' ? 'th-TH' : 'en-US',
                              { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
                            );
                            return (
                              <div
                                key={snap.id}
                                className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs"
                              >
                                <div className="min-w-0">
                                  <div className="font-bold text-slate-800 truncate">{snap.name}</div>
                                  <div className="text-[10px] text-slate-400">{snapDate}</div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleRestoreSnapshot(displaySong, snap)}
                                    className="px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1A73E8] font-bold text-[11px] transition cursor-pointer"
                                  >
                                    {lang === 'th' ? 'กู้คืน (Restore Version)' : 'Restore Version'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSnapshot(displaySong, snap.id)}
                                    className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-[11px] transition cursor-pointer"
                                    title="Delete Snapshot"
                                  >
                                    {lang === 'th' ? 'ลบ' : 'Delete Snapshot'}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
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
